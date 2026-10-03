import { randomBytes, createHash } from "node:crypto";
import { and, count, eq, gt, isNull } from "drizzle-orm";
import { magicLinks, cvSessions } from "./esquema.js";
import type { Banco } from "./conexao.js";
import type { Executor } from "./limites.js";

/**
 * Link mágico: voltar ao currículo concluído sem senha.
 *
 * O produto é anônimo por decisão da V1. Ao clicar "Concluir e salvar", a
 * pessoa recebe por e-mail um link que a traz de volta ao currículo para
 * editar, durante 5 dias.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DIVERGE DO PLANEJAMENTO, que previa link de USO ÚNICO com validade de 7
 * dias. A regra agora é do mantenedor: o MESMO link vale quantas vezes a
 * pessoa quiser, até 5 dias depois da primeira conclusão, e o prazo não
 * renova com edição.
 *
 * O custo dessa escolha, registrado para quem reabrir a discussão: um link
 * reutilizável é uma chave enquanto valer. Se o e-mail for encaminhado ou a
 * caixa vazar, quem tiver o link edita o currículo até o prazo. O que limita
 * esse risco:
 *
 *   - o prazo é curto e FIXO — nenhum uso o estende;
 *   - trocar o e-mail revoga o link anterior, que pode ter ido para a caixa
 *     de outra pessoa;
 *   - o banco guarda só o hash do token, então um dump não entrega acesso.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * O prazo vale para a SESSÃO, não só para o link. O endereço `/cv/<id>` é ele
 * mesmo uma chave; se só o link expirasse em 5 dias, quem guardasse o
 * endereço continuaria editando por 30. Link e sessão terminam no mesmo
 * instante, e o expurgo diário apaga a sessão depois disso.
 */

/** Bytes de entropia. 32 bytes = 256 bits. */
const BYTES_TOKEN = 32;

/** Prazo depois da PRIMEIRA conclusão. Não renova. */
export const PRAZO_APOS_CONCLUSAO_MS = 5 * 24 * 60 * 60 * 1000;

/** Retenção do rascunho: 30 dias sem acesso, renovados a cada uso. */
export const VALIDADE_SESSAO_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Teto de links por sessão.
 *
 * Cada troca de e-mail gera um envio novo. Sem teto, uma única sessão vira um
 * disparador de e-mail para qualquer endereço — o tipo de abuso que derruba a
 * reputação do remetente e faz os e-mails legítimos caírem no spam. Cinco
 * cobre quem errou o endereço uma ou duas vezes.
 */
export const MAXIMO_LINKS_POR_SESSAO = 5;

/**
 * Gera o token que vai no e-mail.
 *
 * base64url em vez de hex: mesma entropia em 43 caracteres no lugar de 64.
 * Um link mais curto sobrevive melhor à quebra de linha que clientes de
 * e-mail aplicam — e link quebrado é ticket de suporte.
 */
export function gerarToken(): string {
  return randomBytes(BYTES_TOKEN).toString("base64url");
}

/**
 * Hash do token, como fica no banco.
 *
 * SHA-256 sem sal, de propósito. Sal existe para atrapalhar tabela arco-íris
 * contra segredos de baixa entropia — senhas escolhidas por gente. Aqui o
 * segredo tem 256 bits de aleatoriedade: não há dicionário que o alcance, e
 * o sal só acrescentaria uma coluna sem defender de nada.
 *
 * Pelo mesmo motivo não usamos bcrypt ou argon2: eles são lentos por
 * desenho, para encarecer força bruta contra senha humana. Contra 256 bits
 * aleatórios, a lentidão só atrasaria o resgate legítimo.
 */
export function hashDoToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Comparação de e-mail: maiúscula e espaço não fazem endereço diferente. */
function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type ResultadoConclusao =
  /** Link novo: o token precisa ser ENVIADO. Ele não é persistido. */
  | { ok: true; envio: "novo"; token: string; expiraEm: Date }
  /** Este endereço já recebeu o link, que continua valendo. Nada a enviar. */
  | { ok: true; envio: "ja_enviado"; expiraEm: Date }
  | { ok: false; motivo: "sessao_inexistente" | "limite_de_envios" | "envio_bloqueado" };

export interface OpcoesConclusao {
  /**
   * Chamado só quando um e-mail NOVO vai sair, dentro da transação e antes de
   * qualquer escrita. Devolver `false` cancela a conclusão inteira.
   *
   * É onde o app aplica o limite por IP e por destinatário. O lugar é
   * deliberado: antes, um "já enviado" (que não manda nada) gastaria cota;
   * depois, um envio bloqueado já teria disparado o prazo de 5 dias de uma
   * sessão para a qual nenhum link saiu.
   */
  permitirEnvio?: (tx: Executor) => Promise<boolean>;
}

/**
 * "Concluir e salvar": fixa o prazo da sessão e prepara o link.
 *
 * Três casos, e o terceiro é o que a regra do mantenedor mais exige:
 *
 * 1. PRIMEIRA conclusão: o prazo passa a ser agora + 5 dias, fixo, e nasce o
 *    link que vai no e-mail.
 * 2. Concluir de novo, MESMO e-mail, com link valendo: nada muda. O link que
 *    a pessoa já tem continua sendo o link, e o prazo continua o mesmo — é a
 *    regra "o link não reseta".
 * 3. Concluir de novo com OUTRO e-mail: o link anterior é revogado (ele pode
 *    ter ido parar na caixa de outra pessoa, e lá seria uma chave) e um novo
 *    vai para o endereço novo — com o MESMO prazo. Trocar o e-mail não
 *    compra dias a mais.
 *
 * O banco guarda só o hash, então não há como reenviar o mesmo token: no
 * caso 2 simplesmente não se envia nada.
 *
 * `FOR UPDATE` serializa conclusões simultâneas da mesma sessão. Sem ele, um
 * duplo clique passaria duas vezes pela verificação do caso 2 e mandaria dois
 * e-mails com dois links diferentes.
 */
