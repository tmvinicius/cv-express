import { z } from "zod";
import { LIMITES, anoMaximo } from "./limites.js";

/**
 * Datas do currículo.
 *
 * Por que { ano, mes } e não string: o planejamento (seção 2) exige ordenar
 * experiências e formatar períodos de forma idêntica em todos os currículos.
 * Com string livre ("jan/2023", "01/2023", "Janeiro de 2023") as duas coisas
 * são impossíveis. O formato de exibição é decidido no motor de templates,
 * nunca no dado.
 */
export const dataMesAnoSchema = z.object({
  ano: z.number().int().min(LIMITES.ANO_MIN).max(anoMaximo()),
  /** 1 = janeiro, 12 = dezembro. Humano, não o 0-11 do JavaScript. */
  mes: z.number().int().min(1).max(12),
});

export type DataMesAno = z.infer<typeof dataMesAnoSchema>;

/**
 * O fim de um período pode ser uma data ou o marcador "atual".
 *
 * "atual" não é uma data porque não é: seu significado muda com o tempo, e
 * gravar `new Date()` congelaria no momento do preenchimento — o currículo
 * ficaria errado no dia seguinte.
 */
export const ATUAL = "atual" as const;

export const fimPeriodoSchema = z.union([dataMesAnoSchema, z.literal(ATUAL)]);
export type FimPeriodo = z.infer<typeof fimPeriodoSchema>;

/** Converte para um inteiro comparável (ano * 12 + mês). */
export function emMeses(data: DataMesAno): number {
  return data.ano * 12 + data.mes;
}

/**
 * Compara dois pontos de um período. "atual" é sempre o mais recente.
 * Retorna negativo se a < b, zero se iguais, positivo se a > b.
 */
export function compararPeriodo(a: FimPeriodo, b: FimPeriodo): number {
  if (a === ATUAL && b === ATUAL) return 0;
  if (a === ATUAL) return 1;
  if (b === ATUAL) return -1;
  return emMeses(a) - emMeses(b);
}

/**
 * Período com início e fim, validado: o fim nunca é anterior ao início.
 *
 * Essa checagem vive aqui, no schema, e não na tela. O frontend vai repetir a
 * validação para dar feedback imediato, mas a garantia é desta camada — é o
 * que impede um período invertido de chegar ao PDF por uma chamada de API que
 * não passou pelo formulário.
 */
export const periodoSchema = z
  .object({
    inicio: dataMesAnoSchema,
    fim: fimPeriodoSchema,
  })
  .refine((p) => compararPeriodo(p.fim, p.inicio) >= 0, {
    message: "A data de término não pode ser anterior à de início.",
    path: ["fim"],
  });

export type Periodo = z.infer<typeof periodoSchema>;

/**
 * Ordena do mais recente para o mais antigo — a ordem esperada num currículo.
 *
 * Desempate pelo início, para que duas experiências terminadas no mesmo mês
 * saiam sempre na mesma ordem. Sem isso a saída não seria determinística, e o
 * cache por contentHash (seção 3.4) deixaria de funcionar.
 */
export function ordenarPorPeriodoDesc<T extends { periodo: Periodo }>(
  itens: readonly T[],
): T[] {
  return [...itens].sort((a, b) => {
    const porFim = compararPeriodo(b.periodo.fim, a.periodo.fim);
    if (porFim !== 0) return porFim;
    return emMeses(b.periodo.inicio) - emMeses(a.periodo.inicio);
  });
}
