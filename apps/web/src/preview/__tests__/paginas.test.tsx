import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { render, screen, cleanup, act, waitFor } from "@testing-library/react";

/**
 * O PDF.js de verdade não desenha no jsdom (não há canvas). Aqui ele é
 * substituído por um falso que registra o que recebeu e deixa o teste
 * decidir quando cada página termina — é o que permite provar a ordem das
 * coisas: o que aparece, quando, e o que acontece na falha.
 *
 * O desenho real é provado no E2E, num Chromium de verdade (fluxo.spec.ts).
 */
const falso = vi.hoisted(() => ({
  falhar: false,
  recebidos: [] as Uint8Array[],
  segurar: null as Promise<void> | null,
}));

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: ({ data }: { data: Uint8Array }) => {
    if (falso.falhar) return { promise: Promise.reject(new Error("PDF.js não carregou")) };
    falso.recebidos.push(data);
    const paginas = data[0] ?? 1;
    const documento = {
      numPages: paginas,
      loadingTask: { destroy: async () => {} },
      getPage: async () => ({
        getViewport: ({ scale }: { scale: number }) => ({ width: 595 * scale, height: 842 * scale }),
        render: () => ({ promise: falso.segurar ?? Promise.resolve() }),
      }),
    };
    return { promise: Promise.resolve(documento) };
  },
}));

import { PaginasPdf, escalaParaLargura, precisaRedesenhar } from "../PaginasPdf";
import { Preview } from "../../componentes/Preview";

beforeAll(() => {
  // O jsdom não faz layout: toda largura é 0, e com largura 0 nada é desenhado.
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 600 });
  globalThis.URL.createObjectURL ??= () => "blob:teste";
  globalThis.URL.revokeObjectURL ??= () => {};
});

afterEach(() => {
  cleanup();
  falso.falhar = false;
  falso.recebidos = [];
  falso.segurar = null;
});

/** Um "PDF" cujo primeiro byte diz quantas páginas o falso deve ter. */
const pdfCom = (paginas: number) => new Uint8Array([paginas, 37, 80, 68, 70]);
const base64Com = (paginas: number) => btoa(String.fromCharCode(...pdfCom(paginas)));

describe("PaginasPdf", () => {
  it("desenha uma página por página do PDF, cada uma com rótulo para leitor de tela", async () => {
    render(<PaginasPdf bytes={pdfCom(2)} aoFalhar={vi.fn()} />);
    const paginas = await screen.findAllByRole("img");
    expect(paginas.map((p) => p.getAttribute("aria-label"))).toEqual([
      "Página 1 de 2 do seu currículo",
      "Página 2 de 2 do seu currículo",
    ]);
  });

  it("entrega ao PDF.js uma CÓPIA dos bytes — o original segue servindo ao download", async () => {
    // O PDF.js transfere o buffer para o worker, e o original ficaria vazio.
    const bytes = pdfCom(1);
    render(<PaginasPdf bytes={bytes} aoFalhar={vi.fn()} />);
    await screen.findAllByRole("img");
    expect(falso.recebidos[0]).not.toBe(bytes);
    expect([...falso.recebidos[0]!]).toEqual([...bytes]);
  });

  it("mantém as páginas anteriores na tela até as novas ficarem prontas", async () => {
    // Trocar página por página faria a tela piscar a cada edição.
    const { rerender } = render(<PaginasPdf bytes={pdfCom(1)} aoFalhar={vi.fn()} />);
    await screen.findByRole("img", { name: "Página 1 de 1 do seu currículo" });

    let liberar!: () => void;
    falso.segurar = new Promise<void>((r) => (liberar = r));
    rerender(<PaginasPdf bytes={pdfCom(2)} aoFalhar={vi.fn()} />);
    await act(async () => {});
    // A que está na tela é a ANTIGA. Contar canvas não basta: uma página
    // nova, ainda em branco, também contaria um.
    expect(screen.getAllByRole("img").map((p) => p.getAttribute("aria-label"))).toEqual([
      "Página 1 de 1 do seu currículo",
    ]);

    await act(async () => liberar());
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
  });

  it("avisa quem chama quando o PDF.js não consegue", async () => {
    falso.falhar = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const aoFalhar = vi.fn();
    render(<PaginasPdf bytes={pdfCom(1)} aoFalhar={aoFalhar} />);
    await waitFor(() => expect(aoFalhar).toHaveBeenCalledTimes(1));
  });
});

describe("Preview com o PDF.js", () => {
  const pronto = (paginas: number) =>
    ({ fase: "pronto", pdfBase64: base64Com(paginas), paginas }) as const;

  it("mostra as páginas desenhadas, e não o leitor de PDF do navegador", async () => {
    render(<Preview estado={pronto(2)} nomeArquivo="cv.pdf" />);
    expect(await screen.findAllByRole("img")).toHaveLength(2);
    expect(document.querySelector("iframe")).toBeNull();
    expect(screen.getByRole("link", { name: "Baixar currículo" })).toBeDefined();
  });

  it("se o PDF.js falhar, cai no leitor do navegador — e o download continua lá", async () => {
    falso.falhar = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<Preview estado={pronto(1)} nomeArquivo="cv.pdf" />);
    await waitFor(() => expect(document.querySelector("iframe")).not.toBeNull());
    expect(screen.getByRole("link", { name: "Baixar currículo" })).toBeDefined();
  });
});

describe("tamanho do desenho", () => {
  it("desenha na largura real da tela, vezes a densidade — é o que deixa o texto nítido", () => {
    // Página A4 (595 pt) numa coluna de 380 px, tela de densidade 3.
    expect(escalaParaLargura(595, 380, 3) * 595).toBeCloseTo(1140);
  });

  it("tem teto: acima de 2.000 px só gasta a memória que derruba a aba no celular", () => {
    expect(escalaParaLargura(595, 1200, 3) * 595).toBeCloseTo(2000);
  });

  it("não redesenha por um ou dois pixels — a barra de endereço do celular faz isso ao rolar", () => {
    expect(precisaRedesenhar(0, 380)).toBe(true);
    expect(precisaRedesenhar(380, 378)).toBe(false);
    expect(precisaRedesenhar(380, 700)).toBe(true);
  });
});
