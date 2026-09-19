/**
 * Tetos técnicos de segurança.
 *
 * Decisão de produto (PLANEJAMENTO.md, "Decisões de negócio"): o usuário não
 * tem limite. Decisão de infraestrutura: o servidor tem.
 *
 * Os números abaixo são altos o bastante para que nenhum currículo real
 * encoste neles — quem tem 50 experiências profissionais não existe — mas
 * baixos o bastante para que um campo de 10MB não derrube a compilação do
 * LaTeX nem estoure o custo da chamada de IA.
 *
 * Estes limites são validados na BORDA (no parse do Zod), antes de qualquer
 * processamento. Se um valor chega ao motor de templates, já passou por aqui.
 */
export const LIMITES = {
  /** Texto livre que o usuário digita para descrever uma experiência. */
  DESCRICAO_MAX: 5_000,

  /** Objetivo profissional — um parágrafo, não uma redação. */
  OBJETIVO_MAX: 1_500,

  /** Campos curtos de uma linha: cargo, empresa, curso, instituição, cidade. */
  CAMPO_CURTO_MAX: 200,

  /** Nome da pessoa. */
  NOME_MAX: 120,

  /** Um bullet de experiência, já organizado. */
  BULLET_MAX: 500,

  /** Quantos bullets uma experiência pode ter. */
  BULLETS_POR_EXPERIENCIA_MAX: 12,

  /** Entrada livre da etapa de habilidades. */
  HABILIDADES_TEXTO_MAX: 2_000,

  /** Nome de uma habilidade individual, após normalização. */
  HABILIDADE_MAX: 80,

  ITENS_MAX: {
    experiencias: 50,
    formacao: 30,
    idiomas: 20,
    habilidades: 100,
  },

  /**
   * Teto do documento serializado. Guarda-chuva contra a soma de campos
   * individualmente válidos: 50 experiências × 5.000 caracteres passa em
   * todas as regras acima e ainda assim é grande demais para a fila.
   */
  SESSAO_BYTES_MAX: 200 * 1024,

  /** Faixa de anos aceita em datas. Fora disso é erro de digitação. */
  ANO_MIN: 1950,
  ANO_MAX_FUTURO: 10,
} as const;

/** Ano máximo aceito — calculado na chamada, não no carregamento do módulo. */
export function anoMaximo(agora: Date = new Date()): number {
  return agora.getUTCFullYear() + LIMITES.ANO_MAX_FUTURO;
}
