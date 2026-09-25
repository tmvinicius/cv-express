import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Campo } from "../Campo";
import { BarraProgresso } from "../BarraProgresso";
import { IndicadorAutosave } from "../IndicadorAutosave";

afterEach(cleanup);

/**
 * Estes testes olham ACESSIBILIDADE, não aparência.
 *
 * O visual vem dos tokens do design system e muda; a amarração entre rótulo,
 * ajuda e erro é contrato, e quebrá-la deixa quem usa leitor de tela sem
 * saber que errou — uma falha invisível em teste manual com o olho.
 *
 * Por isso as consultas são por papel e rótulo (`getByRole`, `getByLabelText`),
 * do jeito que uma tecnologia assistiva enxerga, e não por classe CSS.
 */

describe("Campo", () => {
  it("liga o rótulo ao campo", async () => {
    render(<Campo rotulo="Seu nome" valor="" aoMudar={() => {}} />);

    // Encontrar por rótulo só funciona se htmlFor/id estiverem corretos.
    const entrada = screen.getByLabelText(/seu nome/i);
    expect(entrada).toBeDefined();

    // E clicar no rótulo precisa focar o campo.
    await userEvent.click(screen.getByText(/seu nome/i));
    expect(document.activeElement).toBe(entrada);
  });

  it("anuncia o erro por aria-describedby, não só em vermelho", () => {
    render(
      <Campo rotulo="E-mail" valor="ana@" aoMudar={() => {}} erro="E-mail inválido" />,
    );

    const entrada = screen.getByLabelText(/e-mail/i);
    const erro = screen.getByRole("alert");

    expect(erro.textContent).toBe("E-mail inválido");
    expect(entrada.getAttribute("aria-invalid")).toBe("true");
    // O ponto: o erro precisa estar LIGADO ao campo.
    expect(entrada.getAttribute("aria-describedby")).toContain(erro.id);
  });

  it("liga também o texto de ajuda", () => {
    render(
      <Campo rotulo="Telefone" valor="" aoMudar={() => {}} ajuda="Com DDD" />,
    );

    const entrada = screen.getByLabelText(/telefone/i);
    const ajuda = screen.getByText("Com DDD");
    expect(entrada.getAttribute("aria-describedby")).toContain(ajuda.id);
  });

  it("liga ajuda e erro ao mesmo tempo", () => {
    render(
      <Campo
        rotulo="E-mail"
        valor=""
        aoMudar={() => {}}
        ajuda="Usaremos para o link"
        erro="Obrigatório"
      />,
    );

    const descritoPor =
      screen.getByLabelText(/e-mail/i).getAttribute("aria-describedby") ?? "";
    expect(descritoPor.split(" ")).toHaveLength(2);
  });

  it("gera ids únicos entre instâncias", () => {
    // useId por instância: dois campos na mesma tela não podem colidir, senão
    // o rótulo de um passa a apontar para o outro.
    render(
      <>
        <Campo rotulo="Nome" valor="" aoMudar={() => {}} />
        <Campo rotulo="Cidade" valor="" aoMudar={() => {}} />
      </>,
    );

    expect(screen.getByLabelText(/nome/i).id).not.toBe(
      screen.getByLabelText(/cidade/i).id,
    );
  });

  it("propaga o que foi digitado", async () => {
    const aoMudar = vi.fn();
    render(<Campo rotulo="Nome" valor="" aoMudar={aoMudar} />);

    await userEvent.type(screen.getByLabelText(/nome/i), "Ana");

    expect(aoMudar).toHaveBeenCalledTimes(3);
  });

  it("preserva acentuação digitada", async () => {
    const aoMudar = vi.fn();
    render(<Campo rotulo="Cidade" valor="" aoMudar={aoMudar} />);

    await userEvent.type(screen.getByLabelText(/cidade/i), "ç");
    expect(aoMudar).toHaveBeenCalledWith("ç");
  });

  it("renderiza textarea quando multilinha", () => {
    render(<Campo rotulo="Objetivo" valor="" aoMudar={() => {}} multilinha />);
    expect(screen.getByLabelText(/objetivo/i).tagName).toBe("TEXTAREA");
  });

  it("marca obrigatoriedade sem poluir o leitor de tela", () => {
    render(<Campo rotulo="Nome" valor="" aoMudar={() => {}} obrigatorio />);

    const entrada = screen.getByLabelText(/nome/i);
    // `required` é o que a tecnologia assistiva usa; o asterisco é visual.
    expect(entrada.hasAttribute("required")).toBe(true);
    expect(screen.getByText("*").getAttribute("aria-hidden")).toBe("true");
  });
});

describe("BarraProgresso", () => {
  const progresso = {
    percentual: 40,
    etapasConcluidas: 2,
    totalDeEtapas: 5,
    rotuloAtual: "Objetivo",
    posicaoAtual: 2,
  };

  it("expõe os valores para tecnologia assistiva", () => {
    render(<BarraProgresso progresso={progresso} />);

    const barra = screen.getByRole("progressbar");
    expect(barra.getAttribute("aria-valuenow")).toBe("40");
    expect(barra.getAttribute("aria-valuemin")).toBe("0");
    expect(barra.getAttribute("aria-valuemax")).toBe("100");
  });

  it("descreve a posição por extenso", () => {
    // Sem isto, quem não enxerga a barra não sabe onde está no formulário.
    render(<BarraProgresso progresso={progresso} />);
    expect(screen.getByRole("progressbar").getAttribute("aria-label")).toContain(
      "etapa 2 de 5",
    );
  });

  it("mostra a posição também em texto", () => {
    render(<BarraProgresso progresso={progresso} />);
    expect(screen.getByText(/etapa 2 de 5/i)).toBeDefined();
    expect(screen.getByText("Objetivo")).toBeDefined();
  });
});

describe("IndicadorAutosave", () => {
  it("usa região viva educada", () => {
    render(<IndicadorAutosave estado="salvando" />);

    const status = screen.getByRole("status");
    // "polite" e não "assertive": interromper alguém no meio de uma frase
    // para dizer "salvo" seria hostil.
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toBe("Salvando…");
  });

  it("no erro, diz o que continua funcionando", () => {
    // Quem está preenchendo currículo não precisa de mais um motivo para
    // achar que perdeu tudo.
    render(<IndicadorAutosave estado="erro" />);
    expect(screen.getByRole("status").textContent).toContain("continuam aqui na tela");
  });

  it("fica em silêncio quando ocioso", () => {
    render(<IndicadorAutosave estado="ocioso" />);
    expect(screen.getByRole("status").textContent).toBe("");
  });
});
