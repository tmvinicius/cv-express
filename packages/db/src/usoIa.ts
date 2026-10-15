import { sql } from "drizzle-orm";
import { usoIa } from "./esquema.js";
import type { Executor } from "./limites.js";

/**
 * O uso da IA, somado por dia (UTC) e por operação. Ver a migração 0004.
 *
 * Uma instrução só, `INSERT … ON CONFLICT DO UPDATE`: duas chamadas
 * simultâneas no mesmo dia somam as duas, em vez de uma sobrescrever a outra.
 */

export type OperacaoIa = "experiencia" | "habilidades";

export interface RegistroUsoIa {
  operacao: OperacaoIa;
  /** A chamada terminou com uma sugestão utilizável? */
  ok: boolean;
  tokensEntrada: number;
  tokensSaida: number;
}

export async function registrarUsoIa(
  db: Executor,
  registro: RegistroUsoIa,
  agora: Date = new Date(),
): Promise<void> {
  const dia = agora.toISOString().slice(0, 10);
  const falha = registro.ok ? 0 : 1;

  await db
    .insert(usoIa)
    .values({
      dia,
      operacao: registro.operacao,
      chamadas: 1,
      falhas: falha,
      tokensEntrada: registro.tokensEntrada,
      tokensSaida: registro.tokensSaida,
    })
    .onConflictDoUpdate({
      target: [usoIa.dia, usoIa.operacao],
      set: {
        chamadas: sql`${usoIa.chamadas} + 1`,
        falhas: sql`${usoIa.falhas} + ${falha}`,
        tokensEntrada: sql`${usoIa.tokensEntrada} + ${registro.tokensEntrada}`,
        tokensSaida: sql`${usoIa.tokensSaida} + ${registro.tokensSaida}`,
      },
    });
}
