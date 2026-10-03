import { describe, it, expect } from "vitest";
import { capacidadesDoAmbiente } from "../capacidades";

/**
 * Este é o sinal que atravessa a fronteira para o navegador. O que ele NÃO
 * carrega é a parte importante: chave, provider, URL base e o motivo da
 * indisponibilidade ficam do lado do servidor.
 */

describe("capacidadesDoAmbiente", () => {
  it("diz que a IA funciona quando o ambiente está configurado", () => {
    expect(capacidadesDoAmbiente({ AI_PROVIDER: "mock" }).ia).toEqual({ disponivel: true });
  });

  it("diz que não funciona quando falta credencial", () => {
    expect(capacidadesDoAmbiente({}).ia).toEqual({ disponivel: false });
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
    expect(capacidadesDoAmbiente({ AI_PROVIDER: "antrhopic" }).ia).toEqual({
      disponivel: false,
    });
  });
});

describe("capacidade de e-mail", () => {
  it("só diz que funciona com provider e configuração completos", () => {
    const base = { APP_URL: "https://cv.exemplo.com" };
    expect(capacidadesDoAmbiente(base).email.disponivel).toBe(false);
    expect(
      capacidadesDoAmbiente({ ...base, EMAIL_PROVIDER: "resend" }).email.disponivel,
    ).toBe(false);
    expect(
      capacidadesDoAmbiente({
        ...base,
        EMAIL_PROVIDER: "resend",
        RESEND_API_KEY: "re_segredo",
        EMAIL_REMETENTE: "CV Express <nao-responda@exemplo.com>",
      }).email.disponivel,
    ).toBe(true);
  });

  it("não leva a chave do provedor para o cliente", () => {
    const serializado = JSON.stringify(
      capacidadesDoAmbiente({
        APP_URL: "https://cv.exemplo.com",
        EMAIL_PROVIDER: "resend",
        RESEND_API_KEY: "re_nao_pode_vazar",
        EMAIL_REMETENTE: "x@exemplo.com",
      }),
    );
    expect(serializado).not.toContain("re_nao_pode_vazar");
    expect(serializado).not.toContain("resend");
  });
});
