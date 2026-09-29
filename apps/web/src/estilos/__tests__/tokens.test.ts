import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CLARO, ESCURO, type Tema } from "../paleta";

const css = readFileSync(join(__dirname, "..", "tokens.css"), "utf8");

/**
 * A paleta existe duas vezes: como dado em paleta.ts (para o teste de
 * contraste poder lê-la) e como variável em tokens.css (para o navegador).
 *
 * Duplicação é dívida, e esta se paga com este arquivo. Sem ele, alguém
 * ajusta uma cor no CSS, o teste de contraste continua verde — porque está
 * medindo o TypeScript, que ninguém vê — e a interface fica reprovada em AA
 * com a suíte inteira passando. É o pior defeito possível: silencioso e com
 * a prova apontando para o lado errado.
 */

/** `bordaForte` → `--cor-borda-forte` */
function nomeDaVariavel(chave: string): string {
  return `--cor-${chave.replace(/[A-Z]/g, (l) => `-${l.toLowerCase()}`)}`;
}

/** Lê o bloco `:root` da raiz ou o de dentro do @media do tema escuro. */
function lerBloco(escuro: boolean): Map<string, string> {
  const fonte = escuro ? css.slice(css.indexOf("prefers-color-scheme: dark")) : css;
  const corpo = fonte.slice(fonte.indexOf("{") + 1);

  const valores = new Map<string, string>();
  for (const [, nome, valor] of corpo.matchAll(/(--cor-[a-z-]+)\s*:\s*(#[0-9A-Fa-f]{6})\s*;/g)) {
    if (!valores.has(nome!)) valores.set(nome!, valor!.toUpperCase());
  }
  return valores;
}

describe("tokens.css e paleta.ts não podem divergir", () => {
  for (const [nomeTema, tema, escuro] of [
    ["claro", CLARO, false],
    ["escuro", ESCURO, true],
  ] as const) {
    describe(`tema ${nomeTema}`, () => {
      const doCss = lerBloco(escuro);

      for (const [chave, valor] of Object.entries(tema) as [keyof Tema, string][]) {
        const variavel = nomeDaVariavel(chave);

        it(`${variavel} = ${valor}`, () => {
          expect(
            doCss.get(variavel),
            `${variavel} no CSS não bate com ${chave} em paleta.ts`,
          ).toBe(valor);
        });
      }

      it("o CSS não declara cor que a paleta desconheça", () => {
        // O outro sentido da divergência: uma variável órfã no CSS é uma cor
        // que nenhum teste de contraste jamais mediu.
        const esperadas = new Set(Object.keys(tema).map(nomeDaVariavel));
        for (const nome of doCss.keys()) {
          expect(esperadas.has(nome), `${nome} existe no CSS mas não em paleta.ts`).toBe(true);
        }
      });
    });
  }
});

describe("tokens além das cores", () => {
  it("define a pilha de fontes do sistema, sem webfont", () => {
    // Uma webfont é uma requisição bloqueante no primeiro carregamento, e
    // boa parte do público entra pelo celular em rede ruim.
    expect(css).toMatch(/--fonte:\s*system-ui/);
    expect(css).not.toMatch(/@import\s+url|fonts\.googleapis/);
  });

  it("define o alvo de toque de 44px exigido pelo WCAG 2.5.5", () => {
    expect(css).toMatch(/--alvo-toque:\s*44px/);
  });

  it("declara color-scheme nos dois temas", () => {
    // Sem isto o navegador pinta a barra de rolagem e os controles nativos
    // no esquema errado — fundo escuro com scrollbar branca.
    expect(css).toMatch(/color-scheme:\s*light/);
    expect(css).toMatch(/color-scheme:\s*dark/);
  });
});
