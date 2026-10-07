import { createHash } from "node:crypto";
import { lt, sql } from "drizzle-orm";
import { limitesEnvio } from "./esquema.js";
import type { Banco } from "./conexao.js";

/**
 * Limite de envio por janela fixa de tempo.
 *
 * Nasceu para o "Concluir e salvar", que dispara e-mail para o endereço que a
 * pessoa digitou: o teto de 5 links por sessão não basta, porque quem cria
 * sessões novas dispara e-mails para endereços quaisquer e o nosso domínio
 * vira remetente de spam. Hoje conta também a IA, a compilação e as sessões
 * novas (ver `apps/web/src/acoes/cotas.ts`); a tabela manteve o nome
 * `limites_envio` porque renomear exigiria migração sem ganho nenhum.
 *
 * JANELA FIXA, e não deslizante. A deslizante é mais precisa, mas exige
 * guardar cada evento; a fixa é uma linha por (chave, janela) e um único
 * `INSERT … ON CONFLICT` atômico. O custo conhecido: na virada da janela, um
 * atacante consegue até o dobro do limite em sequência. Para conter abuso de
 * e-mail, isso é aceitável — o objetivo é tornar o abuso caro, não impossível.
 */

/** Qualquer coisa que execute SQL: o banco ou uma transação aberta nele. */
export type Executor = Pick<Banco, "insert">;

export interface Regra {
  /** Duração da janela. */
  janelaMs: number;
  /** Quantos eventos cabem numa janela. */
  maximo: number;
}

/**
 * A chave do contador, com hash.
 *
 * IP e e-mail são dados pessoais, e este contador não precisa de nenhum dos
 * dois em claro — só de saber se dois pedidos vieram do mesmo lugar. O hash
 * de um IPv4 é reversível por força bruta (são 4 bilhões de possibilidades);
 * a proteção real é a retenção curta: o expurgo diário apaga as janelas
 * encerradas.
 */
export function chaveDeLimite(tipo: string, valor: string): string {
  const normalizado = valor.trim().toLowerCase();
  return `${tipo}:${createHash("sha256").update(normalizado).digest("hex")}`;
}

/**
 * Conta mais um evento e diz se ele cabe no limite.
 *
 * Um único `INSERT … ON CONFLICT DO UPDATE … RETURNING`: o banco incrementa e
 * devolve o valor novo na mesma instrução. Ler, somar e gravar em passos
 * separados deixaria passar pedidos simultâneos acima do limite.
 *
 * O evento recusado também conta — quem insiste continua recusado até a
 * janela virar.
 */
export async function consumirLimite(
  db: Executor,
  chave: string,
  regra: Regra,
  agora: Date = new Date(),
): Promise<boolean> {
  const inicio = new Date(Math.floor(agora.getTime() / regra.janelaMs) * regra.janelaMs);

  const [linha] = await db
    .insert(limitesEnvio)
    .values({ chave, janelaInicio: inicio, contagem: 1 })
    .onConflictDoUpdate({
      target: [limitesEnvio.chave, limitesEnvio.janelaInicio],
      set: { contagem: sql`${limitesEnvio.contagem} + 1` },
    })
    .returning({ contagem: limitesEnvio.contagem });

  return (linha?.contagem ?? Infinity) <= regra.maximo;
}

/**
 * Por quanto tempo um contador fica no banco. Exportado porque a página de
 * privacidade declara este prazo — e o lê daqui, em vez de repetir o número.
 */
export const RETENCAO_LIMITES_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * Apaga contadores de janelas que já terminaram há mais de um dia.
 *
 * Um dia de folga, e não zero: a maior janela em uso é de 24h, e apagar uma
 * janela ainda aberta zeraria o limite de quem está no meio dela.
 */
export async function expurgarLimites(db: Banco, agora: Date = new Date()): Promise<number> {
  const corte = new Date(agora.getTime() - RETENCAO_LIMITES_MS);
  const apagadas = await db
    .delete(limitesEnvio)
    .where(lt(limitesEnvio.janelaInicio, corte))
    .returning({ chave: limitesEnvio.chave });
  return apagadas.length;
}
