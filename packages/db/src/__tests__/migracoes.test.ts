import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
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

describe("0003 — compile_jobs sai", () => {
  const tabelas = async (pg: PGlite) =>
    (
      await pg.query<{ t: string }>(
        `SELECT table_name AS t FROM information_schema.tables
          WHERE table_schema = 'public' ORDER BY 1`,
      )
    ).rows.map((r) => r.t);

  it("um banco novo termina sem a tabela", async () => {
    const pg = new PGlite();
    await aplicarMigracoes((sql) => pg.exec(sql));
    expect(await tabelas(pg)).toEqual(["cv_sessions", "limites_envio", "magic_links"]);
    await pg.close();
  });

  it("um banco que já a tinha perde só ela — sessões e links ficam", async () => {
    // O caso de produção: o banco existe desde a 0000. Se o DROP levasse
    // algo junto (um CASCADE para o lado errado), seria aqui que apareceria.
    const pg = new PGlite();
    const ate0002 = MIGRACOES.filter((m) => m < "0003");
    for (const nome of ate0002) {
      await pg.exec(readFileSync(join(CAMINHO_MIGRACOES, nome), "utf8"));
    }
    await pg.exec(`
      INSERT INTO cv_sessions (id, data, criado_em, atualizado_em, expira_em)
        VALUES ('s1', '{}', now(), now(), now() + interval '1 day');
      INSERT INTO compile_jobs (id, session_id, status, content_hash, template_id, template_versao)
        VALUES ('j1', 's1', 'concluido', 'h', 'classico', '1.0.0');
    `);
    expect(await tabelas(pg)).toContain("compile_jobs");

    await aplicarMigracoes((sql) => pg.exec(sql));

    expect(await tabelas(pg)).not.toContain("compile_jobs");
    expect((await pg.query("SELECT id FROM cv_sessions")).rows).toEqual([{ id: "s1" }]);
    await pg.close();
  });
});
