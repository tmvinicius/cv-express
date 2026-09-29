import { describe, it, expect } from "vitest";
import { capacidadeIa, criarProviderDoAmbiente } from "../config.js";

/**
 * O defeito que esta suíte impede: a interface oferecer "Organizar com ajuda
 * da IA" num ambiente onde a chamada vai falhar.
 *
 * O ponto delicado é a CONCORDÂNCIA entre `capacidadeIa` e
 * `criarProviderDoAmbiente`. Se as duas discordarem, ou a interface esconde
 * um recurso que funciona, ou oferece um que não funciona — e a segunda é a
 * que custa confiança.
 */

describe("capacidadeIa", () => {
  it("sem AI_PROVIDER e sem chave nenhuma, a IA está indisponível", () => {
    // O default é anthropic, e o SDK sem credencial falha na primeira
    // chamada. Antes disto a interface só descobria depois do clique.
    expect(capacidadeIa({})).toEqual({ disponivel: false, motivo: "sem_chave" });
  });

  it.each(["AI_API_KEY", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"])(
    "aceita a credencial em %s",
    (chave) => {
      expect(capacidadeIa({ [chave]: "sk-teste" })).toEqual({ disponivel: true });
    },
  );

  it("o mock está sempre disponível — é o modo do roteiro de desenvolvimento", () => {
    expect(capacidadeIa({ AI_PROVIDER: "mock" })).toEqual({ disponivel: true });
  });

  it("openai-compativel exige base e modelo, mas não exige chave", () => {
    // Modelo local não pede credencial; exigir uma desligaria a IA num
    // ambiente que funciona.
    expect(
      capacidadeIa({
        AI_PROVIDER: "openai-compativel",
        AI_BASE_URL: "http://localhost:11434/v1",
        AI_MODEL: "llama3",
      }),
    ).toEqual({ disponivel: true });

    expect(
      capacidadeIa({ AI_PROVIDER: "openai-compativel", AI_MODEL: "llama3" }),
    ).toEqual({ disponivel: false, motivo: "config_incompleta" });
  });

  it("provider escrito errado é indisponibilidade, não exceção", () => {
    // `criarProviderDoAmbiente` lança nesse caso, e a página não pode quebrar
    // só para descobrir se mostra um botão.
    expect(capacidadeIa({ AI_PROVIDER: "antrhopic" })).toEqual({
      disponivel: false,
      motivo: "provider_desconhecido",
    });
  });

  it("nunca devolve o valor da chave", () => {
    const c = capacidadeIa({ AI_API_KEY: "sk-segredo-que-nao-pode-vazar" });
    expect(JSON.stringify(c)).not.toContain("sk-segredo");
  });

  /**
   * Os dois lados da mesma decisão: se `capacidadeIa` diz que dá, montar o
   * provider precisa funcionar; se diz que não dá pelo motivo estrutural
   * (config incompleta, provider desconhecido), montar precisa lançar.
   */
  it.each([
    { AI_PROVIDER: "mock" },
    { AI_PROVIDER: "anthropic", AI_API_KEY: "sk-teste" },
    {
      AI_PROVIDER: "openai-compativel",
      AI_BASE_URL: "http://localhost:11434/v1",
      AI_MODEL: "llama3",
    },
  ])("concorda com criarProviderDoAmbiente quando diz que dá: %o", (env) => {
    expect(capacidadeIa(env).disponivel).toBe(true);
    expect(() => criarProviderDoAmbiente(env)).not.toThrow();
  });

  it.each([
    { AI_PROVIDER: "openai-compativel" },
    { AI_PROVIDER: "nao-existe" },
  ])("concorda com criarProviderDoAmbiente quando diz que não dá: %o", (env) => {
    expect(capacidadeIa(env).disponivel).toBe(false);
    expect(() => criarProviderDoAmbiente(env)).toThrow();
  });
});
