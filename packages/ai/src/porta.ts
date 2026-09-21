/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  CAMADA 2 — A PORTA                                                      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * A única coisa que um adapter precisa implementar.
 *
 * Deliberadamente mínima: quanto menos a porta expõe, menos detalhe de um
 * provider específico consegue vazar para cima. Não há `temperature`, não há
 * `stream`, não há mensagens de sistema separadas — nada que só um provider
 * tenha.
 *
 * Quem consome a IA no projeto NÃO usa esta interface. Usa o CvAiService
 * (servico.ts), que fala de currículo e não de modelo de linguagem.
 */

import type { ZodType } from "zod";

/**
 * Como o provider garante saída estruturada.
 *
 * O adapter declara o que sabe fazer e o serviço não precisa saber o nome do
 * provider para decidir a estratégia — é o que permite acrescentar um adapter
 * novo sem tocar em código de decisão.
 */
export type SuporteJson =
  /** Mecanismo dedicado: Claude com output_config, OpenAI com json_schema. */
  | "nativo"
  /** Só sabe "responda em JSON", sem garantir formato. */
  | "modo_json"
  /** Nenhuma garantia. O schema vai no prompt e rezamos. */
  | "nenhum";

export interface PedidoLlm {
  /** Instrução do papel. Vem de prompts.ts, escrita uma vez. */
  sistema: string;
  /** Dados do usuário, já delimitados. */
  usuario: string;
  /** O formato esperado. O Zod é o juiz final, em qualquer adapter. */
  schema: ZodType;
  /** JSON Schema equivalente, enviado ao provider como dica. */
  jsonSchema: Record<string, unknown>;
  /** Nome curto do formato, exigido por alguns providers. */
  nomeSchema: string;
  maxTokens: number;
  timeoutMs: number;
}

export interface UsoTokens {
  entrada: number;
  saida: number;
}

export interface RespostaLlm {
  /**
   * Texto bruto devolvido pelo provider.
   *
   * O adapter NÃO interpreta nem valida: quem faz isso é o serviço, com a
   * mesma rotina para todos. Se cada adapter validasse do seu jeito, trocar
   * de provider poderia mudar o rigor da checagem sem ninguém perceber.
   */
  texto: string;
  uso: UsoTokens;
}

export interface LlmProvider {
  readonly nome: string;
  readonly modelo: string;
  readonly suporteJson: SuporteJson;

  gerar(pedido: PedidoLlm): Promise<RespostaLlm>;
}
