import {
  novaExperiencia,
  novaFormacao,
  novoIdioma,
  type CategoriaHabilidade,
  type CvData,
  type DataMesAno,
  type Experiencia,
  type FimPeriodo,
  type Formacao,
  type Idioma,
  type NivelFormacao,
  type NivelIdioma,
  type StatusFormacao,
} from "@cv-express/schema";

/**
 * Todas as alterações do currículo passam por aqui.
 *
 * Redutor puro: recebe o currículo e uma ação, devolve um currículo novo.
 * Nenhuma tela muta o CvData diretamente.
 *
 * Isso não é preferência de estilo. É o que permite garantir, em um lugar só
 * e com teste, as invariantes que o produto inteiro promete — principalmente
 * a de que `descricaoOriginal` e `textoOriginal` nunca são sobrescritos.
 * Espalhado por sete telas, cada uma montando seu `setState`, essa garantia
 * viraria disciplina.
 */

export type AcaoCv =
  | { tipo: "pessoal"; campo: keyof CvData["pessoal"]; valor: string | number | undefined }
  | { tipo: "objetivo"; texto: string }
  // Experiências
  | { tipo: "exp:adicionar" }
  | { tipo: "exp:remover"; id: string }
  | { tipo: "exp:campo"; id: string; campo: "cargo" | "empresa" | "cidade" | "descricaoOriginal"; valor: string }
  | { tipo: "exp:periodo"; id: string; inicio?: DataMesAno; fim?: FimPeriodo }
  | { tipo: "exp:aplicarIa"; id: string; bullets: string[] }
  | { tipo: "exp:recusarIa"; id: string }
  | { tipo: "exp:editarBullet"; id: string; indice: number; valor: string }
  // Formação
  | { tipo: "form:adicionar" }
  | { tipo: "form:remover"; id: string }
  | { tipo: "form:campo"; id: string; campo: "curso" | "instituicao"; valor: string }
  | { tipo: "form:nivel"; id: string; nivel: NivelFormacao }
  | { tipo: "form:status"; id: string; status: StatusFormacao }
  | { tipo: "form:periodo"; id: string; inicio?: DataMesAno; fim?: FimPeriodo }
  // Idiomas
  | { tipo: "idioma:adicionar" }
  | { tipo: "idioma:remover"; id: string }
  | { tipo: "idioma:nome"; id: string; valor: string }
  | { tipo: "idioma:nivel"; id: string; nivel: NivelIdioma }
  // Habilidades
  | { tipo: "hab:texto"; valor: string }
  | { tipo: "hab:aplicarIa"; itens: { id: string; nome: string; categoria: CategoriaHabilidade }[] }
  | { tipo: "hab:recusarIa" }
  | { tipo: "hab:remover"; id: string };

/** Troca um item da lista pelo resultado da função, preservando a ordem. */
function mapearItem<T extends { id: string }>(
  lista: readonly T[],
  id: string,
  transformar: (item: T) => T,
): T[] {
  return lista.map((item) => (item.id === id ? transformar(item) : item));
}

