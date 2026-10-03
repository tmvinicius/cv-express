import type { Banco } from "./conexao.js";
import { expurgarExpiradas } from "./sessoes.js";
import { expurgarLimites } from "./limites.js";

export interface ResultadoExpurgo {
  /** Sessões vencidas apagadas — com links e jobs, pelo CASCADE. */
  sessoes: number;
  /** Contadores de limite de janelas já encerradas. */
  limites: number;
}

/**
 * O expurgo que roda uma vez por dia.
 *
 * Até aqui, `expurgarExpiradas` existia, tinha teste e ninguém a chamava:
 * sessão vencida ficava inacessível, mas o currículo — nome, e-mail,
 * histórico profissional — continuava no banco para sempre. A retenção
 * declarada (30 dias sem uso; 5 dias depois de concluído) só é verdade se
 * alguém apagar.
 *
 * Quem chama é a rota `/api/tarefas/expurgo` do app web, agendada pelo
 * Vercel Cron. Uma função só, para o agendador ter um ponto de entrada e um
 * número no log.
 */
export async function expurgoDiario(db: Banco, agora: Date = new Date()): Promise<ResultadoExpurgo> {
  const sessoes = await expurgarExpiradas(db, agora);
  const limites = await expurgarLimites(db, agora);
  return { sessoes, limites };
}
