import type { CvData } from "./cv.js";

/**
 * Identificador de um campo editável do currículo.
 *
 * É o mesmo identificador em três lugares: no formulário (qual editor abrir),
 * no `.tex` (a macro `\cvCampo`) e no mapa de posições devolvido pelo worker.
 * Um identificador só significa que não existe tabela de tradução entre
 * formulário e PDF para manter sincronizada (seção 3.5 do planejamento).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DIVERGÊNCIA DELIBERADA DO PLANEJAMENTO
 *
 * A seção 3.5 exemplifica com `experiencias.3.cargo` — endereçamento por
 * ÍNDICE. Aqui usamos o ID ESTÁVEL do item: `experiencias.V1StGXR8_Z5j.cargo`.
 *
 * Motivo: índice é posição, não identidade. O usuário pode apagar a segunda
 * experiência ou reordenar a lista enquanto o PDF anterior ainda está na tela.
 * Com índice, `experiencias.3.cargo` passa a apontar para outra experiência —
 * o clique abriria o editor errado, e o mapa de coordenadas ficaria
 * silenciosamente desalinhado. Nenhum erro seria lançado; o usuário só veria
 * o campo errado abrir.
 *
 * O ID já existe no schema justamente para isso ("todo item de lista tem id
 * estável", seção 2). A intenção do planejamento — um identificador só,
 * derivado do caminho no CvData, sem tabela de tradução — fica preservada.
 * ────────────────────────────────────────────────────────────────────────────
 */
export type FieldId = string & { readonly __marca: "FieldId" };

/** Separador do caminho. Os ids do nanoid nunca contêm ponto. */
const SEP = ".";

export const CAMPOS_PESSOAIS = [
  "nome",
  "cidade",
  "email",
  "telefone",
  "linkedin",
  "github",
  "portfolio",
] as const;
export type CampoPessoal = (typeof CAMPOS_PESSOAIS)[number];

export const CAMPOS_EXPERIENCIA = [
  "cargo",
  "empresa",
  "cidade",
  "periodo",
  "bullets",
] as const;
export type CampoExperiencia = (typeof CAMPOS_EXPERIENCIA)[number];

export const CAMPOS_FORMACAO = [
  "curso",
  "instituicao",
  "nivel",
  "status",
  "periodo",
] as const;
export type CampoFormacao = (typeof CAMPOS_FORMACAO)[number];

export const CAMPOS_IDIOMA = ["idioma", "nivel"] as const;
export type CampoIdioma = (typeof CAMPOS_IDIOMA)[number];

/** Forma estruturada de um FieldId, depois do parse. */
export type CampoRef =
  | { secao: "pessoal"; campo: CampoPessoal }
  | { secao: "objetivo" }
  | { secao: "experiencias"; itemId: string; campo: CampoExperiencia }
  | { secao: "formacao"; itemId: string; campo: CampoFormacao }
  | { secao: "idiomas"; itemId: string; campo: CampoIdioma }
  | { secao: "habilidades" };

/**
 * Um id de item não pode conter o separador, senão o caminho fica ambíguo.
 * O alfabeto padrão do nanoid (A-Za-z0-9_-) já respeita isso; esta checagem
 * existe para o dia em que alguém trocar o gerador de ids.
 */
function validarItemId(itemId: string): void {
  if (itemId.length === 0 || itemId.includes(SEP)) {
    throw new Error(
      `Id de item inválido: ${JSON.stringify(itemId)}. ` +
        `Não pode ser vazio nem conter "${SEP}".`,
    );
  }
}

// ── Construtores ────────────────────────────────────────────────────────────

export const campo = {
  pessoal: (c: CampoPessoal): FieldId => `pessoal${SEP}${c}` as FieldId,

  objetivo: (): FieldId => "objetivo" as FieldId,

  experiencia: (itemId: string, c: CampoExperiencia): FieldId => {
    validarItemId(itemId);
    return `experiencias${SEP}${itemId}${SEP}${c}` as FieldId;
  },

  formacao: (itemId: string, c: CampoFormacao): FieldId => {
    validarItemId(itemId);
    return `formacao${SEP}${itemId}${SEP}${c}` as FieldId;
  },

  idioma: (itemId: string, c: CampoIdioma): FieldId => {
    validarItemId(itemId);
    return `idiomas${SEP}${itemId}${SEP}${c}` as FieldId;
  },

  habilidades: (): FieldId => "habilidades" as FieldId,
} as const;

// ── Parse ───────────────────────────────────────────────────────────────────

function ehMembro<T extends readonly string[]>(
  lista: T,
  valor: string,
): valor is T[number] {
  return (lista as readonly string[]).includes(valor);
}

/**
 * Converte um FieldId de volta em forma estruturada.
 *
 * Devolve `null` em vez de lançar: a entrada vem do `.aux` gerado pelo LaTeX
 * e de cliques no navegador. Um mapa de posições com uma entrada obsoleta
 * (campo que já não existe) é uma situação esperada, não um defeito — o
 * preview simplesmente ignora aquela região.
 */
export function parseFieldId(bruto: string): CampoRef | null {
  const partes = bruto.split(SEP);
  const [secao] = partes;

  if (secao === "objetivo" && partes.length === 1) {
    return { secao: "objetivo" };
  }

  if (secao === "habilidades" && partes.length === 1) {
    return { secao: "habilidades" };
  }

  if (secao === "pessoal" && partes.length === 2) {
    const c = partes[1]!;
    return ehMembro(CAMPOS_PESSOAIS, c) ? { secao: "pessoal", campo: c } : null;
  }

  if (partes.length === 3) {
    const itemId = partes[1]!;
    const c = partes[2]!;
    if (itemId === "") return null;

    if (secao === "experiencias" && ehMembro(CAMPOS_EXPERIENCIA, c)) {
      return { secao: "experiencias", itemId, campo: c };
    }
    if (secao === "formacao" && ehMembro(CAMPOS_FORMACAO, c)) {
      return { secao: "formacao", itemId, campo: c };
    }
    if (secao === "idiomas" && ehMembro(CAMPOS_IDIOMA, c)) {
      return { secao: "idiomas", itemId, campo: c };
    }
  }

  return null;
}

/**
 * Resolve um FieldId contra um currículo e devolve o valor apontado.
 *
 * Usado pelo preview: ao clicar numa região do PDF, descobrir qual dado abrir
 * para edição. Devolve `undefined` quando o campo não existe mais — o item
 * pode ter sido apagado entre a compilação e o clique.
 */
export function resolverCampo(cv: CvData, ref: CampoRef): unknown {
  switch (ref.secao) {
    case "pessoal":
      return cv.pessoal[ref.campo];

    case "objetivo":
      return cv.objetivo.texto;

    case "habilidades":
      return cv.habilidades.itens;

    case "experiencias":
      return cv.experiencias.find((e) => e.id === ref.itemId)?.[ref.campo];

    case "formacao":
      return cv.formacao.find((f) => f.id === ref.itemId)?.[ref.campo];

    case "idiomas":
      return cv.idiomas.find((i) => i.id === ref.itemId)?.[ref.campo];
  }
}
