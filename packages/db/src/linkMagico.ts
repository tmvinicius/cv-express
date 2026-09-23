import { randomBytes, createHash } from "node:crypto";
import { and, eq, isNull, gt } from "drizzle-orm";
import { magicLinks, cvSessions } from "./esquema.js";
import type { Banco } from "./conexao.js";

/**
 * Link mágico: retomar a sessão sem senha.
 *
 * O produto é anônimo por decisão da V1. O link mágico é o meio-termo do
 * planejamento — a pessoa volta ao currículo sem criar conta.
 *
 * Três propriedades de segurança, cada uma com seu motivo:
 *
 * 1. O banco guarda só o HASH do token. Quem ler o banco não entra em sessão
 *    nenhuma. Mesma razão pela qual senha não se guarda em claro.
 * 2. USO ÚNICO. O token viaja por e-mail, que fica arquivado na caixa da
 *    pessoa e passa por servidores intermediários. Um token reutilizável
 *    seria uma senha permanente escrita em texto puro num e-mail.
 * 3. VALIDADE CURTA (7 dias), menor que a da sessão (30 dias). Um e-mail
 *    antigo deixa de ser chave muito antes de o currículo sumir.
 */

/** Bytes de entropia. 32 bytes = 256 bits. */
const BYTES_TOKEN = 32;

export const VALIDADE_LINK_MS = 7 * 24 * 60 * 60 * 1000;
export const VALIDADE_SESSAO_MS = 30 * 24 * 60 * 60 * 1000;

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

export interface LinkCriado {
  /** Vai no e-mail. Não é persistido em lugar nenhum. */
  token: string;
  expiraEm: Date;
}

/**
 * Cria um link para uma sessão existente.
 *
 * Invalida os links anteriores da mesma sessão. Se a pessoa pediu um link
 * novo, o antigo não deve mais servir — e-mails acumulam na caixa de
 * entrada, e o mais recente é o que ela tem em mãos.
 */
export async function criarLinkMagico(
  db: Banco,
  sessionId: string,
  email: string,
  agora: Date = new Date(),
): Promise<LinkCriado> {
  const token = gerarToken();
  const expiraEm = new Date(agora.getTime() + VALIDADE_LINK_MS);

  await db.transaction(async (tx) => {
    // Marcar como usados, em vez de apagar: preserva o rastro de que
    // existiram, útil para investigar suporte ou abuso.
    await tx
      .update(magicLinks)
      .set({ usadoEm: agora })
      .where(and(eq(magicLinks.sessionId, sessionId), isNull(magicLinks.usadoEm)));

    await tx.insert(magicLinks).values({
      tokenHash: hashDoToken(token),
      sessionId,
      expiraEm,
      criadoEm: agora,
    });

    // O e-mail só passa a existir quando a pessoa pede o link.
    await tx
      .update(cvSessions)
      .set({ email, atualizadoEm: agora })
      .where(eq(cvSessions.id, sessionId));
  });

  return { token, expiraEm };
}

export type ResultadoResgate =
  | { ok: true; sessionId: string }
  | { ok: false; motivo: "invalido" | "expirado" | "ja_usado" };

/**
 * Resgata um token e devolve a sessão.
 *
 * A busca é PELO HASH: recebemos o token, calculamos o hash e consultamos.
 * O token bruto nunca chega ao banco, nem em log de query.
 *
 * O motivo da recusa é devolvido para a interface poder explicar — "esse
 * link já foi usado" e "esse link expirou" pedem textos diferentes, e um
 * "link inválido" genérico deixa a pessoa sem saber o que fazer. Não há
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
  if (link.usadoEm !== null) return { ok: false, motivo: "ja_usado" };
  if (link.expiraEm.getTime() <= agora.getTime()) {
    return { ok: false, motivo: "expirado" };
  }

  /**
   * O UPDATE condicional é o que garante o uso único de verdade.
   *
   * Ler e depois gravar tem janela de corrida: dois cliques no mesmo link,
   * ou duas abas, passariam os dois pela checagem antes de qualquer um
   * gravar. Com `usado_em IS NULL` na cláusula WHERE, o banco decide, e só
   * uma das transações afeta linha.
   */
  const marcados = await db
    .update(magicLinks)
    .set({ usadoEm: agora })
    .where(and(eq(magicLinks.tokenHash, hash), isNull(magicLinks.usadoEm)))
    .returning({ sessionId: magicLinks.sessionId });

  if (marcados.length === 0) {
    // Outra requisição venceu a corrida.
    return { ok: false, motivo: "ja_usado" };
  }

  // Resgatar é acessar: renova a validade da sessão.
  const novaValidade = new Date(agora.getTime() + VALIDADE_SESSAO_MS);
  await db
    .update(cvSessions)
    .set({ expiraEm: novaValidade, atualizadoEm: agora })
    .where(eq(cvSessions.id, link.sessionId));

  return { ok: true, sessionId: link.sessionId };
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
        isNull(magicLinks.usadoEm),
        gt(magicLinks.expiraEm, agora),
      ),
    );
}
