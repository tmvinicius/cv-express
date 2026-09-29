import type { LlmProvider } from "./porta.js";
import { AnthropicAdapter, MODELO_PADRAO } from "./adapters/anthropic.js";
import { OpenAiCompativelAdapter } from "./adapters/openaiCompativel.js";
import { MockAdapter } from "./adapters/mock.js";
import type { SuporteJson } from "./porta.js";

/**
 * Só o que as funções daqui precisam de um ambiente.
 *
 * Não é `NodeJS.ProcessEnv` porque esse tipo é AUMENTADO por quem o consome —
 * no `apps/web`, o Next torna `NODE_ENV` obrigatório, e aí nenhum objeto
 * pequeno de teste é aceito como ambiente. Este tipo é o que `process.env`
 * satisfaz nos dois lados.
 */
export type Ambiente = Record<string, string | undefined>;

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
export function criarProviderDoAmbiente(env: Ambiente = process.env): LlmProvider {
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

/**
 * Por que a IA pode não estar disponível.
 *
 * Código, e não mensagem: o texto que o usuário lê é responsabilidade do app
 * web (o dicionário de interface mora lá, não aqui). O código também é a
 * única coisa que pode atravessar a fronteira para o navegador — a chave, o
 * nome do provider e a URL base não saem do servidor.
 */
export type MotivoIaIndisponivel =
  /** Provider que exige credencial, e nenhuma está no ambiente. */
  | "sem_chave"
  /** Provider reconhecido, mas faltando variável obrigatória. */
  | "config_incompleta"
  /** AI_PROVIDER escrito errado — `criarProviderDoAmbiente` lançaria. */
  | "provider_desconhecido";

export type CapacidadeIa =
  | { disponivel: true }
  | { disponivel: false; motivo: MotivoIaIndisponivel };

/**
 * A IA está configurada neste ambiente?
 *
 * Existe para que a interface possa DESABILITAR a ajuda de IA em vez de
 * oferecer um botão que falha no clique. Um botão que não faz nada custa mais
 * confiança do que a ausência do botão.
 *
 * Espelha `criarProviderDoAmbiente` de propósito: as duas funções precisam
 * concordar sobre o que é "configurado", e é por isso que vivem no mesmo
 * arquivo. Se você acrescentar um provider lá, acrescente o caso aqui — há
 * teste que cobra as duas.
 *
 * Só olha a PRESENÇA das variáveis. Não faz chamada de rede: descobrir que a
 * chave foi revogada exigiria gastar uma requisição a cada carregamento de
 * página, e o erro em tempo de execução já é tratado com mensagem amigável.
 *
 * Falso negativo conhecido: o SDK da Anthropic também aceita o perfil do
 * `ant auth login`, que não aparece no ambiente. Numa máquina configurada
 * assim, a interface dirá que a IA está desligada — o contorno é exportar
 * AI_API_KEY. Preferimos errar para o lado de não prometer.
 */
export function capacidadeIa(env: Ambiente = process.env): CapacidadeIa {
  const escolha = env["AI_PROVIDER"] ?? "anthropic";

  switch (escolha) {
    case "anthropic":
      return temAlgumaChave(env)
        ? { disponivel: true }
        : { disponivel: false, motivo: "sem_chave" };

    case "openai-compativel":
      // AI_API_KEY fica de fora: modelo local (Ollama, vLLM) não pede
      // credencial, e exigir uma aqui desligaria a IA num ambiente que
      // funciona.
      return env["AI_BASE_URL"] && env["AI_MODEL"]
        ? { disponivel: true }
        : { disponivel: false, motivo: "config_incompleta" };

    case "mock":
      // O mock responde sem rede e sem credencial. É o que faz o roteiro de
      // desenvolvimento do README exercitar a IA de verdade.
      return { disponivel: true };

    default:
      return { disponivel: false, motivo: "provider_desconhecido" };
  }
}

function temAlgumaChave(env: Ambiente): boolean {
  // As três que o SDK aceita, na mesma ordem em que ele as resolve.
  return Boolean(
    env["AI_API_KEY"] || env["ANTHROPIC_API_KEY"] || env["ANTHROPIC_AUTH_TOKEN"],
  );
}
