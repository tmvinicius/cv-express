import { describe, it, expect } from "vitest";
import { extrairPosicoes, extrairTotalDePaginas, spParaBp } from "../aux.js";

/**
 * Um .aux como o LaTeX escreve DE VERDADE.
 *
 * Dois detalhes desta fixture não são estética, e a versão anterior errava os
 * dois — ela reproduzia o formato que o parser esperava, não o que o pipeline
 * gera, e por isso confirmava a própria suposição (AGENTS.md §4, "verifique
 * por subtração, não por padrão"):
 *
 * 1. O rótulo vem com ESPAÇOS em volta do fieldId. O motor exige
 *    `{ {{ x }} }`, o .tex sai como `\cvCampo{ pessoal.nome }{...}`, e o TeX
 *    preserva os espaços ao ler o argumento.
 * 2. A ordem das propriedades de @p é `\default{}\page{n}\abspage{n}`.
 *
 * Ambos copiados de um .aux real (Tectonic 0.17.0, fixture `completa`):
 *
 *   \zref@newlabel{ pessoal.nome @x}{\posx{3356429}}
 *   \zref@newlabel{ pessoal.nome @p}{\default{}\page{1}\abspage{1}}
 */
function aux(
  campos: Record<string, [number, number, number]>,
  ultimaPagina = 1,
): string {
  const linhas = ["\\relax"];
  for (const [id, [x, y, pagina]] of Object.entries(campos)) {
    linhas.push(`\\zref@newlabel{ ${id} @x}{\\posx{${x}}}`);
    linhas.push(`\\zref@newlabel{ ${id} @y}{\\posy{${y}}}`);
    linhas.push(
      `\\zref@newlabel{ ${id} @p}{\\default{}\\page{${pagina}}\\abspage{${pagina}}}`,
    );
  }
  linhas.push(`\\gdef \\@abspage@last{${ultimaPagina}}`);
  return linhas.join("\n") + "\n";
}

describe("conversão de unidades", () => {
  it("converte scaled points para big points", () => {
    // 65536 sp = 1 pt = 72/72,27 bp
    expect(spParaBp(65536)).toBeCloseTo(72 / 72.27, 10);
  });

  it("não confunde pt com bp", () => {
    // A diferença é de ~0,37%: pequena o bastante para passar despercebida e
    // grande o bastante para desalinhar uma região no rodapé da página.
    expect(spParaBp(65536)).not.toBe(1);
    expect(spParaBp(65536)).toBeLessThan(1);
  });

  it("converte zero e valores grandes", () => {
    expect(spParaBp(0)).toBe(0);
    // Largura de uma A4 (595 bp) em sp.
    expect(spParaBp(39_158_000)).toBeCloseTo(595.4, 0);
  });
});

describe("extrairPosicoes", () => {
  it("monta a posição quando os três rótulos existem", () => {
    const saida = extrairPosicoes(aux({ "pessoal.nome": [4_587_520, 46_400_000, 1] }));
    expect(saida).toHaveLength(1);
    expect(saida[0]?.fieldId).toBe("pessoal.nome");
    expect(saida[0]?.pagina).toBe(1);
    expect(saida[0]?.x).toBeCloseTo(spParaBp(4_587_520), 6);
  });

  it("preserva fieldId com pontos e hifens", () => {
    // O fieldId é `experiencias.<nanoid>.cargo`, e o nanoid usa hifens.
    const saida = extrairPosicoes(
      aux({ "experiencias.V1StGXR8-Z5j.cargo": [100, 200, 2] }),
    );
    expect(saida[0]?.fieldId).toBe("experiencias.V1StGXR8-Z5j.cargo");
    expect(saida[0]?.pagina).toBe(2);
  });

  it("ordena por fieldId — resposta comparável entre execuções", () => {
    const saida = extrairPosicoes(
      aux({
        "pessoal.nome": [1, 1, 1],
        "experiencias.a.cargo": [2, 2, 1],
        "objetivo": [3, 3, 1],
      }),
    );
    expect(saida.map((p) => p.fieldId)).toEqual([
      "experiencias.a.cargo",
      "objetivo",
      "pessoal.nome",
    ]);
  });

  it("lê várias páginas", () => {
    const saida = extrairPosicoes(
      aux({ a: [1, 1, 1], b: [2, 2, 2], c: [3, 3, 3] }),
    );
    expect(saida.map((p) => p.pagina)).toEqual([1, 2, 3]);
  });
});

