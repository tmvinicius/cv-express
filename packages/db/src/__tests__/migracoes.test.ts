import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

import { CAMINHO_MIGRACOES, MIGRACOES, aplicarMigracoes } from "../migracoes.js";

/**
 * As duas regras de que o `pnpm migrar` depende.
 *
 * O script não guarda "quais já rodaram": aplica todas, sempre. Isso só é
 * seguro enquanto estas duas propriedades valerem — e por isso elas são
 * teste, e não convenção.
 */
describe("migrações", () => {
  it("todo .sql da pasta está na lista — nenhum fica esquecido", () => {
    // Um arquivo na pasta e fora de MIGRACOES nunca roda em lugar nenhum,
    // nem nos testes: a tabela nova só falta em produção.
    const naPasta = readdirSync(CAMINHO_MIGRACOES)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    expect([...MIGRACOES].sort()).toEqual(naPasta);
  });

  it("estão em ordem e numeradas sem buraco", () => {
    MIGRACOES.forEach((nome, i) => {
      expect(nome.startsWith(String(i).padStart(4, "0") + "_")).toBe(true);
    });
  });

  it("aplicar tudo DUAS vezes não quebra nem muda nada", async () => {
    // É o que `pnpm migrar` faz a cada atualização. Migração que não for
    // idempotente reprova aqui, e não no banco de produção.
    const pg = new PGlite();
    const esquema = async () =>
      (
        await pg.query<{ c: string }>(
          `SELECT table_name || '.' || column_name || ':' || data_type AS c
             FROM information_schema.columns
            WHERE table_schema = 'public'
            ORDER BY 1`,
        )
      ).rows.map((r) => r.c);

    await aplicarMigracoes((sql) => pg.exec(sql));
    const primeira = await esquema();
    await aplicarMigracoes((sql) => pg.exec(sql));

    expect(await esquema()).toEqual(primeira);
    expect(primeira.length).toBeGreaterThan(0);
    await pg.close();
  });
});
