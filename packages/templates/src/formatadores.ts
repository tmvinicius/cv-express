import { dicionario, type Dicionario } from "@cv-express/i18n";
import {
  ATUAL,
  type CategoriaHabilidade,
  type DataMesAno,
  type Habilidade,
  type Locale,
  type NivelFormacao,
  type NivelIdioma,
  type Periodo,
  type StatusFormacao,
} from "@cv-express/schema";

/**
 * Formatação do documento.
 *
 * Requisito da seção 3.4 do planejamento: toda formatação acontece aqui, nunca
 * no template. É o que garante que "mar/2021 – atual" saia idêntico em todos
 * os currículos gerados — se cada partial montasse a data do seu jeito, a
 * padronização dependeria de disciplina em vez de código.
 */

export function formatarMes(data: DataMesAno, dic: Dicionario): string {
  // O mês é 1-12 no schema; o array é 0-11.
  const nome = dic.meses[data.mes - 1];
  if (nome === undefined) {
    // Inalcançável com dado validado pelo Zod, mas falhar alto é melhor do
    // que imprimir "undefined/2021" num currículo.
    throw new Error(`Mês fora da faixa 1-12: ${data.mes}`);
  }
  return `${nome}/${data.ano}`;
}

/**
 * "mar/2021 – jun/2024" ou "mar/2021 – atual".
 */
export function formatarPeriodo(periodo: Periodo, dic: Dicionario): string {
  const inicio = formatarMes(periodo.inicio, dic);
  const fim =
    periodo.fim === ATUAL
      ? dic.periodo.atual
      : formatarMes(periodo.fim, dic);
  return `${inicio}${dic.periodo.separador}${fim}`;
}

export function formatarNivelIdioma(
  nivel: NivelIdioma,
  dic: Dicionario,
): string {
  return dic.niveisIdioma[nivel];
}

export function formatarNivelFormacao(
  nivel: NivelFormacao,
  dic: Dicionario,
): string {
  return dic.niveisFormacao[nivel];
}

export function formatarStatusFormacao(
  status: StatusFormacao,
  dic: Dicionario,
): string {
  return dic.statusFormacao[status];
}

/** Ordem fixa das categorias de habilidade no PDF. */
const ORDEM_CATEGORIAS: readonly CategoriaHabilidade[] = [
  "tecnica",
  "ferramenta",
  "comportamental",
] as const;

export interface GrupoHabilidades {
  categoria: CategoriaHabilidade;
  rotulo: string;
  /** Nomes já ordenados, prontos para juntar com vírgula no template. */
  nomes: string[];
}

/**
 * Agrupa habilidades por categoria, em ordem fixa.
 *
 * Duas decisões de determinismo, ambas necessárias para o cache por
 * contentHash (seção 3.4):
 *
 * 1. As categorias saem sempre na mesma ordem, definida em ORDEM_CATEGORIAS —
 *    e não na ordem em que apareceram na resposta da IA, que varia entre
 *    chamadas mesmo com a mesma entrada.
 * 2. Dentro de cada categoria, os nomes são ordenados com `localeCompare`
 *    fixado em pt-BR, para que "Ágil" e "Análise" fiquem na posição correta
 *    independentemente do locale do servidor. Sem fixar, o mesmo currículo
 *    geraria ordens diferentes conforme a variável LANG da máquina.
 *
 * Categorias sem nenhuma habilidade não entram no resultado — é o que impede
 * um título de categoria órfão no PDF.
 */
export function agruparHabilidades(
  itens: readonly Habilidade[],
  dic: Dicionario,
): GrupoHabilidades[] {
  const colator = new Intl.Collator("pt-BR", { sensitivity: "base" });

  return ORDEM_CATEGORIAS.flatMap((categoria) => {
    const nomes = itens
      .filter((h) => h.categoria === categoria)
      .map((h) => h.nome)
      .sort((a, b) => colator.compare(a, b));

    if (nomes.length === 0) return [];

    return [
      {
        categoria,
        rotulo: dic.categoriasHabilidade[categoria],
        nomes,
      },
    ];
  });
}

/** Atalho para quem só tem o locale em mãos. */
export function formatadoresPara(locale: Locale) {
  const dic = dicionario(locale);
  return {
    dic,
    mes: (d: DataMesAno) => formatarMes(d, dic),
    periodo: (p: Periodo) => formatarPeriodo(p, dic),
    nivelIdioma: (n: NivelIdioma) => formatarNivelIdioma(n, dic),
    nivelFormacao: (n: NivelFormacao) => formatarNivelFormacao(n, dic),
    statusFormacao: (s: StatusFormacao) => formatarStatusFormacao(s, dic),
    habilidades: (h: readonly Habilidade[]) => agruparHabilidades(h, dic),
  };
}