describe("extrairPosicoes — degradação", () => {
  /**
   * O PDF já está pronto quando esta função roda. O planejamento (seção 3.5)
   * define que o preview cai para o painel lateral de seções quando o mapa
   * falha, então tudo aqui devolve lista vazia ou parcial — nunca lança.
   */

  it("devolve vazio para .aux ausente ou vazio", () => {
    expect(extrairPosicoes("")).toEqual([]);
  });

  it("devolve vazio para .aux sem âncoras", () => {
    expect(extrairPosicoes("\\relax\n\\gdef \\@abspage@last{1}\n")).toEqual([]);
  });

  it("descarta campo com rótulo faltando", () => {
    const parcial = [
      "\\zref@newlabel{so.x@x}{\\posx{100}}",
      "\\zref@newlabel{so.x@y}{\\posy{200}}",
      // sem @p
    ].join("\n");
    expect(extrairPosicoes(parcial)).toEqual([]);
  });

  it("mantém os campos íntegros e descarta só o quebrado", () => {
    const misto = [
      aux({ bom: [100, 200, 1] }).trim(),
      "\\zref@newlabel{ruim@x}{\\posx{50}}",
    ].join("\n");

    const saida = extrairPosicoes(misto);
    expect(saida).toHaveLength(1);
    expect(saida[0]?.fieldId).toBe("bom");
  });

  it("descarta coordenada não numérica", () => {
    const corrompido = [
      "\\zref@newlabel{x@x}{\\posx{abc}}",
      "\\zref@newlabel{x@y}{\\posy{200}}",
      "\\zref@newlabel{x@p}{\\abspage{1}}",
    ].join("\n");
    // Sem a checagem de finitude, viraria uma região clicável em NaN.
    expect(extrairPosicoes(corrompido)).toEqual([]);
  });

  it("descarta página inválida", () => {
    const corrompido = [
      "\\zref@newlabel{x@x}{\\posx{100}}",
      "\\zref@newlabel{x@y}{\\posy{200}}",
      "\\zref@newlabel{x@p}{\\abspage{0}}",
    ].join("\n");
    expect(extrairPosicoes(corrompido)).toEqual([]);
  });

  it("não quebra com .aux truncado no meio de uma entrada", () => {
    const truncado = "\\zref@newlabel{x@x}{\\posx{10";
    expect(() => extrairPosicoes(truncado)).not.toThrow();
    expect(extrairPosicoes(truncado)).toEqual([]);
  });

  it("ignora rótulos de outros pacotes", () => {
    const outros = [
      "\\newlabel{sec:intro}{{1}{1}}",
      "\\zref@newlabel{qualquer@outro}{\\posx{1}}",
      aux({ nosso: [10, 20, 1] }).trim(),
    ].join("\n");

    const saida = extrairPosicoes(outros);
    expect(saida.map((p) => p.fieldId)).toEqual(["nosso"]);
  });
});

describe("fieldId contra o formato real do .aux", () => {
  /**
   * Impede o defeito que deixava toda a sobreposição clicável inerte: o .tex
   * emite `\cvCampo{ pessoal.nome }{...}` (o motor exige o espaço, porque
   * `{{{` é erro por desenho), o TeX preserva os espaços, e o .aux sai com
   * `{ pessoal.nome @x}`. Sem o trim o fieldId extraído é " pessoal.nome ",
   * que nunca casa com o "pessoal.nome" construído por campo.ts — e o
   * descarte é silencioso.
   *
   * As linhas abaixo são cópia literal de um .aux gerado pelo Tectonic
   * 0.17.0 sobre a fixture `completa`.
   */
  const AUX_REAL = [
    "\\relax",
    "\\providecommand\\zref@newlabel[2]{}",
    "\\zref@newlabel{ pessoal.nome @x}{\\posx{3356429}}",
    "\\zref@newlabel{ pessoal.nome @y}{\\posy{52397491}}",
    "\\zref@newlabel{ pessoal.nome @p}{\\default{}\\page{1}\\abspage{1}}",
    "\\zref@newlabel{ experiencias.exp-1.cargo @x}{\\posx{3356429}}",
    "\\zref@newlabel{ experiencias.exp-1.cargo @y}{\\posy{44745114}}",
    "\\zref@newlabel{ experiencias.exp-1.cargo @p}{\\default{}\\page{1}\\abspage{1}}",
    "\\gdef \\@abspage@last{1}",
  ].join("\n");

  it("extrai o fieldId sem os espaços que o TeX escreve", () => {
    const saida = extrairPosicoes(AUX_REAL);
    expect(saida.map((p) => p.fieldId)).toEqual([
      "experiencias.exp-1.cargo",
      "pessoal.nome",
    ]);
  });

  it("casa com o id que o formulário constrói", () => {
    // É a única igualdade que faz a sobreposição funcionar. `campo.pessoal`
    // não é importável aqui (o worker não depende de @cv-express/schema para
    // isto), então comparamos com a string que ele produz.
    const saida = extrairPosicoes(AUX_REAL);
    expect(saida.some((p) => p.fieldId === "pessoal.nome")).toBe(true);
  });

  it("confere a calibração: x e y caem exatamente sobre as margens da classe", () => {
    // A4 = 595,28 x 841,89 bp; a classe declara left=1,8cm e top=1,6cm.
    // 1,8cm = 51,024 bp e 1,6cm = 45,354 bp. Se a origem fosse o topo, ou se
    // a conversão confundisse pt com bp, nenhum dos dois bateria.
    const nome = extrairPosicoes(AUX_REAL).find((p) => p.fieldId === "pessoal.nome");
    expect(nome?.x).toBeCloseTo(51.024, 2);
    expect(841.89 - (nome?.y ?? 0)).toBeCloseTo(45.354, 2);
  });
});

describe("extrairTotalDePaginas", () => {
  /**
   * Impede a falha silenciosa do B-2: o scan de `/Type /Page` no PDF não
   * encontra nada num PDF 1.5 com object stream (o que o xdvipdfmx produz),
   * cai no fallback `1`, e o aviso de currículo longo nunca aparece. O .aux
   * traz a contagem certa, de graça, no arquivo que o worker já lê.
   */
  it("lê o total de páginas do zref-abspage", () => {
    expect(extrairTotalDePaginas(aux({ a: [1, 1, 2] }, 2))).toBe(2);
  });

  it("aceita o espaçamento que o LaTeX escreve de fato", () => {
    expect(extrairTotalDePaginas("\\gdef \\@abspage@last{7}\n")).toBe(7);
  });

  it("devolve undefined quando o .aux não traz a contagem", () => {
    // Quem chama cai para o scan do PDF; devolver 1 aqui esconderia a
    // diferença entre "uma página" e "não sei".
    expect(extrairTotalDePaginas("\\relax\n")).toBeUndefined();
  });

  it("rejeita contagem absurda em vez de propagar", () => {
    expect(extrairTotalDePaginas("\\gdef \\@abspage@last{0}\n")).toBeUndefined();
  });
});
