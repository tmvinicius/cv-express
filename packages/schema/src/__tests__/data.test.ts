import { describe, it, expect } from "vitest";
import {
  periodoSchema,
  dataMesAnoSchema,
  compararPeriodo,
  ordenarPorPeriodoDesc,
  emMeses,
  ATUAL,
  LIMITES,
  anoMaximo,
} from "../index.js";

describe("dataMesAno", () => {
  it("aceita meses de 1 a 12", () => {
    expect(dataMesAnoSchema.safeParse({ ano: 2024, mes: 1 }).success).toBe(true);
    expect(dataMesAnoSchema.safeParse({ ano: 2024, mes: 12 }).success).toBe(true);
  });

  it("rejeita mês 0 — a convenção é humana (1-12), não a do JavaScript", () => {
    expect(dataMesAnoSchema.safeParse({ ano: 2024, mes: 0 }).success).toBe(false);
    expect(dataMesAnoSchema.safeParse({ ano: 2024, mes: 13 }).success).toBe(false);
  });

  it("rejeita ano fora da faixa plausível", () => {
    expect(
      dataMesAnoSchema.safeParse({ ano: LIMITES.ANO_MIN - 1, mes: 6 }).success,
    ).toBe(false);
    expect(
      dataMesAnoSchema.safeParse({ ano: anoMaximo() + 1, mes: 6 }).success,
    ).toBe(false);
  });

  it("rejeita mês fracionário", () => {
    expect(dataMesAnoSchema.safeParse({ ano: 2024, mes: 6.5 }).success).toBe(false);
  });
});

describe("periodo", () => {
  it("aceita fim posterior ao início", () => {
    const r = periodoSchema.safeParse({
      inicio: { ano: 2020, mes: 1 },
      fim: { ano: 2024, mes: 6 },
    });
    expect(r.success).toBe(true);
  });

  it("aceita início e fim no mesmo mês", () => {
    const r = periodoSchema.safeParse({
      inicio: { ano: 2024, mes: 6 },
      fim: { ano: 2024, mes: 6 },
    });
    expect(r.success).toBe(true);
  });

  it("aceita 'atual' como fim", () => {
    const r = periodoSchema.safeParse({
      inicio: { ano: 2020, mes: 1 },
      fim: ATUAL,
    });
    expect(r.success).toBe(true);
  });

  it("rejeita período invertido", () => {
    const r = periodoSchema.safeParse({
      inicio: { ano: 2024, mes: 6 },
      fim: { ano: 2020, mes: 1 },
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.path).toEqual(["fim"]);
    }
  });

  it("rejeita inversão dentro do mesmo ano", () => {
    const r = periodoSchema.safeParse({
      inicio: { ano: 2024, mes: 8 },
      fim: { ano: 2024, mes: 3 },
    });
    expect(r.success).toBe(false);
  });
});

describe("compararPeriodo", () => {
  it("trata 'atual' como o mais recente", () => {
    expect(compararPeriodo(ATUAL, { ano: 2030, mes: 12 })).toBeGreaterThan(0);
    expect(compararPeriodo({ ano: 2030, mes: 12 }, ATUAL)).toBeLessThan(0);
    expect(compararPeriodo(ATUAL, ATUAL)).toBe(0);
  });

  it("compara corretamente através da virada de ano", () => {
    expect(
      compararPeriodo({ ano: 2024, mes: 1 }, { ano: 2023, mes: 12 }),
    ).toBeGreaterThan(0);
  });

  it("emMeses produz inteiros comparáveis", () => {
    expect(emMeses({ ano: 2024, mes: 1 })).toBeLessThan(emMeses({ ano: 2024, mes: 2 }));
  });
});

describe("ordenarPorPeriodoDesc", () => {
  const p = (inicio: [number, number], fim: [number, number] | "atual") => ({
    periodo: {
      inicio: { ano: inicio[0], mes: inicio[1] },
      fim: fim === "atual" ? ATUAL : { ano: fim[0], mes: fim[1] },
    },
  });

  it("coloca o emprego atual primeiro", () => {
    const itens = [
      { nome: "antigo", ...p([2015, 1], [2018, 12]) },
      { nome: "atual", ...p([2022, 3], "atual") },
      { nome: "meio", ...p([2019, 1], [2022, 2]) },
    ];
    expect(ordenarPorPeriodoDesc(itens).map((i) => i.nome)).toEqual([
      "atual",
      "meio",
      "antigo",
    ]);
  });

  it("desempata pelo início — garante saída determinística", () => {
    // Dois cargos terminados no mesmo mês. Sem o desempate, a ordem
    // dependeria da ordem de entrada, e o contentHash mudaria sem o
    // conteúdo mudar — quebrando o cache de compilação.
    const itens = [
      { nome: "curto", ...p([2023, 1], [2024, 6]) },
      { nome: "longo", ...p([2020, 1], [2024, 6]) },
    ];
    expect(ordenarPorPeriodoDesc(itens).map((i) => i.nome)).toEqual([
      "curto",
      "longo",
    ]);

    // E a ordem de entrada invertida produz o mesmo resultado.
    expect(ordenarPorPeriodoDesc([...itens].reverse()).map((i) => i.nome)).toEqual([
      "curto",
      "longo",
    ]);
  });

  it("não modifica o array original", () => {
    const itens = [p([2015, 1], [2018, 12]), p([2022, 3], "atual")];
    const copia = [...itens];
    ordenarPorPeriodoDesc(itens);
    expect(itens).toEqual(copia);
  });
});
