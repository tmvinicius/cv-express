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