export function reduzir(cv: CvData, acao: AcaoCv): CvData {
  switch (acao.tipo) {
    case "pessoal":
      return { ...cv, pessoal: { ...cv.pessoal, [acao.campo]: acao.valor } };

    case "objetivo":
      return { ...cv, objetivo: { texto: acao.texto } };

    // ── Experiências ────────────────────────────────────────────────────
    case "exp:adicionar":
      return { ...cv, experiencias: [...cv.experiencias, novaExperiencia()] };

    case "exp:remover":
      return {
        ...cv,
        experiencias: cv.experiencias.filter((e) => e.id !== acao.id),
      };

    case "exp:campo":
      return {
        ...cv,
        experiencias: mapearItem(cv.experiencias, acao.id, (e) => ({
          ...e,
          [acao.campo]: acao.valor,
          /**
           * Editar a descrição invalida a sugestão da IA.
           *
           * Sem isso, a pessoa reescreve o texto e o PDF continua saindo com
           * os bullets do texto ANTIGO — um defeito silencioso, porque tudo
           * parece ter funcionado.
           */
          ...(acao.campo === "descricaoOriginal"
            ? { bullets: [], statusIa: "none" as const }
            : {}),
        })),
      };

    case "exp:periodo":
      return {
        ...cv,
        experiencias: mapearItem(cv.experiencias, acao.id, (e) => ({
          ...e,
          periodo: {
            inicio: acao.inicio ?? e.periodo.inicio,
            fim: acao.fim ?? e.periodo.fim,
          },
        })),
      };

    case "exp:aplicarIa":
      return {
        ...cv,
        experiencias: mapearItem(cv.experiencias, acao.id, (e) => ({
          ...e,
          // descricaoOriginal NÃO aparece aqui, e é o ponto: a IA escreve em
          // bullets e nunca por cima do que a pessoa escreveu.
          bullets: [...acao.bullets],
          statusIa: "applied",
        })),
      };

    case "exp:recusarIa":
      return {
        ...cv,
        experiencias: mapearItem(cv.experiencias, acao.id, (e) => ({
          ...e,
          bullets: [],
          statusIa: "rejected",
        })),
      };

    case "exp:editarBullet":
      return {
        ...cv,
        experiencias: mapearItem(cv.experiencias, acao.id, (e) => ({
          ...e,
          bullets: e.bullets.map((b, i) => (i === acao.indice ? acao.valor : b)),
        })),
      };

    // ── Formação ────────────────────────────────────────────────────────
    case "form:adicionar":
      return { ...cv, formacao: [...cv.formacao, novaFormacao()] };

    case "form:remover":
      return { ...cv, formacao: cv.formacao.filter((f) => f.id !== acao.id) };

    case "form:campo":
      return {
        ...cv,
        formacao: mapearItem(cv.formacao, acao.id, (f) => ({
          ...f,
          [acao.campo]: acao.valor,
        })),
      };

    case "form:nivel":
      return {
        ...cv,
        formacao: mapearItem(cv.formacao, acao.id, (f) => ({ ...f, nivel: acao.nivel })),
      };

    case "form:status":
      return {
        ...cv,
        formacao: mapearItem(cv.formacao, acao.id, (f) => ({ ...f, status: acao.status })),
      };

    case "form:periodo":
      return {
        ...cv,
        formacao: mapearItem(cv.formacao, acao.id, (f) => ({
          ...f,
          periodo: {
            inicio: acao.inicio ?? f.periodo.inicio,
            fim: acao.fim ?? f.periodo.fim,
          },
        })),
      };

    // ── Idiomas ─────────────────────────────────────────────────────────
    case "idioma:adicionar":
      return { ...cv, idiomas: [...cv.idiomas, novoIdioma()] };

    case "idioma:remover":
      return { ...cv, idiomas: cv.idiomas.filter((i) => i.id !== acao.id) };

    case "idioma:nome":
      return {
        ...cv,
        idiomas: mapearItem(cv.idiomas, acao.id, (i) => ({ ...i, idioma: acao.valor })),
      };

    case "idioma:nivel":
      return {
        ...cv,
        idiomas: mapearItem(cv.idiomas, acao.id, (i) => ({ ...i, nivel: acao.nivel })),
      };

    // ── Habilidades ─────────────────────────────────────────────────────
    case "hab:texto":
      return {
        ...cv,
        habilidades: {
          ...cv.habilidades,
          textoOriginal: acao.valor,
          // Mesma lógica da descrição: mexer no texto invalida a normalização
          // que a IA fez a partir dele.
          itens: [],
          statusIa: "none",
        },
      };

    case "hab:aplicarIa":
      return {
        ...cv,
        habilidades: {
          ...cv.habilidades,
          itens: [...acao.itens],
          statusIa: "applied",
        },
      };

    case "hab:recusarIa":
      return {
        ...cv,
        habilidades: { ...cv.habilidades, itens: [], statusIa: "rejected" },
      };

    case "hab:remover":
      return {
        ...cv,
        habilidades: {
          ...cv.habilidades,
          itens: cv.habilidades.itens.filter((h) => h.id !== acao.id),
        },
      };
  }
}

/** Atalhos tipados para as telas, para evitar literais soltos espalhados. */
export type Despachar = (acao: AcaoCv) => void;
export type { Experiencia, Formacao, Idioma };
