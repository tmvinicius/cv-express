import { z } from "zod";
import { LIMITES } from "./limites.js";
import { periodoSchema } from "./data.js";

/** Texto obrigatório, sem espaços nas pontas e não vazio. */
const textoCurto = (max: number = LIMITES.CAMPO_CURTO_MAX) =>
  z.string().trim().min(1).max(max);

/** Texto opcional: string vazia vira `undefined`, para não poluir o PDF. */
const textoOpcional = (max: number = LIMITES.CAMPO_CURTO_MAX) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? undefined : v))
    .optional();

const urlOpcional = () =>
  z
    .string()
    .trim()
    .max(300)
    .url("Informe uma URL completa, começando com https://")
    .optional()
    .or(z.literal("").transform(() => undefined));

/**
 * Estado do polimento por IA de um trecho.
 *
 * `rejected` não é um erro: é o usuário dizendo "prefiro o meu texto". O motor
 * de templates lê este campo para decidir entre `bullets` e o texto original
 * (seção 3.3), então ele precisa ser explícito e não inferido da lista vazia.
 */
export const statusIaSchema = z.enum(["none", "pending", "applied", "rejected"]);
export type StatusIa = z.infer<typeof statusIaSchema>;

// ── Dados pessoais ──────────────────────────────────────────────────────────

export const dadosPessoaisSchema = z.object({
  nome: textoCurto(LIMITES.NOME_MAX),

  /**
   * Coletada, NUNCA renderizada no PDF na V1 (decisão de negócio registrada
   * no planejamento). O campo vive aqui, fora do template. Se um dia a decisão
   * mudar, é uma linha no template — sem migração de dados.
   */
  idade: z.number().int().min(14).max(120).optional(),

  cidade: textoCurto(),
  email: z.string().trim().toLowerCase().email().max(254),
  telefone: textoOpcional(40),
  linkedin: urlOpcional(),
  github: urlOpcional(),
  portfolio: urlOpcional(),
});
export type DadosPessoais = z.infer<typeof dadosPessoaisSchema>;

// ── Objetivo ────────────────────────────────────────────────────────────────

export const objetivoSchema = z.object({
  texto: z.string().trim().max(LIMITES.OBJETIVO_MAX),
});
export type Objetivo = z.infer<typeof objetivoSchema>;

// ── Experiência ─────────────────────────────────────────────────────────────

export const experienciaSchema = z.object({
  id: z.string().min(1),
  cargo: textoCurto(),
  empresa: textoCurto(),
  cidade: textoOpcional(),
  periodo: periodoSchema,

  /**
   * O que o usuário escreveu, exatamente como escreveu.
   *
   * IMUTÁVEL. A IA nunca escreve aqui — ela escreve em `bullets`. Esta é a
   * garantia que sustenta o "desfazer" e a prova de que nada foi inventado
   * (seções 2 e 4.6 do planejamento).
   */
  descricaoOriginal: z.string().trim().max(LIMITES.DESCRICAO_MAX),

  /** Versão organizada — pela IA ou editada à mão pelo usuário. */
  bullets: z
    .array(z.string().trim().min(1).max(LIMITES.BULLET_MAX))
    .max(LIMITES.BULLETS_POR_EXPERIENCIA_MAX)
    .default([]),

  statusIa: statusIaSchema.default("none"),
});
export type Experiencia = z.infer<typeof experienciaSchema>;

// ── Formação ────────────────────────────────────────────────────────────────

export const nivelFormacaoSchema = z.enum([
  "tecnico",
  "tecnologo",
  "graduacao",
  "pos_graduacao",
  "mestrado",
  "doutorado",
  "curso_livre",
]);
export type NivelFormacao = z.infer<typeof nivelFormacaoSchema>;

export const statusFormacaoSchema = z.enum([
  "concluido",
  "em_andamento",
  "trancado",
]);
export type StatusFormacao = z.infer<typeof statusFormacaoSchema>;

export const formacaoSchema = z.object({
  id: z.string().min(1),
  curso: textoCurto(),
  instituicao: textoCurto(),
  nivel: nivelFormacaoSchema,
  status: statusFormacaoSchema,
  periodo: periodoSchema,
});
export type Formacao = z.infer<typeof formacaoSchema>;

