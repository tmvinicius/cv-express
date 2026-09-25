import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { esquema } from "../esquema.js";
import { aplicarMigracoes } from "../migracoes.js";
import type { Banco } from "../conexao.js";

/**
 * Banco de teste: Postgres de verdade, em memória.
 *
 * PGlite é o Postgres compilado para WebAssembly. Não é um simulador nem um
 * banco em memória com SQL parecido — é o mesmo motor, então CHECK
 * constraints, CASCADE, JSONB, `timestamptz` e `RETURNING` se comportam
 * exatamente como em produção.
 *
 * Isso importa mais do que parece neste projeto: o uso único do link mágico
 * depende de um UPDATE condicional decidido pelo banco, e a exclusão em
 * cascata depende de chave estrangeira. Um dublê em memória aprovaria os dois
 * sem provar nada.
 *
 * E, diferente do LaTeX e dos adapters de IA, aqui não há dívida de
 * verificação: estes testes exercitam o SQL real.
 */

export interface BancoDeTeste {
  db: Banco;
  fechar: () => Promise<void>;
}

export async function abrirBancoDeTeste(): Promise<BancoDeTeste> {
  const pglite = new PGlite();

  // A MESMA migração que roda em produção. Se o .sql quebrar, quebra aqui —
  // que é o ponto de aplicar o arquivo real em vez de recriar as tabelas.
  await aplicarMigracoes((sql) => pglite.exec(sql));

  // O PGlite é compatível na superfície que consumimos; o cast mantém os
  // repositórios tipados sobre o driver de produção, sem variante para teste.
  const db = drizzle(pglite, { schema: esquema }) as unknown as Banco;

  return {
    db,
    fechar: () => pglite.close(),
  };
}

/** Avança o relógio sem esperar de verdade. */
export function daquiA(ms: number, base: Date = new Date()): Date {
  return new Date(base.getTime() + ms);
}
