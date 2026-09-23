import { describe, it, expect } from "vitest";
import { extrairPosicoes, spParaBp } from "../aux.js";

/**
 * Um .aux como o LaTeX escreve: uma entrada por linha, três por campo
 * ancorado.
 */
function aux(campos: Record<string, [number, number, number]>): string {
  const linhas = ["\\relax"];
  for (const [id, [x, y, pagina]] of Object.entries(campos)) {
    linhas.push(`\\zref@newlabel{${id}@x}{\\posx{${x}}}`);
    linhas.push(`\\zref@newlabel{${id}@y}{\\posy{${y}}}`);
    linhas.push(`\\zref@newlabel{${id}@p}{\\abspage{${pagina}}\\default{}}`);
  }
  linhas.push("\\gdef \\@abspage@last{1}");
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
