import { describe, it, expect } from "vitest";
import { renderizar, compilar, ErroDeTemplate } from "../motor/renderizar.js";

describe("interpolação", () => {
  it("escapa todo valor interpolado", () => {
    const saida = renderizar("Olá {{ nome }}", { nome: "Acme & Cia" });
    expect(saida).toBe("Olá Acme \\& Cia");
  });

  it("neutraliza injeção vinda dos dados", () => {
    const saida = renderizar("\\cvNome{ {{ nome }} }", {
      nome: "\\input{/etc/passwd}",
    });
    expect(saida).toBe("\\cvNome{ \\textbackslash{}input\\{/etc/passwd\\} }");
  });

  it("resolve caminho aninhado", () => {
    expect(renderizar("{{ a.b.c }}", { a: { b: { c: "ok" } } })).toBe("ok");
  });

  it("{{ . }} imprime o item corrente", () => {
    expect(renderizar("{{# lista }}[{{ . }}]{{/ lista }}", { lista: ["a", "b"] })).toBe(
      "[a][b]",
    );
  });

  it("converte número para texto", () => {
    expect(renderizar("{{ n }}", { n: 42 })).toBe("42");
  });
});

describe("falha ruidosa — requisito da seção 3.4", () => {
  it("lança quando o campo não existe", () => {
    expect(() => renderizar("{{ inexistente }}", {})).toThrow(ErroDeTemplate);
  });

  it("lança quando o campo é null", () => {
    expect(() => renderizar("{{ x }}", { x: null })).toThrow(/não existe/);
  });

  it("lança ao tentar imprimir um objeto", () => {
    // Sem isto, o .tex receberia "[object Object]" e o defeito só apareceria
    // no PDF pronto.
    expect(() => renderizar("{{ x }}", { x: { a: 1 } })).toThrow(/objeto/);
  });

  it("a mensagem diz qual campo e qual template", () => {
    try {
      renderizar("{{ faltante }}", {}, { nomeTemplate: "cabecalho" });
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toContain("cabecalho");
      expect((e as Error).message).toContain("faltante");
    }
  });
});

describe("blocos", () => {
  it("itera listas", () => {
    const saida = renderizar("{{# itens }}<{{ nome }}>{{/ itens }}", {
      itens: [{ nome: "a" }, { nome: "b" }],
    });
    expect(saida).toBe("<a><b>");
  });

  it("omite lista vazia — é o que impede título de seção órfão", () => {
    expect(renderizar("{{# itens }}X{{/ itens }}", { itens: [] })).toBe("");
  });

  it("omite campo ausente, sem lançar", () => {
    // Distinção central: o bloco TESTA existência, a interpolação EXIGE.
    expect(renderizar("{{# telefone }}X{{/ telefone }}", {})).toBe("");
    expect(renderizar("{{# telefone }}X{{/ telefone }}", { telefone: "" })).toBe("");
  });

  it("renderiza uma vez mantendo o contexto quando o valor é escalar", () => {
    expect(
      renderizar("{{# tel }}Tel: {{ tel }}{{/ tel }}", { tel: "1234" }),
    ).toBe("Tel: 1234");
  });

  it("aceita fechamento anônimo e nomeado", () => {
    expect(renderizar("{{# a }}X{{/ }}", { a: true })).toBe("X");
    expect(renderizar("{{# a }}X{{/ a }}", { a: true })).toBe("X");
  });

  it("rejeita fechamento com nome trocado", () => {
    expect(() => compilar("{{# a }}X{{/ b }}", "t")).toThrow(/fechado como/);
  });

  it("rejeita bloco não fechado", () => {
    expect(() => compilar("{{# a }}X", "t")).toThrow(/não foi fechado/);
  });

  it("aninha blocos", () => {
    const saida = renderizar(
      "{{# grupos }}[{{# nomes }}{{ . }}{{/ nomes }}]{{/ grupos }}",
      { grupos: [{ nomes: ["a", "b"] }, { nomes: ["c"] }] },
    );
    expect(saida).toBe("[ab][c]");
  });
});

describe("partials", () => {
  it("inclui e compartilha o contexto", () => {
    const saida = renderizar("A{{> p }}B", { x: "meio" }, { partials: { p: "{{ x }}" } });
    expect(saida).toBe("AmeioB");
  });

  it("lança quando o partial não existe", () => {
    expect(() => renderizar("{{> some }}", {})).toThrow(/não encontrado/);
  });

  it("barra inclusão circular em vez de estourar a pilha", () => {
    expect(() =>
      renderizar("{{> p }}", {}, { partials: { p: "{{> p }}" } }),
    ).toThrow(/ciclo/);
  });
});

describe("URLs", () => {
  it("{{& }} usa escape de URL, não de texto", () => {
    // Com {{ }} o sublinhado viraria \_ e o link quebraria silenciosamente.
    const saida = renderizar("\\href{ {{& u }} }{link}", {
      u: "https://github.com/foo_bar",
    });
    expect(saida).toBe("\\href{ https://github.com/foo%5Fbar }{link}");
  });

  it("neutraliza fuga pelo argumento da URL", () => {
    const saida = renderizar("{{& u }}", { u: "https://e.com/}{\\input{/x}" });
    expect(saida).not.toContain("\\");
    expect(saida).not.toMatch(/[{}]/);
  });

  it("lança quando a URL está ausente", () => {
    expect(() => renderizar("{{& u }}", {})).toThrow(/ausente/);
  });
});

describe("sintaxe proibida", () => {
  it("rejeita {{{ }}} — não existe saída sem escape", () => {
    expect(() => compilar("{{{ x }}}", "t")).toThrow(/não existe neste motor/);
  });

  it("rejeita interpolação vazia", () => {
    expect(() => compilar("{{ }}", "t")).toThrow(/vazia/);
  });

  it("rejeita fechamento sem abertura", () => {
    expect(() => compilar("{{/ a }}", "t")).toThrow(/sem abertura/);
  });
});

describe("controle de linhas em branco", () => {
  /**
   * No LaTeX, uma linha em branco inicia parágrafo. Se as tags de bloco
   * deixassem suas linhas para trás, o PDF ganharia espaçamento que ninguém
   * pediu — e rastrear isso até o template é trabalhoso.
   */
  it("remove a linha de uma tag de bloco sozinha", () => {
    const tpl = "antes\n{{# itens }}\nX\n{{/ itens }}\ndepois";
    expect(renderizar(tpl, { itens: [1] })).toBe("antes\nX\ndepois");
  });

  it("remove a linha de um partial sozinho", () => {
    const tpl = "antes\n{{> p }}\ndepois";
    expect(renderizar(tpl, {}, { partials: { p: "MEIO" } })).toBe(
      "antes\nMEIOdepois",
    );
  });

  it("preserva a linha quando há texto junto da tag", () => {
    expect(renderizar("a {{# x }}B{{/ x }} c", { x: true })).toBe("a B c");
  });
});

describe("determinismo", () => {
  it("produz saída idêntica em execuções repetidas", () => {
    const tpl = "{{# itens }}{{ nome }}:{{ valor }};{{/ itens }}";
    const ctx = { itens: [{ nome: "a", valor: 1 }, { nome: "b", valor: 2 }] };
    const primeira = renderizar(tpl, ctx);
    for (let i = 0; i < 20; i++) {
      expect(renderizar(tpl, ctx)).toBe(primeira);
    }
  });
});
