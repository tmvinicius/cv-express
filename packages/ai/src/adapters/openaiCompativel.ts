import { AiError } from "../erros.js";
import type {
  LlmProvider,
  PedidoLlm,
  RespostaLlm,
  SuporteJson,
} from "../porta.js";

/**
 * Adapter para qualquer endpoint compatível com a API da OpenAI.
 *
 * Este é o adapter que entrega o open-source de graça. Praticamente todo
 * runtime de modelo aberto expõe `/v1/chat/completions`: Ollama, vLLM,
 * LM Studio, llama.cpp, além de OpenRouter, Groq e Together. Um adapter só,
 * `baseUrl` configurável, e um modelo local passa a funcionar.
 *
 * Implementado com `fetch` em vez do SDK da OpenAI, de propósito: a dependência
 * não se justifica para uma chamada só, e o SDK carrega comportamentos
 * (validação de modelo, cabeçalhos próprios) que atrapalham com endpoints
 * locais que implementam a API apenas em parte.
 */

export interface OpcoesOpenAiCompativel {
  baseUrl: string;
  modelo: string;
  /** Muitos endpoints locais não exigem chave. */
  apiKey?: string;
  /**
   * Nem todo runtime local suporta `response_format`. Quem não suportar deve
   * declarar "nenhum": o schema então vai só no prompt e a extração tolerante
   * assume — o mesmo caminho de código, com mais nova tentativa.
   */
  suporteJson?: SuporteJson;
}

interface RespostaChat {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

export class OpenAiCompativelAdapter implements LlmProvider {
  readonly nome = "openai-compativel";
  readonly modelo: string;
  readonly suporteJson: SuporteJson;

  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;

  constructor(opcoes: OpcoesOpenAiCompativel) {
    // Normaliza a barra final: "http://localhost:11434/v1/" e sem barra
    // devem se comportar igual.
    this.baseUrl = opcoes.baseUrl.replace(/\/+$/, "");
    this.modelo = opcoes.modelo;
    this.apiKey = opcoes.apiKey;
    this.suporteJson = opcoes.suporteJson ?? "nativo";
  }

  async gerar(pedido: PedidoLlm): Promise<RespostaLlm> {
    const corpo: Record<string, unknown> = {
      model: this.modelo,
      max_tokens: pedido.maxTokens,
      temperature: 0, // determinismo na medida do possível
      messages: [
        { role: "system", content: this.sistemaComSchema(pedido) },
        { role: "user", content: pedido.usuario },
      ],
    };

    if (this.suporteJson === "nativo") {
      corpo["response_format"] = {
        type: "json_schema",
        json_schema: {
          name: pedido.nomeSchema,
          schema: pedido.jsonSchema,
          strict: true,
        },
      };
    } else if (this.suporteJson === "modo_json") {
      corpo["response_format"] = { type: "json_object" };
    }

    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), pedido.timeoutMs);

    let resposta: Response;
    try {
      resposta = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify(corpo),
        signal: controle.signal,
      });
    } catch (e) {
      if (controle.signal.aborted) {
        throw new AiError("TEMPO_ESGOTADO", "O provider não respondeu a tempo.");
      }
      throw new AiError(
        "INDISPONIVEL",
        `Não foi possível alcançar ${this.baseUrl}.`,
        String(e),
      );
    } finally {
      clearTimeout(relogio);
    }

    if (!resposta.ok) {
      throw traduzirStatus(resposta.status, await resposta.text().catch(() => ""));
    }

    const json = (await resposta.json().catch(() => null)) as RespostaChat | null;
    const texto = json?.choices?.[0]?.message?.content;

    if (typeof texto !== "string") {
      throw new AiError(
        "SAIDA_INVALIDA",
        "O provider devolveu uma resposta sem conteúdo.",
        json?.error?.message ?? JSON.stringify(json)?.slice(0, 500),
      );
    }

    return {
      texto,
      uso: {
        entrada: json?.usage?.prompt_tokens ?? 0,
        saida: json?.usage?.completion_tokens ?? 0,
      },
    };
  }

  /**
   * Quando o provider não garante formato, o schema entra no prompt.
   *
   * É a diferença entre "funciona com modelo aberto" e "funciona só com
   * provider de primeira linha". O Zod continua sendo o juiz nos dois casos.
   */
  private sistemaComSchema(pedido: PedidoLlm): string {
    if (this.suporteJson === "nativo") return pedido.sistema;

    return [
      pedido.sistema,
      "",
      "Responda APENAS com um objeto JSON que satisfaça este schema, sem texto em volta e sem cercas de markdown:",
      JSON.stringify(pedido.jsonSchema),
    ].join("\n");
  }
}

function traduzirStatus(status: number, corpo: string): AiError {
  const detalhe = corpo.slice(0, 500);

  if (status === 401 || status === 403) {
    return new AiError("NAO_AUTORIZADO", "Credencial recusada pelo provider.", detalhe);
  }
  if (status === 429) {
    return new AiError("LIMITE_EXCEDIDO", "Limite de uso do provider atingido.", detalhe);
  }
  if (status >= 500) {
    return new AiError("INDISPONIVEL", "O provider está fora do ar.", detalhe);
  }
  return new AiError("SAIDA_INVALIDA", "O provider recusou a requisição.", `${status}: ${detalhe}`);
}
