import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { abrirBancoDeTeste, type BancoDeTeste } from "./ajuda.js";
import { registrarUsoIa } from "../usoIa.js";
import { usoIa } from "../esquema.js";

let ctx: BancoDeTeste;

beforeEach(async () => {
  ctx = await abrirBancoDeTeste();
});
afterEach(async () => {
  await ctx.fechar();
});

const linhas = async () =>
  (await ctx.db.select().from(usoIa)).sort((a, b) =>
    `${a.dia}${a.operacao}`.localeCompare(`${b.dia}${b.operacao}`),
  );

describe("uso da IA por dia", () => {
  it("soma chamadas, falhas e tokens do mesmo dia e operação numa linha só", async () => {
    const agora = new Date("2026-10-15T12:00:00Z");
    await registrarUsoIa(ctx.db, { operacao: "experiencia", ok: true, tokensEntrada: 800, tokensSaida: 120 }, agora);
    await registrarUsoIa(ctx.db, { operacao: "experiencia", ok: false, tokensEntrada: 1600, tokensSaida: 240 }, agora);

    expect(await linhas()).toEqual([
      { dia: "2026-10-15", operacao: "experiencia", chamadas: 2, falhas: 1, tokensEntrada: 2400, tokensSaida: 360 },
    ]);
  });

  it("separa operações e dias — o dia é o de UTC, o mesmo do teto diário", async () => {
    // 22h em Brasília já é o dia seguinte em UTC.
    await registrarUsoIa(ctx.db, { operacao: "habilidades", ok: true, tokensEntrada: 300, tokensSaida: 90 }, new Date("2026-10-15T20:00:00Z"));
    await registrarUsoIa(ctx.db, { operacao: "habilidades", ok: true, tokensEntrada: 300, tokensSaida: 90 }, new Date("2026-10-16T01:00:00Z"));
    await registrarUsoIa(ctx.db, { operacao: "experiencia", ok: true, tokensEntrada: 500, tokensSaida: 100 }, new Date("2026-10-16T01:00:00Z"));

    expect((await linhas()).map((l) => `${l.dia} ${l.operacao} ${l.chamadas}`)).toEqual([
      "2026-10-15 habilidades 1",
      "2026-10-16 experiencia 1",
      "2026-10-16 habilidades 1",
    ]);
  });

  it("chamadas simultâneas somam todas, nenhuma sobrescreve a outra", async () => {
    // O PGlite serializa, então isto prova a instrução, não a concorrência;
    // a mesma forma (INSERT … ON CONFLICT DO UPDATE) foi medida em Postgres
    // real para os contadores de limite.
    const agora = new Date("2026-10-15T12:00:00Z");
    await Promise.all(
      Array.from({ length: 20 }, () =>
        registrarUsoIa(ctx.db, { operacao: "experiencia", ok: true, tokensEntrada: 10, tokensSaida: 1 }, agora),
      ),
    );
    const [linha] = await linhas();
    expect(linha).toMatchObject({ chamadas: 20, tokensEntrada: 200, tokensSaida: 20 });
  });
});
