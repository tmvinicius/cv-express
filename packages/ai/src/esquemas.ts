import { z } from "zod";
import { LIMITES, categoriaHabilidadeSchema } from "@cv-express/schema";

/**
 * Formatos de saída da IA.
 *
 * Cada um aparece duas vezes, e a duplicação é deliberada:
 *
 * - **Zod** é o JUIZ. Valida a resposta de qualquer adapter, sempre, antes de
 *   o dado tocar o CvData. É a única garantia que não depende do provider.
 * - **JSON Schema** é a DICA. Vai junto do pedido, para o provider que souber
 *   usá-la. Um modelo que ignore a dica ainda passa pelo juiz.
 *
 * Por que não gerar o JSON Schema a partir do Zod: o helper oficial do SDK da
 * Anthropic (`zodOutputFormat`) exige zod v4, e o projeto está no v3. Adotar
 * o helper amarraria a camada de IA à versão de zod de um provider específico
 * — o oposto do que este pacote existe para fazer. Como são só dois formatos,
 * pequenos e estáveis, escrevê-los à mão custa menos que o acoplamento.
 *
 * Se os dois divergirem, o Zod vence e a saída é recusada. O teste
 * "schema e jsonSchema descrevem a mesma coisa" existe para pegar isso cedo.
 */

// ── Experiência ─────────────────────────────────────────────────────────────

export const saidaExperienciaSchema = z.object({
  bullets: z
    .array(z.string().trim().min(1).max(LIMITES.BULLET_MAX))
    .min(1)
    .max(LIMITES.BULLETS_POR_EXPERIENCIA_MAX),
});
export type SaidaExperiencia = z.infer<typeof saidaExperienciaSchema>;

export const jsonSchemaExperiencia = {
  type: "object",
  properties: {
    bullets: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
      maxItems: LIMITES.BULLETS_POR_EXPERIENCIA_MAX,
    },
  },
  required: ["bullets"],
  additionalProperties: false,
} as const satisfies Record<string, unknown>;

// ── Habilidades ─────────────────────────────────────────────────────────────

export const saidaHabilidadesSchema = z.object({
  itens: z
    .array(
      z.object({
        nome: z.string().trim().min(1).max(LIMITES.HABILIDADE_MAX),
        categoria: categoriaHabilidadeSchema,
      }),
    )
    .max(LIMITES.ITENS_MAX.habilidades),
});
export type SaidaHabilidades = z.infer<typeof saidaHabilidadesSchema>;

export const jsonSchemaHabilidades = {
  type: "object",
  properties: {
    itens: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nome: { type: "string" },
          categoria: {
            type: "string",
            enum: ["tecnica", "comportamental", "ferramenta"],
          },
        },
        required: ["nome", "categoria"],
        additionalProperties: false,
      },
      maxItems: LIMITES.ITENS_MAX.habilidades,
    },
  },
  required: ["itens"],
  additionalProperties: false,
} as const satisfies Record<string, unknown>;
