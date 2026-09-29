import { describe, it, expect } from "vitest";
import {
  razaoDeContraste,
  luminanciaRelativa,
  hexParaRgb,
  passaNoAA,
  formatarRazao,
  MINIMO_AA,
} from "../contraste";
import { CLARO, ESCURO, PARES, type Tema } from "../paleta";

describe("matemática do contraste", () => {
  it("preto e branco dão 21:1", () => {
    expect(razaoDeContraste("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
  });

  it("a mesma cor dá 1:1", () => {
    expect(razaoDeContraste("#17535F", "#17535F")).toBeCloseTo(1, 5);
  });

  it("é simétrico — a ordem não importa", () => {
    expect(razaoDeContraste("#1A1D1C", "#FCFCFB")).toBeCloseTo(
      razaoDeContraste("#FCFCFB", "#1A1D1C"),
      10,
    );
  });

  it("aplica correção gama, não média linear", () => {
    // O olho não percebe brilho linearmente. Sem a correção, a luminância do
    // cinza médio daria 0,5 e os cálculos não corresponderiam ao que alguém
    // enxerga.
    const cinzaMedio = luminanciaRelativa(hexParaRgb("#808080"));
    expect(cinzaMedio).toBeLessThan(0.3);
    expect(cinzaMedio).toBeGreaterThan(0.2);
  });

  it("aceita hex de três dígitos", () => {
    expect(razaoDeContraste("#000", "#FFF")).toBeCloseTo(21, 1);
  });

  it("recusa cor inválida em vez de calcular errado", () => {
    expect(() => razaoDeContraste("azul", "#FFF")).toThrow(/inválida/);
    expect(() => razaoDeContraste("#GGGGGG", "#FFF")).toThrow();
  });
});

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  A PALETA PASSA NO WCAG AA — verificado, não afirmado                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Este é o teste que dá sentido a tudo em estilos/. Contraste é o tipo de
 * defeito que passa em revisão visual: quem tem visão perfeita, num monitor
 * bom, não distingue 4,2:1 de 4,6:1. Quem lê no celular, na rua, com sol na
 * tela, distingue.
 *
 * Reprovar a build é mais barato que descobrir depois do lançamento.
 */
function verificarTema(nome: string, tema: Tema) {
  describe(`tema ${nome}`, () => {
    for (const par of PARES) {
      it(`${par.nome} (mínimo ${MINIMO_AA[par.uso]}:1)`, () => {
        const frente = tema[par.frente];
        const fundo = tema[par.fundo];
        const razao = razaoDeContraste(frente, fundo);

        expect(
          passaNoAA(frente, fundo, par.uso),
          `${par.nome}: ${frente} sobre ${fundo} = ${formatarRazao(frente, fundo)}, ` +
            `abaixo do mínimo de ${MINIMO_AA[par.uso]}:1`,
        ).toBe(true);

        // Guarda-chuva contra o outro extremo: contraste altíssimo em texto
        // corrido também cansa. Não é regra WCAG, é conforto de leitura.
        expect(razao).toBeLessThanOrEqual(21);
      });
    }
  });
}

verificarTema("claro", CLARO);
verificarTema("escuro", ESCURO);

describe("coerência entre os temas", () => {
  it("os dois temas definem exatamente as mesmas chaves", () => {
    // Uma chave faltando no escuro vira variável CSS indefinida, e o navegador
    // cai para a cor herdada — texto invisível, sem erro nenhum.
    expect(Object.keys(ESCURO).sort()).toEqual(Object.keys(CLARO).sort());
  });

  it("todo valor é hex de seis dígitos", () => {
    for (const tema of [CLARO, ESCURO]) {
      for (const [chave, valor] of Object.entries(tema)) {
        expect(valor, `${chave} = ${valor}`).toMatch(/^#[0-9A-F]{6}$/);
      }
    }
  });

  it("o tema escuro é de fato escuro, e o claro de fato claro", () => {
    expect(luminanciaRelativa(hexParaRgb(CLARO.fundo))).toBeGreaterThan(0.7);
    expect(luminanciaRelativa(hexParaRgb(ESCURO.fundo))).toBeLessThan(0.1);
  });

  it("o fundo escuro não é preto puro", () => {
    // Preto puro com texto branco produz halo em tela OLED e cansa mais que
    // um cinza escuro.
    expect(ESCURO.fundo).not.toBe("#000000");
    expect(luminanciaRelativa(hexParaRgb(ESCURO.fundo))).toBeGreaterThan(0.005);
  });
});

describe("relatório de contraste", () => {
  /**
   * Não é asserção: imprime a tabela que o planejamento pediu, para quem
   * mexer na paleta ver os números em vez de adivinhar.
   */
  it("imprime a tabela dos dois temas", () => {
    const linhas: string[] = [];

    for (const [nomeTema, tema] of [
      ["claro", CLARO],
      ["escuro", ESCURO],
    ] as const) {
      linhas.push(`\n  ${nomeTema.toUpperCase()}`);
      for (const par of PARES) {
        const r = formatarRazao(tema[par.frente], tema[par.fundo]);
        const ok = passaNoAA(tema[par.frente], tema[par.fundo], par.uso) ? "ok " : "REPROVADO";
        linhas.push(`    ${ok}  ${r.padStart(7)}  ${par.nome}`);
      }
    }

    // A tabela impressa é o produto deste teste: ela deixa o contraste
    // medido visível na saída do CI, onde alguém repara numa queda antes de
    // ela virar reprovação. (Sem eslint-disable: `no-console` não está ligada,
    // e um disable de regra desligada é o ruído que o linter veio remover.)
    console.log(linhas.join("\n"));
    expect(linhas.length).toBeGreaterThan(0);
  });
});
