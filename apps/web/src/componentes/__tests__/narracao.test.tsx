import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { novoCv, novaExperiencia } from "@cv-express/schema";

import { NarracaoGeracao, passosDaNarracao, INTERVALO_NARRACAO_MS } from "../NarracaoGeracao";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("narração da tela 'gerando'", () => {
  it("só fala de experiências para quem tem experiência", () => {
    // Para o primeiro emprego, "organizando suas experiências" soaria como
    // cobrança — e é o público que mais precisa do produto.
    expect(passosDaNarracao(novoCv("s"))).not.toContain("Organizando suas experiências…");
    expect(
      passosDaNarracao({
        ...novoCv("s"),
        experiencias: [novaExperiencia({ cargo: "Dev", empresa: "Acme" })],
      }),
    ).toContain("Organizando suas experiências…");
  });

  it("avança e PARA na última frase — não recomeça", () => {
    // Em ciclo, uma compilação demorada vira a definição visual de travou.
    vi.useFakeTimers();
    const cv = novoCv("s");
    const passos = passosDaNarracao(cv);
    render(<NarracaoGeracao cv={cv} />);

    expect(screen.getByText(passos[0]!)).toBeDefined();
    // Passo a passo: cada frase agenda a seguinte só depois de aparecer.
    const passo = () =>
      act(() => {
        vi.advanceTimersByTime(INTERVALO_NARRACAO_MS);
      });
    for (let i = 1; i < passos.length; i++) {
      passo();
      expect(screen.getByText(passos[i]!)).toBeDefined();
    }
    // Chegou ao fim: a CADA passo seguinte, continua na última. Conferir só
    // no final não basta — um ciclo pode cair de novo na última frase por
    // coincidência (foi o que a primeira versão deste teste deixou passar).
    for (let i = 0; i < passos.length * 2; i++) {
      passo();
      expect(screen.getByText(passos.at(-1)!)).toBeDefined();
    }
  });

  it("fica fora do leitor de tela, que já ouve o status estável do preview", () => {
    render(<NarracaoGeracao cv={novoCv("s")} />);
    expect(screen.getByText(/lendo o que você escreveu/i).getAttribute("aria-hidden")).toBe("true");
  });
});
