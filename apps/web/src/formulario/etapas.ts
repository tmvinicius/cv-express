import {
  dadosPessoaisSchema,
  objetivoSchema,
  experienciaSchema,
  formacaoSchema,
  idiomaSchema,
  habilidadesSchema,
  type CvData,
} from "@cv-express/schema";

/**
 * As 9 etapas do formulário (seção 6 do planejamento), declarativas.
 *
 * Cada etapa sabe validar a si mesma reaproveitando o SUB-SCHEMA da sua seção,
 * que já existe em @cv-express/schema. Isso resolve um problema que aparece só
 * agora: `validarCv` exige o currículo inteiro, mas o formulário precisa
 * validar etapa por etapa — rascunho incompleto é estado legítimo, e travar o
 * avanço por causa de um campo que ainda nem foi mostrado seria absurdo.
 *
 * A alternativa seria escrever nove schemas novos, que sairiam de sincronia
 * com o schema canônico no primeiro campo acrescentado. Aqui não há schema
 * novo: só se escolhe qual pedaço do currículo validar.
 */

export type IdEtapa =
  | "boas-vindas"
  | "pessoal"
  | "objetivo"
  | "experiencias"
  | "formacao"
  | "idiomas"
  | "habilidades"
  | "gerando"
  | "preview";

export interface Etapa {
  id: IdEtapa;
  /** Posição na barra de progresso. */
  rotulo: string;
  /**
   * Etapa opcional pode ser pulada mesmo vazia.
   *
   * O planejamento pede que isso seja VISÍVEL para o usuário — alguém sem
   * segundo idioma não pode achar que travou.
   */
  opcional: boolean;
  /**
   * Conta para a barra de progresso.
   *
   * Boas-vindas, "gerando" e preview não contam: a primeira não pede nada, e
   * as duas últimas vêm depois do preenchimento. Incluí-las faria a barra
   * mostrar 11% antes de a pessoa digitar qualquer coisa — animador e falso.
   */
  contaNoProgresso: boolean;
  /** Erros desta etapa, ou lista vazia. Nunca olha o resto do currículo. */
  validar: (cv: CvData) => string[];
  /** A pessoa já mexeu nesta etapa? Usado para marcar o progresso. */
  preenchida: (cv: CvData) => boolean;
}

/** Extrai mensagens legíveis de um resultado do Zod. */
function errosDe(resultado: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }): string[] {
  if (resultado.success || !resultado.error) return [];
  return resultado.error.issues.map((i) =>
    i.path.length > 0 ? `${i.path.join(".")}: ${i.message}` : i.message,
  );
}

/** Valida cada item de uma lista e devolve os erros com o índice na frente. */
function errosDaLista<T>(
  itens: readonly T[],
  valida: (item: T) => { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } },
  nomeItem: string,
): string[] {
  return itens.flatMap((item, i) =>
    errosDe(valida(item)).map((e) => `${nomeItem} ${i + 1} — ${e}`),
  );
}

export const ETAPAS: readonly Etapa[] = [
  {
    id: "boas-vindas",
    rotulo: "Boas-vindas",
    opcional: false,
    contaNoProgresso: false,
    validar: () => [],
    preenchida: () => true,
  },
  {
    id: "pessoal",
    rotulo: "Seus dados",
    opcional: false,
    contaNoProgresso: true,
    validar: (cv) => errosDe(dadosPessoaisSchema.safeParse(cv.pessoal)),
    preenchida: (cv) => cv.pessoal.nome !== "" && cv.pessoal.email !== "",
  },
  {
    id: "objetivo",
    rotulo: "Objetivo",
    opcional: false,
    contaNoProgresso: true,
    validar: (cv) => errosDe(objetivoSchema.safeParse(cv.objetivo)),
    preenchida: (cv) => cv.objetivo.texto.trim() !== "",
  },
  {
    id: "experiencias",
    rotulo: "Experiências",
    // Opcional porque primeiro emprego existe. Exigir experiência de quem
    // está começando é justamente travar quem mais precisa do produto.
    opcional: true,
    contaNoProgresso: true,
    validar: (cv) =>
      errosDaLista(cv.experiencias, (e) => experienciaSchema.safeParse(e), "Experiência"),
    preenchida: (cv) => cv.experiencias.length > 0,
  },
  {
    id: "formacao",
    rotulo: "Formação",
    opcional: true,
    contaNoProgresso: true,
    validar: (cv) =>
      errosDaLista(cv.formacao, (f) => formacaoSchema.safeParse(f), "Formação"),
    preenchida: (cv) => cv.formacao.length > 0,
  },
  {
    id: "idiomas",
    rotulo: "Idiomas",
    opcional: true,
    contaNoProgresso: true,
    validar: (cv) => errosDaLista(cv.idiomas, (i) => idiomaSchema.safeParse(i), "Idioma"),
    preenchida: (cv) => cv.idiomas.length > 0,
  },
  {
    id: "habilidades",
    rotulo: "Habilidades",
    opcional: true,
    contaNoProgresso: true,
    validar: (cv) => errosDe(habilidadesSchema.safeParse(cv.habilidades)),
    preenchida: (cv) =>
      cv.habilidades.textoOriginal.trim() !== "" || cv.habilidades.itens.length > 0,
  },
  {
    id: "gerando",
    rotulo: "Gerando",
    opcional: false,
    contaNoProgresso: false,
    validar: () => [],
    preenchida: () => true,
  },
  {
    id: "preview",
    rotulo: "Seu currículo",
    opcional: false,
    contaNoProgresso: false,
    validar: () => [],
    preenchida: () => true,
  },
] as const;

export function etapaPorId(id: IdEtapa): Etapa {
  const e = ETAPAS.find((x) => x.id === id);
  if (!e) throw new Error(`Etapa desconhecida: ${id}`);
  return e;
}

export function indiceDa(id: IdEtapa): number {
  return ETAPAS.findIndex((e) => e.id === id);
}
