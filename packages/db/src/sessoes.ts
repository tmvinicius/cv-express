import { eq, lt } from "drizzle-orm";
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

  const novaValidade = new Date(agora.getTime() + VALIDADE_SESSAO_MS);
  await db
    .update(cvSessions)
    .set({ expiraEm: novaValidade, atualizadoEm: agora })
    .where(eq(cvSessions.id, id));

  return { ...linha, expiraEm: novaValidade, atualizadoEm: agora } as Sessao;
}

/**
 * Grava o currículo. É o autosave de cada etapa do formulário.
 *
 * Devolve `false` quando a sessão não existe ou expirou, em vez de lançar:
 * o autosave roda em segundo plano e uma aba esquecida aberta por semanas é
 * cenário esperado, não excepcional.
 */
export async function salvarCv(
  db: Banco,
  id: string,
  data: CvData,
  agora: Date = new Date(),
): Promise<boolean> {
  const afetadas = await db
    .update(cvSessions)
    .set({
      data,
      atualizadoEm: agora,
      expiraEm: new Date(agora.getTime() + VALIDADE_SESSAO_MS),
    })
    .where(eq(cvSessions.id, id))
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
