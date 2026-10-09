import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import Erro from "../../app/error";
import NaoEncontrada from "../../app/not-found";

afterEach(() => {
  cleanup();
  refresh.mockClear();
});

function erro(mensagem: string, digest?: string) {
  return Object.assign(new Error(mensagem), digest ? { digest } : {});
}

describe("página de erro", () => {
  it("fala português e diz o que continua valendo", () => {
    render(<Erro error={erro("x")} reset={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Algo deu errado do nosso lado",
    );
    expect(document.body.textContent).toMatch(/continua guardado/);
  });

  it("nunca mostra a mensagem do erro — só o código que liga ao log", () => {
    // Fora de produção a mensagem chega crua, com o que o servidor sabe.
    render(
      <Erro
        error={erro("connect ECONNREFUSED 10.0.0.5:5432 senha=segredo", "3141592653")}
        reset={vi.fn()}
      />,
    );
    expect(document.body.textContent).not.toMatch(/ECONNREFUSED|segredo|10\.0\.0\.5/);
    expect(screen.getByText(/Código do erro: 3141592653/)).toBeDefined();
  });

  it("tentar de novo pede a página ao servidor E refaz o trecho que falhou", async () => {
    // Só `reset()` re-renderizaria o cliente com os mesmos dados; quando quem
    // falhou foi a página de servidor, nada mudaria na tela.
    const reset = vi.fn();
    render(<Erro error={erro("x")} reset={reset} />);
    await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe("página não encontrada", () => {
  it("fala português e leva de volta ao início", () => {
    render(<NaoEncontrada />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Esta página não existe");
    expect(screen.getByRole("link", { name: "Ir para o início" }).getAttribute("href")).toBe("/");
  });
});