// ── Idiomas ─────────────────────────────────────────────────────────────────

export const nivelIdiomaSchema = z.enum([
  "basico",
  "intermediario",
  "avancado",
  "fluente",
  "nativo",
]);
export type NivelIdioma = z.infer<typeof nivelIdiomaSchema>;

export const idiomaSchema = z.object({
  id: z.string().min(1),
  idioma: textoCurto(60),
  nivel: nivelIdiomaSchema,
});
export type Idioma = z.infer<typeof idiomaSchema>;

// ── Habilidades ─────────────────────────────────────────────────────────────

export const categoriaHabilidadeSchema = z.enum([
  "tecnica",
  "comportamental",
  "ferramenta",
]);
export type CategoriaHabilidade = z.infer<typeof categoriaHabilidadeSchema>;

export const habilidadeSchema = z.object({
  id: z.string().min(1),
  nome: textoCurto(LIMITES.HABILIDADE_MAX),
  categoria: categoriaHabilidadeSchema,
});
export type Habilidade = z.infer<typeof habilidadeSchema>;

export const habilidadesSchema = z.object({
  /** Entrada livre do usuário. Imutável, pelo mesmo motivo de `descricaoOriginal`. */
  textoOriginal: z.string().trim().max(LIMITES.HABILIDADES_TEXTO_MAX),
  itens: z
    .array(habilidadeSchema)
    .max(LIMITES.ITENS_MAX.habilidades)
    .default([]),
  statusIa: statusIaSchema.default("none"),
});
export type Habilidades = z.infer<typeof habilidadesSchema>;

// ── Documento ───────────────────────────────────────────────────────────────

/**
 * Idioma do documento. Só pt-BR na V1 (decisão de negócio).
 *
 * O campo existe mesmo com um valor único de propósito: acrescentar "en" na V2
 * vira estender este enum e adicionar um dicionário, em vez de garimpar
 * strings espalhadas pelo template.
 */
export const localeSchema = z.enum(["pt-BR"]);
export type Locale = z.infer<typeof localeSchema>;

export const templateIdSchema = z.enum(["classico"]);
export type TemplateId = z.infer<typeof templateIdSchema>;

export const cvDataSchema = z.object({
  id: z.string().min(1),
  locale: localeSchema.default("pt-BR"),
  templateId: templateIdSchema.default("classico"),
  atualizadoEm: z.string().datetime(),

  pessoal: dadosPessoaisSchema,
  objetivo: objetivoSchema,
  experiencias: z.array(experienciaSchema).max(LIMITES.ITENS_MAX.experiencias),
  formacao: z.array(formacaoSchema).max(LIMITES.ITENS_MAX.formacao),
  idiomas: z.array(idiomaSchema).max(LIMITES.ITENS_MAX.idiomas),
  habilidades: habilidadesSchema,
});

export type CvData = z.infer<typeof cvDataSchema>;

/**
 * Schema completo, com o teto de tamanho do documento serializado.
 *
 * Separado de `cvDataSchema` porque serializar para medir custa caro: o
 * frontend valida campo a campo a cada tecla com o schema simples, e só a
 * borda da API (onde o dado é desconhecido e potencialmente hostil) paga o
 * preço da checagem completa.
 */
export const cvDataCompletoSchema = cvDataSchema.superRefine((cv, ctx) => {
  const bytes = Buffer.byteLength(JSON.stringify(cv), "utf8");
  if (bytes > LIMITES.SESSAO_BYTES_MAX) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        `O currículo tem ${Math.round(bytes / 1024)}KB, acima do limite de ` +
        `${Math.round(LIMITES.SESSAO_BYTES_MAX / 1024)}KB. Reduza as descrições mais longas.`,
    });
  }
});

/**
 * Valida um dado de origem desconhecida (corpo de requisição, linha do banco).
 * Devolve o resultado do Zod em vez de lançar — quem chama decide o que fazer.
 */
export function validarCv(entrada: unknown) {
  return cvDataCompletoSchema.safeParse(entrada);
}
