/**
 * Dicionário pt-BR dos rótulos do DOCUMENTO.
 *
 * Só rótulos que saem impressos no PDF. Texto de interface (botões, mensagens
 * de erro, microcopy do formulário) não mora aqui — pertence ao app web.
 *
 * Este arquivo existe mesmo havendo um idioma só na V1. O custo é um arquivo;
 * o benefício é que acrescentar inglês na V2 vira escrever um segundo
 * dicionário com as mesmas chaves, em vez de garimpar strings espalhadas por
 * seis templates .tex.
 */
export const ptBR = {
  secoes: {
    objetivo: "Objetivo Profissional",
    experiencias: "Experiência Profissional",
    formacao: "Formação Acadêmica",
    habilidades: "Habilidades",
    idiomas: "Idiomas",
  },

  /**
   * Abreviações de mês. Três letras, minúsculas, sem ponto — a convenção
   * brasileira em currículo é "mar/2021", não "Mar. 2021".
   */
  meses: [
    "jan",
    "fev",
    "mar",
    "abr",
    "mai",
    "jun",
    "jul",
    "ago",
    "set",
    "out",
    "nov",
    "dez",
  ],

  periodo: {
    atual: "atual",
    /** Travessão com espaços. O LaTeX converte "--" em en-dash. */
    separador: " – ",
  },

  niveisIdioma: {
    basico: "Básico",
    intermediario: "Intermediário",
    avancado: "Avançado",
    fluente: "Fluente",
    nativo: "Nativo",
  },

  niveisFormacao: {
    tecnico: "Técnico",
    tecnologo: "Tecnólogo",
    graduacao: "Graduação",
    pos_graduacao: "Pós-graduação",
    mestrado: "Mestrado",
    doutorado: "Doutorado",
    curso_livre: "Curso livre",
  },

  statusFormacao: {
    concluido: "Concluído",
    em_andamento: "Em andamento",
    trancado: "Trancado",
  },

  categoriasHabilidade: {
    tecnica: "Técnicas",
    comportamental: "Comportamentais",
    ferramenta: "Ferramentas",
  },
} as const;

export type Dicionario = typeof ptBR;
