import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Acesso às migrações a partir do próprio pacote.
 *
 * Quem precisa aplicar a migração — os testes daqui, os testes do app web, um
 * runner de deploy — não deveria adivinhar o caminho do arquivo. Antes, cada
 * consumidor resolvia por conta própria, e o do app web quebrou porque
 * `package.json` não está em `exports`.
 *
 * Funciona tanto rodando de `src/` (vitest) quanto de `dist/` (compilado):
 * nos dois casos o arquivo está um nível acima, na raiz do pacote.
 */
const AQUI = path.dirname(fileURLToPath(import.meta.url));

export const CAMINHO_MIGRACOES = path.resolve(AQUI, "..", "migrations");

export const MIGRACOES = ["0000_inicial.sql"] as const;

/** Lê as migrações em ordem, para quem vai aplicá-las. */
export function lerMigracoes(): { nome: string; sql: string }[] {
  return MIGRACOES.map((nome) => ({
    nome,
    sql: fs.readFileSync(path.join(CAMINHO_MIGRACOES, nome), "utf8"),
  }));
}

/**
 * Aplica todas as migrações usando o executor recebido.
 *
 * Recebe o executor por parâmetro em vez de abrir conexão: serve igual para o
 * PGlite dos testes e para um cliente `pg` de produção, sem o pacote precisar
 * saber qual dos dois está em uso.
 */
export async function aplicarMigracoes(
  executar: (sql: string) => Promise<unknown>,
): Promise<void> {
  for (const { sql } of lerMigracoes()) {
    await executar(sql);
  }
}
