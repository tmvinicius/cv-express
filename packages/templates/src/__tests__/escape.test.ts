import { describe, it, expect } from "vitest";
import {
  escapeLatex,
  escapeLatexParagrafos,
  confiarComoLatex,
  juntarLatex,
} from "../escape.js";
import { sanitizarTexto, colapsarLinhas } from "../sanitizar.js";

describe("escapeLatex — comportamento normal", () => {
  it("deixa texto comum intacto", () => {
    expect(escapeLatex("Desenvolvedora Backend")).toBe("Desenvolvedora Backend");
  });

  it("preserva acentuação do português sem alteração", () => {
    // O requisito central do projeto: acento é texto normal no LaTeX com
    // UTF-8, e mexer nele quebraria exatamente o que precisa funcionar.
    const texto = "João Conceição d'Ávila — Analista Sênior (Ação & Gestão)";
    expect(escapeLatex(texto)).toBe(
      "João Conceição d'Ávila — Analista Sênior (Ação \\& Gestão)",
    );
  });

  it("escapa cada caractere especial na forma correta", () => {
    expect(escapeLatex("\\")).toBe("\\textbackslash{}");
    expect(escapeLatex("{")).toBe("\\{");
    expect(escapeLatex("}")).toBe("\\}");
    expect(escapeLatex("$")).toBe("\\$");
    expect(escapeLatex("&")).toBe("\\&");
    expect(escapeLatex("#")).toBe("\\#");
    expect(escapeLatex("^")).toBe("\\textasciicircum{}");
    expect(escapeLatex("_")).toBe("\\_");
    expect(escapeLatex("~")).toBe("\\textasciitilde{}");
    expect(escapeLatex("%")).toBe("\\%");
  });

  it("usa macro, e não contrabarra, para ~ e ^", () => {
    // \~ e \^ são acentos: aplicariam-se à letra seguinte em vez de imprimir
    // o símbolo. "~n" viraria "ñ".
    expect(escapeLatex("~n")).toBe("\\textasciitilde{}n");
    expect(escapeLatex("^o")).toBe("\\textasciicircum{}o");
  });

  it("não escapa em cascata os contrabarras que introduz", () => {
    // Uma passagem só. Se fossem passagens sucessivas, o \ de
    // \textbackslash{} seria reescapado.
    expect(escapeLatex("a\\b")).toBe("a\\textbackslash{}b");
    expect(escapeLatex("\\\\")).toBe("\\textbackslash{}\\textbackslash{}");
  });

  it("trata string vazia", () => {
    expect(escapeLatex("")).toBe("");
  });

  it("é determinístico — requisito do cache por contentHash", () => {
    const entrada = "Gestão de 5 pessoas & R$ 2M em orçamento (100% da meta)";
    const primeira = escapeLatex(entrada);
    for (let i = 0; i < 20; i++) {
      expect(escapeLatex(entrada)).toBe(primeira);
    }
  });

  it("produz a mesma saída para acento precomposto e decomposto", () => {
    // Windows e macOS entregam formas Unicode diferentes para o mesmo texto
    // visível. Sem NFC, o mesmo currículo geraria bytes diferentes conforme
    // a máquina do usuário, e o cache de compilação nunca acertaria.
    const precomposto = "café"; // é
    const decomposto = "café"; // e + acento combinante

    expect(precomposto).not.toBe(decomposto);
    expect(escapeLatex(precomposto)).toBe(escapeLatex(decomposto));
  });
});

describe("escapeLatexParagrafos", () => {
  it("preserva a separação de parágrafos", () => {
    expect(escapeLatexParagrafos("Primeiro.\n\nSegundo.")).toBe(
      "Primeiro.\n\nSegundo.",
    );
  });

  it("colapsa quebras excessivas", () => {
    // Enter apertado seis vezes não é pedido de seis parágrafos.
    expect(escapeLatexParagrafos("Primeiro.\n\n\n\n\nSegundo.")).toBe(
      "Primeiro.\n\nSegundo.",
    );
  });

  it("remove espaço em branco das pontas", () => {
    expect(escapeLatexParagrafos("\n\n  Texto.  \n\n")).toBe("Texto.");
  });

  it("escapa igual ao escapeLatex", () => {
    expect(escapeLatexParagrafos("100% & cia")).toBe("100\\% \\& cia");
  });
});

describe("sanitizarTexto", () => {
  it("normaliza CRLF do Windows para LF", () => {
    expect(sanitizarTexto("a\r\nb")).toBe("a\nb");
    expect(sanitizarTexto("a\rb")).toBe("a\nb");
  });

  it("aplica NFC", () => {
    expect(sanitizarTexto("café")).toBe("café");
  });
});

describe("colapsarLinhas", () => {
  it("mantém parágrafo duplo e colapsa o excesso", () => {
    expect(colapsarLinhas("a\n\nb")).toBe("a\n\nb");
    expect(colapsarLinhas("a\n\n\n\nb")).toBe("a\n\nb");
  });

  it("mantém quebra simples", () => {
    expect(colapsarLinhas("a\nb")).toBe("a\nb");
  });
});

describe("composição de texto seguro", () => {
  it("juntarLatex concatena partes escapadas", () => {
    const partes = [escapeLatex("Ana"), escapeLatex("& Cia")];
    expect(juntarLatex(partes, " ")).toBe("Ana \\& Cia");
  });

  it("confiarComoLatex não escapa — é para literal do projeto", () => {
    expect(confiarComoLatex("\\cvSecao{Experiência}")).toBe(
      "\\cvSecao{Experiência}",
    );
  });

  /**
   * O tipo marcado é a rede de proteção: o motor de templates aceita apenas
   * TextoLatex, então passar uma string crua vira erro de compilação, e não
   * uma falha silenciosa em produção. O teste abaixo documenta a intenção —
   * a verificação real acontece no `pnpm typecheck`.
   */
  it("o tipo marcado impede concatenar texto cru (verificado pelo typecheck)", () => {
    const seguro = escapeLatex("Ana & Cia");
    // @ts-expect-error string crua não é atribuível a TextoLatex
    const invalido: ReturnType<typeof escapeLatex> = "texto cru \\input{x}";
    expect(typeof invalido).toBe("string");
    expect(seguro).toBe("Ana \\& Cia");
  });
});
