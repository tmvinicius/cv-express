import { describe, it, expect } from "vitest";
import { criarServicoIa } from "../servico.js";
import { MockAdapter } from "../adapters/mock.js";
import { AnthropicAdapter } from "../adapters/anthropic.js";
import { OpenAiCompativelAdapter } from "../adapters/openaiCompativel.js";
import type { LlmProvider, SuporteJson } from "../porta.js";
import { AiError } from "../erros.js";
import { CASOS, rodarContrato } from "./contrato.js";

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  SUÍTE DE CONTRATO                                                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * É esta suíte que transforma "agnóstico de provider" de promessa em fato
 * verificável. As mesmas asserções rodam contra qualquer adapter: respeitou o
 * schema, não inventou nada, respeitou o teto de expansão.
 *
 * Trocar de provider vira: subir o Ollama, apontar as variáveis de ambiente,
 * rodar esta suíte. Se passar, está trocado.
 *
 * Aqui ela roda contra o MockAdapter em três modos de suporte a JSON, porque
 * é isso que diferencia um provider de primeira linha de um modelo aberto —
 * e é onde a troca costuma quebrar na prática. Contra provider real ela
 * gastaria dinheiro a cada execução de CI; por isso a execução real é
 * separada (`contrato.real.ts`, roteiro no README do pacote) e usa as MESMAS
 * asserções, que moram em `contrato.ts`.
 */

// ── Os três modos de suporte a JSON ─────────────────────────────────────────
//
// É aqui que mora a diferença real entre providers. Um modelo aberto costuma
// devolver JSON embrulhado em markdown ou com uma frase de cortesia antes —
// e tem de funcionar no MESMO caminho de código.

const MODOS: SuporteJson[] = ["nativo", "modo_json", "nenhum"];

for (const modo of MODOS) {
  rodarContrato(`mock (suporteJson=${modo})`, () =>
    criarServicoIa(new MockAdapter({ suporteJson: modo })),
  );
}

describe("resposta suja de modelo aberto", () => {
  /** Como um modelo local costuma responder na vida real. */
  function providerQueDevolve(texto: string): LlmProvider {
    return {
      nome: "sujo",
      modelo: "local",
      suporteJson: "nenhum",
      async gerar() {
        return { texto, uso: { entrada: 10, saida: 10 } };
      },
    };
  }

  it("aceita JSON dentro de cerca de markdown", async () => {
    const servico = criarServicoIa(
      providerQueDevolve('```json\n{"bullets":["Desenvolvi APIs"]}\n```'),
    );
    const r = await servico.polirExperiencia(CASOS.descricaoBagunçada);
    expect(r.ok).toBe(true);
  });

  it("aceita JSON precedido de frase de cortesia", async () => {
    const servico = criarServicoIa(
      providerQueDevolve('Claro! Aqui está:\n{"bullets":["Desenvolvi APIs"]}'),
    );
    const r = await servico.polirExperiencia(CASOS.descricaoBagunçada);
    expect(r.ok).toBe(true);
  });

  it("aceita JSON com comentário depois", async () => {
    const servico = criarServicoIa(
      providerQueDevolve('{"bullets":["Desenvolvi APIs"]}\n\nEspero ter ajudado!'),
    );
    const r = await servico.polirExperiencia(CASOS.descricaoBagunçada);
    expect(r.ok).toBe(true);
  });

  it("desiste com SAIDA_INVALIDA quando nem a nova tentativa resolve", async () => {
    const servico = criarServicoIa(providerQueDevolve("não sei responder isso"));
    const r = await servico.polirExperiencia(CASOS.descricaoBagunçada);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro.codigo).toBe("SAIDA_INVALIDA");
  });
});

describe("os adapters implementam a porta", () => {
  /**
   * Verificação estrutural, sem rede: garante que os três adapters continuam
   * satisfazendo o contrato de tipo. Um adapter que mude de assinatura quebra
   * aqui, e não só quando alguém apontar o ambiente para ele.
   */
  it("AnthropicAdapter", () => {
    const a: LlmProvider = new AnthropicAdapter({ apiKey: "sk-teste" });
    expect(a.nome).toBe("anthropic");
    expect(a.modelo).toBe("claude-opus-5");
    expect(a.suporteJson).toBe("nativo");
    expect(typeof a.gerar).toBe("function");
  });

  it("OpenAiCompativelAdapter", () => {
    const a: LlmProvider = new OpenAiCompativelAdapter({
      baseUrl: "http://localhost:11434/v1/",
      modelo: "llama3",
    });
    expect(a.nome).toBe("openai-compativel");
    expect(typeof a.gerar).toBe("function");
  });

  it("MockAdapter", () => {
    const a: LlmProvider = new MockAdapter();
    expect(a.nome).toBe("mock");
  });

  it("erros do provider viram AiError e não escapam como exceção", async () => {
    const servico = criarServicoIa(
      new MockAdapter({ erro: new AiError("INDISPONIVEL", "caiu") }),
    );
    const r = await servico.polirExperiencia(CASOS.descricaoBagunçada);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erro).toBeInstanceOf(AiError);
      expect(r.erro.tentavelNovamente).toBe(true);
    }
  });
});
