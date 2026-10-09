import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

import { Comecar } from "../Comecar";

afterEach(cleanup);

describe("botão Começar", () => {
  it("é um formulário com botão de envio — a sessão nasce de um POST, não de um GET", () => {
    // Um link ou `router.push` seria GET de novo, e GET é o que robôs e
    // pré-visualizações de link fazem.
    render(<Comecar acao={vi.fn(async () => null)} />);
    const botao = screen.getByRole("button", { name: "Começar meu currículo" });
    expect(botao.getAttribute("type")).toBe("submit");
    expect(botao.closest("form")).not.toBeNull();
  });

  it("chama a ação no envio", async () => {
    const acao = vi.fn(async () => null);
    render(<Comecar acao={acao} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(acao).toHaveBeenCalledTimes(1));
  });

  it("mostra a recusa por limite na mesma tela, como alerta", async () => {
    const acao = vi.fn(async () => "Muitos currículos começados a partir da sua rede agora.");
    render(<Comecar acao={acao} />);
    fireEvent.click(screen.getByRole("button"));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Muitos currículos/);
  });

  it("desabilita o botão enquanto envia — dois toques criariam duas sessões", async () => {
    let terminar!: (v: string | null) => void;
    const acao = vi.fn(() => new Promise<string | null>((r) => (terminar = r)));
    render(<Comecar acao={acao} />);
    fireEvent.click(screen.getByRole("button"));

    const botao = await screen.findByRole("button", { name: "Abrindo…" });
    expect((botao as HTMLButtonElement).disabled).toBe(true);

    terminar(null);
    await screen.findByRole("button", { name: "Começar meu currículo" });
  });
});
