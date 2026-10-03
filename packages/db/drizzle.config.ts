/*
 * A referência existe para o EDITOR, não para o build.
 *
 * Este arquivo mora na raiz do pacote, fora do `include` do `tsconfig.json`
 * (que é o config de build e só alcança `src/`, por causa do `rootDir`). O
 * `tsconfig.typecheck.json` o inclui e pede `types: ["node"]`, então
 * `pnpm run verificar` sempre passou — mas o editor, que escolhe o
 * `tsconfig.json` mais próximo e não encontra o arquivo nele, o analisa num
 * projeto inferido sem essa opção, e acusa `process` como nome inexistente.
 *
 * A referência torna o arquivo autossuficiente em qualquer um dos dois
 * caminhos. A alternativa seria inverter a convenção dos configs deste pacote
 * (um `tsconfig.build.json` à parte), o que resolveria o mesmo problema ao
 * custo de deixar `packages/db` diferente dos outros quatro pacotes.
 */
/// <reference types="node" />

import type { Config } from "drizzle-kit";

/**
 * Configuração do drizzle-kit, para INSPECIONAR o banco e comparar com o
 * schema. As migrações são escritas à mão em migrations/ — ver o comentário
 * em 0000_inicial.sql.
 */
export default {
  schema: "./src/esquema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env["DATABASE_URL"] ?? "postgres://localhost:5432/cvexpress",
  },
} satisfies Config;
