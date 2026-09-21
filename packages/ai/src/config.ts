import type { LlmProvider } from "./porta.js";
import { AnthropicAdapter, MODELO_PADRAO } from "./adapters/anthropic.js";
import { OpenAiCompativelAdapter } from "./adapters/openaiCompativel.js";
import { MockAdapter } from "./adapters/mock.js";
import type { SuporteJson } from "./porta.js";

/**
 * Seleção do provider por variável de ambiente.
 *
 *   AI_PROVIDER    anthropic | openai-compativel | mock
 *   AI_MODEL       id do modelo
 *   AI_BASE_URL    só para openai-compativel (ex.: http://localhost:11434/v1)
 *   AI_API_KEY     opcional em modelo local
 *   AI_SUPORTE_JSON  nativo | modo_json | nenhum  (só openai-compativel)
 *
 * Trocar de provider não toca em nenhum arquivo. É o que transforma
 * "agnóstico de provider" de promessa em fato verificável — e o teste de
 * contrato prova isso rodando a mesma suíte contra qualquer adapter.
 */
export function criarProviderDoAmbiente(
  env: NodeJS.ProcessEnv = process.env,
): LlmProvider {
  const escolha = env["AI_PROVIDER"] ?? "anthropic";

  switch (escolha) {
    case "anthropic":
      return new AnthropicAdapter({
        ...(env["AI_API_KEY"] ? { apiKey: env["AI_API_KEY"] } : {}),
        modelo: env["AI_MODEL"] ?? MODELO_PADRAO,
      });

    case "openai-compativel": {
      const baseUrl = env["AI_BASE_URL"];
      const modelo = env["AI_MODEL"];

      // Falhar na subida, não na primeira chamada: um provider mal
      // configurado que só quebra em produção é pior do que um que não sobe.
      if (!baseUrl) {
        throw new Error("AI_BASE_URL é obrigatório quando AI_PROVIDER=openai-compativel.");
      }
      if (!modelo) {
        throw new Error("AI_MODEL é obrigatório quando AI_PROVIDER=openai-compativel.");
      }

      return new OpenAiCompativelAdapter({
        baseUrl,
        modelo,
        ...(env["AI_API_KEY"] ? { apiKey: env["AI_API_KEY"] } : {}),
        suporteJson: (env["AI_SUPORTE_JSON"] as SuporteJson) ?? "nativo",
      });
    }

    case "mock":
      return new MockAdapter();

    default:
      throw new Error(
        `AI_PROVIDER desconhecido: "${escolha}". Use anthropic, openai-compativel ou mock.`,
      );
  }
}
