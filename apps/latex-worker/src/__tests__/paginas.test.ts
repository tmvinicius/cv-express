import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { contarPaginas } from "../compilar.js";
import { extrairTotalDePaginas } from "../aux.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));

/**
 * PDF real do pipeline: fixture `completa` triplicada, compilada com Tectonic
 * 0.17.0 (a mesma toolchain do worker). Tem 2 páginas.
 *
 * É um fixture binário porque o defeito só existe no PDF de verdade: qualquer
 * PDF escrito à mão para o teste sairia sem compressão e passaria.
 */
const PDF_DUAS_PAGINAS = fs.readFileSync(
  path.join(AQUI, "fixtures", "duas-paginas.pdf"),
);

describe("contagem de páginas contra o PDF real", () => {
  /**
   * Este é o teste que faltava. Enquanto `contarPaginas` era a fonte primária,
   * `pageCount` valia 1 para todo currículo — o AvisoPaginas nunca aparecia e
   * `sugestoesDeCorte` nunca era exibido. Falha silenciosa: o PDF saía certo
   * e a pessoa não recebia a ajuda.
   */
  it("o scan de /Type /Page não enxerga o PDF que o xdvipdfmx produz", () => {
    // Documenta o motivo de o .aux ser a fonte primária. O xdvipdfmx emite
    // PDF 1.5 e guarda os dicionários de página num object stream comprimido,
    // onde a string não aparece. Se algum dia esta expectativa falhar, o
    // gerador mudou — e aí o fallback voltou a servir sozinho.
    expect(PDF_DUAS_PAGINAS.toString("latin1")).not.toMatch(/\/Type\s*\/Page(?![s/\w])/);
    expect(contarPaginas(PDF_DUAS_PAGINAS)).toBe(1); // o fallback errando
  });

  it("o .aux dá a contagem certa para o mesmo documento", () => {
    // Trecho literal do .aux que acompanhou o PDF acima.
    expect(extrairTotalDePaginas("\\gdef \\@abspage@last{2}\n")).toBe(2);
  });

  it("contarPaginas ainda serve para PDF sem compressão", () => {
    // Justifica mantê-la como fallback em vez de apagá-la.
    const simples = Buffer.from(
      "%PDF-1.4\n1 0 obj<</Type /Pages /Count 2>>endobj\n" +
        "2 0 obj<</Type /Page>>endobj\n3 0 obj<</Type /Page>>endobj\n",
      "latin1",
    );
    expect(contarPaginas(simples)).toBe(2);
  });
});