export async function concluirSessao(
  db: Banco,
  sessionId: string,
  email: string,
  agora: Date = new Date(),
  opcoes: OpcoesConclusao = {},
): Promise<ResultadoConclusao> {
  return db.transaction(async (tx): Promise<ResultadoConclusao> => {
    const [sessao] = await tx
      .select()
      .from(cvSessions)
      .where(eq(cvSessions.id, sessionId))
      .for("update");

    if (!sessao || sessao.expiraEm.getTime() <= agora.getTime()) {
      return { ok: false, motivo: "sessao_inexistente" };
    }

    // A âncora é a PRIMEIRA conclusão, e ela nunca é sobrescrita.
    const inicio = sessao.concluidoEm ?? agora;
    const prazo = new Date(inicio.getTime() + PRAZO_APOS_CONCLUSAO_MS);

    const ativos = await tx
      .select({ tokenHash: magicLinks.tokenHash })
      .from(magicLinks)
      .where(
        and(
          eq(magicLinks.sessionId, sessionId),
          isNull(magicLinks.revogadoEm),
          gt(magicLinks.expiraEm, agora),
        ),
      );

    const mesmoEmail =
      sessao.email !== null && normalizarEmail(sessao.email) === normalizarEmail(email);

    if (sessao.concluidoEm !== null && mesmoEmail && ativos.length > 0) {
      return { ok: true, envio: "ja_enviado", expiraEm: prazo };
    }

    const [contagem] = await tx
      .select({ total: count() })
      .from(magicLinks)
      .where(eq(magicLinks.sessionId, sessionId));

    if ((contagem?.total ?? 0) >= MAXIMO_LINKS_POR_SESSAO) {
      return { ok: false, motivo: "limite_de_envios" };
    }

    if (opcoes.permitirEnvio && !(await opcoes.permitirEnvio(tx))) {
      return { ok: false, motivo: "envio_bloqueado" };
    }

    await tx
      .update(magicLinks)
      .set({ revogadoEm: agora })
      .where(and(eq(magicLinks.sessionId, sessionId), isNull(magicLinks.revogadoEm)));

    const token = gerarToken();
    await tx.insert(magicLinks).values({
      tokenHash: hashDoToken(token),
      sessionId,
      criadoEm: agora,
      expiraEm: prazo,
    });

    await tx
      .update(cvSessions)
      .set({
        concluidoEm: inicio,
        expiraEm: prazo,
        email: email.trim(),
        atualizadoEm: agora,
      })
      .where(eq(cvSessions.id, sessionId));

    return { ok: true, envio: "novo", token, expiraEm: prazo };
  });
}

/**
 * Revoga um link cujo e-mail não chegou a sair.
 *
 * Sem isto, uma falha do provedor de e-mail deixaria um link "ativo" que
 * ninguém recebeu, e o próximo clique em "Concluir e salvar" responderia "já
 * enviamos" — a pessoa ficaria sem link e sem como pedir outro. Revogado, o
 * próximo clique gera e envia um novo, com o mesmo prazo.
 *
 * O prazo da sessão NÃO volta atrás: ele começou no primeiro clique.
 */
export async function revogarLink(
  db: Banco,
  token: string,
  agora: Date = new Date(),
): Promise<void> {
  await db
    .update(magicLinks)
    .set({ revogadoEm: agora })
    .where(eq(magicLinks.tokenHash, hashDoToken(token)));
}

export type ResultadoResgate =
  | { ok: true; sessionId: string; expiraEm: Date }
  | { ok: false; motivo: "invalido" | "expirado" | "revogado" };

/**
 * Resgata um token e devolve a sessão.
 *
 * REUTILIZÁVEL: o mesmo link funciona quantas vezes a pessoa quiser até o
 * prazo. E o resgate NÃO renova nada — nem o link, nem a sessão. É a regra
 * "o link não reseta": quem concluiu hoje e editou amanhã continua com o
 * prazo de hoje + 5 dias.
 *
 * A busca é PELO HASH: o token bruto nunca chega ao banco, nem em log de
 * query.
 *
 * O motivo da recusa é devolvido para a interface poder explicar — "este link
 * expirou" e "enviamos um link mais novo" pedem textos diferentes. Não há
 * risco em distinguir: quem apresenta um token já sabe o token.
 */
export async function resgatarLinkMagico(
  db: Banco,
  token: string,
  agora: Date = new Date(),
): Promise<ResultadoResgate> {
  const hash = hashDoToken(token);

  const [link] = await db
    .select()
    .from(magicLinks)
    .where(eq(magicLinks.tokenHash, hash))
    .limit(1);

  if (!link) return { ok: false, motivo: "invalido" };
  if (link.revogadoEm !== null) return { ok: false, motivo: "revogado" };
  if (link.expiraEm.getTime() <= agora.getTime()) return { ok: false, motivo: "expirado" };

  await db
    .update(magicLinks)
    .set({ ultimoUsoEm: agora })
    .where(eq(magicLinks.tokenHash, hash));

  return { ok: true, sessionId: link.sessionId, expiraEm: link.expiraEm };
}

/** Links válidos de uma sessão. Usado em testes e em investigação de suporte. */
export async function linksAtivos(
  db: Banco,
  sessionId: string,
  agora: Date = new Date(),
) {
  return db
    .select()
    .from(magicLinks)
    .where(
      and(
        eq(magicLinks.sessionId, sessionId),
        isNull(magicLinks.revogadoEm),
        gt(magicLinks.expiraEm, agora),
      ),
    );
}
