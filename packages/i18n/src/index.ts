/**
 * @cv-express/i18n — rótulos do documento gerado.
 *
 * Só pt-BR na V1. A função `dicionario()` existe para que o motor de
 * templates já consulte por locale desde agora: quando o inglês entrar, ela
 * ganha um caso a mais e nenhum chamador muda.
 */
import { ptBR, type Dicionario } from "./pt-BR.js";

export { ptBR };
export type { Dicionario };

export type LocaleSuportado = "pt-BR";

export function dicionario(locale: LocaleSuportado = "pt-BR"): Dicionario {
  switch (locale) {
    case "pt-BR":
      return ptBR;
  }
}
