import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { esquema } from "./esquema.js";

/**
 * O tipo que todo repositório recebe.
 *
 * Tipado sobre o driver do node-postgres, que é o de produção. O PGlite usado
 * nos testes é compatível na superfície que consumimos (select, insert,
 * update, delete, transaction), então os testes exercitam o MESMO código —
 * não uma variante para teste.
 */
export type Banco = NodePgDatabase<typeof esquema>;

/**
 * Conexão de produção.
 *
 * `pg` é dependência opcional: o pacote é importável por quem só precisa do
 * schema e dos tipos (o app web em tempo de build, por exemplo) sem arrastar
 * um driver de banco junto.
 */
export async function criarConexao(urlBanco: string): Promise<Banco> {
  const { Pool } = await import("pg");

  const pool = new Pool({
    connectionString: urlBanco,
    // Serverless abre e fecha conexão o tempo todo; um pool grande esgota o
    // limite do Postgres antes de ajudar em qualquer coisa.
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  return drizzlePg(pool, { schema: esquema });
}
