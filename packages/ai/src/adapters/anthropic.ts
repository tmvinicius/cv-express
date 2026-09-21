import Anthropic from "@anthropic-ai/sdk";
import { AiError } from "../erros.js";
import type { LlmProvider, PedidoLlm, RespostaLlm } from "../porta.js";

/**
 * Adapter da Claude API — o provider padrão da V1.
 *
 * A escolha do Claude é CONFIGURAÇÃO, não arquitetura: está aqui pela
 * qualidade de texto em português. Trocar por outro é mudar variável de
 * ambiente, não código.
 *
 * Pontos da API que não são óbvios e já mudaram:
 *
 * - `output_config.format` é a forma atual de saída estruturada. O parâmetro
 *   `output_format` de topo está obsoleto.
 * - `thinking: { type: "adaptive" }` substitui o antigo `budget_tokens`, que
 *   é REJEITADO com 400 neste modelo.
 * - Prefill de mensagem do assistente também retorna 400. Para controlar o
 *   formato, use saída estruturada — que é o que fazemos.
 */

export const MODELO_PADRAO = "claude-opus-5";

export interface OpcoesAnthropic {
  apiKey?: string;
  modelo?: string;
}

export class AnthropicAdapter implements LlmProvider {
  readonly nome = "anthropic";
  readonly modelo: string;
  /** Mecanismo dedicado de saída estruturada. */
  readonly suporteJson = "nativo" as const;

  private readonly cliente: Anthropic;

  constructor(opcoes: OpcoesAnthropic = {}) {
    // Sem apiKey explícita, o SDK resolve do ambiente: ANTHROPIC_API_KEY,
    // ANTHROPIC_AUTH_TOKEN ou o perfil do `ant auth login`.
    this.cliente = new Anthropic(
      opcoes.apiKey !== undefined ? { apiKey: opcoes.apiKey } : {},
    );
    this.modelo = opcoes.modelo ?? MODELO_PADRAO;
  }

  async gerar(pedido: PedidoLlm): Promise<RespostaLlm> {
    try {
      const resposta = await this.cliente.messages.create(
        {
          model: this.modelo,
          max_tokens: pedido.maxTokens,
          thinking: { type: "adaptive" },
          // Organizar texto curto não precisa de raciocínio profundo, e o
          // efeito no custo é direto.
          output_config: {
            effort: "low",
            format: { type: "json_schema", schema: pedido.jsonSchema },
          },
          system: pedido.sistema,
          messages: [{ role: "user", content: pedido.usuario }],
        },
        { timeout: pedido.timeoutMs },
      );

      // Recusa por política: não é erro de rede nem de formato. Tratar como
      // indisponibilidade faria o serviço tentar de novo à toa.
      if (resposta.stop_reason === "refusal") {
        throw new AiError(
          "SAIDA_INVALIDA",
          "O modelo recusou a requisição.",
          resposta.stop_details?.category ?? undefined,
        );
      }

      const texto = resposta.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");

      return {
        texto,
        uso: {
          entrada: resposta.usage.input_tokens,
          saida: resposta.usage.output_tokens,
        },
      };
    } catch (e) {
      throw traduzir(e);
    }
  }
}

/**
 * Traduz o erro do SDK para a taxonomia comum.
 *
 * Usa as classes tipadas do SDK em vez de comparar mensagem: texto de erro
 * muda entre versões, classe não.
 */
function traduzir(e: unknown): AiError {
  if (e instanceof AiError) return e;

  if (e instanceof Anthropic.AuthenticationError) {
    return new AiError("NAO_AUTORIZADO", "Credencial da Claude API inválida.", e.message);
  }
  if (e instanceof Anthropic.RateLimitError) {
    return new AiError("LIMITE_EXCEDIDO", "Limite de uso da Claude API atingido.", e.message);
  }
  if (e instanceof Anthropic.APIConnectionTimeoutError) {
    return new AiError("TEMPO_ESGOTADO", "A Claude API não respondeu a tempo.", e.message);
  }
  if (e instanceof Anthropic.APIConnectionError) {
    return new AiError("INDISPONIVEL", "Não foi possível alcançar a Claude API.", e.message);
  }
  if (e instanceof Anthropic.APIError) {
    const status = e.status ?? 0;
    return new AiError(
      status >= 500 ? "INDISPONIVEL" : "SAIDA_INVALIDA",
      "A Claude API recusou a requisição.",
      `${status}: ${e.message}`,
    );
  }

  return new AiError("INDISPONIVEL", "Falha inesperada na Claude API.", String(e));
}
