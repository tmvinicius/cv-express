import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { novoCv, type CvData } from "@cv-express/schema";
import { cvSessions } from "./esquema.js";
import type { Banco } from "./conexao.js";
import { VALIDADE_SESSAO_MS } from "./linkMagico.js";

/**
 * Sessões de currículo.
 *
 * Note o que NÃO existe aqui: criar usuário, autenticar, listar currículos de
 * alguém. O produto é anônimo — quem tem o id da sessão tem a sessão. O id é
 * opaco e imprevisível, que é a mesma propriedade de segurança de um link
 * não listado.
 */

export interface Sessao {
  id: string;
  data: CvData;
  email: string | null;
  criadoEm: Date;
  atualizadoEm: Date;
  expiraEm: Date;
  /** Quando a pessoa clicou "Concluir e salvar" pela primeira vez. */
  concluidoEm: Date | null;
}

export async function criarSessao(
  db: Banco,
  agora: Date = new Date(),
): Promise<Sessao> {
  const id = nanoid(21);
  const cv = novoCv(id, agora);

  const [linha] = await db
    .insert(cvSessions)
    .values({
      id,
      data: cv,
      criadoEm: agora,
      atualizadoEm: agora,
      expiraEm: new Date(agora.getTime() + VALIDADE_SESSAO_MS),
    })
    .returning();

  return linha as Sessao;
}

/**
 * Busca uma sessão e RENOVA a validade.
 *
 * A renovação no acesso é o que faz a retenção ser "30 dias sem uso" e não
 * "30 dias desde a criação". Quem volta ao currículo toda semana nunca perde
 * o trabalho — apagar o rascunho de alguém que está usando o produto seria
 * um defeito grave, e do tipo que só aparece um mês depois do lançamento.
 *
 * Sessão expirada é tratada como inexistente, mesmo que a linha ainda esteja
 * no banco: o expurgo roda uma vez por dia, e até lá ela não deve responder.
 */
export async function buscarSessao(
  db: Banco,
  id: string,
  agora: Date = new Date(),
): Promise<Sessao | null> {
  const [linha] = await db
    .select()
    .from(cvSessions)
    .where(eq(cvSessions.id, id))
    .limit(1);

  if (!linha) return null;
  if (linha.expiraEm.getTime() <= agora.getTime()) return null;

  // Sessão concluída tem prazo FIXO: ler não renova. É o prazo que a pessoa
  // leu no e-mail, e acessar o currículo não pode comprar dias a mais.
  if (linha.concluidoEm !== null) return linha as Sessao;

  // `concluido_em IS NULL` também na cláusula: se a conclusão acontecer entre
  // a leitura acima e esta escrita, a renovação não a desfaz.
  const novaValidade = new Date(agora.getTime() + VALIDADE_SESSAO_MS);
  await db
    .update(cvSessions)
    .set({ expiraEm: novaValidade, atualizadoEm: agora })
    .where(and(eq(cvSessions.id, id), isNull(cvSessions.concluidoEm)));

  return { ...linha, expiraEm: novaValidade, atualizadoEm: agora } as Sessao;
}

/**
 * A sessão existe e está no prazo? Sem ler o currículo e sem renovar nada.
 *
 * É a porta das operações que custam: a ajuda da IA (dinheiro) e a
 * compilação (CPU do worker). As duas recebiam um `sessionId` do navegador e
 * confiavam nele, então qualquer cota por sessão se contornava inventando um
 * id novo a cada pedido. Exigir uma sessão que EXISTE faz o atacante pagar o
 * preço de criar uma — e criar tem o seu próprio limite por origem.
 *
 * Não é `buscarSessao` por dois motivos: aquela traz o JSONB inteiro, e
 * RENOVA o prazo. Quem chama isto quer só um sim ou não; o uso de verdade
 * (abrir a página, o autosave) é que renova.
 */
export async function sessaoAtiva(
  db: Banco,
  id: string,
  agora: Date = new Date(),
): Promise<boolean> {
  const [linha] = await db
    .select({ id: cvSessions.id })
    .from(cvSessions)
    .where(and(eq(cvSessions.id, id), gt(cvSessions.expiraEm, agora)))
    .limit(1);

  return linha !== undefined;
}

/**
 * Grava o currículo. É o autosave de cada etapa do formulário.
 *
 * Devolve `false` quando a sessão não existe ou expirou, em vez de lançar:
 * o autosave roda em segundo plano e uma aba esquecida aberta por semanas é
 * cenário esperado, não excepcional.
 *
 * Duas regras que o prazo de 5 dias depende delas:
 *
 * - Sessão VENCIDA não aceita gravação. Antes, a cláusula era só o id: uma
 *   aba aberta depois do prazo gravava e ainda empurrava a validade 30 dias
 *   para a frente — ressuscitando, até o expurgo, um currículo que já devia
 *   ter acabado.
 * - Sessão CONCLUÍDA grava sem renovar. O `CASE` decide no banco, na mesma
 *   instrução, para não haver janela entre ler o estado e escrever.
 */
export async function salvarCv(
  db: Banco,
  id: string,
  data: CvData,
  agora: Date = new Date(),
): Promise<boolean> {
  const renovada = new Date(agora.getTime() + VALIDADE_SESSAO_MS).toISOString();

  const afetadas = await db
    .update(cvSessions)
    .set({
      data,
      atualizadoEm: agora,
      expiraEm: sql`CASE WHEN ${cvSessions.concluidoEm} IS NULL
                      THEN ${renovada}::timestamptz
                      ELSE ${cvSessions.expiraEm} END`,
    })
    .where(and(eq(cvSessions.id, id), gt(cvSessions.expiraEm, agora)))
    .returning({ id: cvSessions.id });

  return afetadas.length > 0;
}

/**
 * Apaga a sessão e tudo que depende dela.
 *
 * É o botão "apagar meus dados agora" exigido pela LGPD (seção 5.3 do
 * planejamento). O CASCADE das chaves estrangeiras leva junto links mágicos
 * e jobs de compilação — nada de resto órfão.
 */
export async function apagarSessao(db: Banco, id: string): Promise<boolean> {
  const apagadas = await db
    .delete(cvSessions)
    .where(eq(cvSessions.id, id))
    .returning({ id: cvSessions.id });

  return apagadas.length > 0;
}

/**
 * Expurgo das sessões vencidas. Roda uma vez por dia.
 *
 * Devolve quantas foram apagadas, para o log — uma queda brusca ou um número
 * absurdo é sinal de que algo mudou no fluxo de renovação.
 */
export async function expurgarExpiradas(
  db: Banco,
  agora: Date = new Date(),
): Promise<number> {
  const apagadas = await db
    .delete(cvSessions)
    .where(lt(cvSessions.expiraEm, agora))
    .returning({ id: cvSessions.id });

  return apagadas.length;
}
