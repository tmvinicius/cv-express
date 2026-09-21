/**
 * Taxonomia única de erros da camada de IA.
 *
 * Cada adapter traduz suas falhas para cá. Sem isso, a degradação graciosa
 * precisaria conhecer o formato de erro de cada provider — exatamente o
 * vazamento que a porta existe para evitar.
 */
export type CodigoAiError =
  /** Estouro de cota do provider. Vale tentar de novo depois. */
  | "LIMITE_EXCEDIDO"
  /** O provider não respondeu no tempo. */
  | "TEMPO_ESGOTADO"
  /** Respondeu, mas fora do formato — mesmo após a nova tentativa. */
  | "SAIDA_INVALIDA"
  /** Provider fora do ar ou inalcançável. */
  | "INDISPONIVEL"
  /** Credencial ausente ou recusada. */
  | "NAO_AUTORIZADO"
  /** A saída violou um guardrail: inventou algo ou expandiu demais. */
  | "GUARDRAIL"
  /** Teto de chamadas da sessão. */
  | "COTA_DA_SESSAO";

export class AiError extends Error {
  constructor(
    public readonly codigo: CodigoAiError,
    mensagem: string,
    /** Detalhe técnico para o log. Nunca para o usuário. */
    public readonly detalhe?: string,
  ) {
    super(mensagem);
    this.name = "AiError";
  }

  /**
   * Vale tentar de novo?
   *
   * Usado por quem chama para decidir entre repetir e desistir. GUARDRAIL não
   * é tentável: se o modelo inventou uma métrica, repetir tende a inventar
   * outra — o certo é ficar com o texto original.
   */
  get tentavelNovamente(): boolean {
    return (
      this.codigo === "LIMITE_EXCEDIDO" ||
      this.codigo === "TEMPO_ESGOTADO" ||
      this.codigo === "INDISPONIVEL"
    );
  }
}

/**
 * Resultado sem exceção.
 *
 * A camada de IA nunca lança para o chamador: o planejamento exige que uma
 * falha de IA jamais bloqueie a geração do currículo. Devolver um resultado
 * explícito torna impossível esquecer de tratar — o TypeScript obriga a olhar
 * o campo `ok` antes de acessar os dados.
 */
export type Resultado<T> =
  | { ok: true; dados: T; uso: { entrada: number; saida: number } }
  | { ok: false; erro: AiError };
