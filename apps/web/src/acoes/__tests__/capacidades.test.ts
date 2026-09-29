import { describe, it, expect } from "vitest";
import { capacidadesDoAmbiente } from "../capacidades";

/**
 * Este é o sinal que atravessa a fronteira para o navegador. O que ele NÃO
 * carrega é a parte importante: chave, provider, URL base e o motivo da
 * indisponibilidade ficam do lado do servidor.
 */

describe("capacidadesDoAmbiente", () => {
  it("diz que a IA funciona quando o ambiente está configurado", () => {
    expect(capacidadesDoAmbiente({ AI_PROVIDER: "mock" })).toEqual({
      ia: { disponivel: true },
    });
  });

  it("diz que não funciona quando falta credencial", () => {
    expect(capacidadesDoAmbiente({})).toEqual({ ia: { disponivel: false } });
  });

  it("não leva a chave nem o motivo para o cliente", () => {
    /**
     * `capacidadeIa` devolve o motivo, e ele é útil — no log do servidor. Aqui
     * ele é cortado de propósito: em desenvolvimento o Next repassa o payload
     * (e o console do servidor) para o navegador, e "config_incompleta" é
     * informação de implantação, não de quem está montando o currículo.
     */
    const serializado = JSON.stringify(
      capacidadesDoAmbiente({
        AI_PROVIDER: "anthropic",
        AI_API_KEY: "sk-nao-pode-vazar",
      }),
    );

    expect(serializado).not.toContain("sk-nao-pode-vazar");
    expect(serializado).not.toContain("anthropic");
    expect(serializado).not.toContain("motivo");
  });

  it("provider escrito errado não derruba a página", () => {
    // `criarProviderDoAmbiente` lança nesse caso. O componente de servidor
    // que desenha o formulário não pode lançar junto.
    expect(() => capacidadesDoAmbiente({ AI_PROVIDER: "antrhopic" })).not.toThrow();
    expect(capacidadesDoAmbiente({ AI_PROVIDER: "antrhopic" })).toEqual({
      ia: { disponivel: false },
    });
  });
});
