/**
 * Normalização de texto — executada ANTES do escape.
 *
 * Duas coisas acontecem aqui, e ambas existem por motivo concreto neste
 * projeto. Nenhuma delas é "limpeza genérica de string".
 */

/**
 * Caracteres invisíveis removidos.
 *
 * - Zero-width (U+200B-200D, U+2060, U+FEFF): invisíveis, atrapalham a busca
 *   no PDF e podem quebrar a quebra de linha do LaTeX sem deixar rastro.
 * - Controles de direção (U+200E-200F, U+202A-202E, U+2066-2069): são o vetor
 *   do ataque conhecido como Trojan Source — permitem que o texto exibido na
 *   tela tenha ordem diferente do texto real armazenado. Num currículo isso
 *   significaria o usuário ver uma coisa e o PDF conter outra.
 * - Controles C0/C1, exceto tabulação e quebra de linha: não têm representação
 *   e alguns fazem o Tectonic abortar a compilação.
 *
 * O caractere é removido, não substituído: ele não deveria existir no texto de
 * um currículo, e apagá-lo é o comportamento menos surpreendente.
 */
const INVISIVEIS =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

/**
 * Normaliza texto vindo do usuário.
 *
 * NFC é obrigatório, não cosmético. "café" pode chegar como `e` + acento
 * combinante (U+0065 U+0301) ou como `é` precomposto (U+00E9) — visualmente
 * idênticos, bytes diferentes. Navegadores e sistemas operacionais divergem
 * em qual produzem, e o macOS costuma entregar a forma decomposta.
 *
 * Sem normalizar, duas consequências:
 *
 * 1. O mesmo currículo geraria .tex com bytes diferentes conforme a máquina
 *    do usuário, quebrando o determinismo que o cache por contentHash exige
 *    (seção 3.4 do planejamento).
 * 2. A forma decomposta depende de o LaTeX aplicar o acento combinante
 *    corretamente, o que varia com a fonte — justamente o ponto que mais
 *    quebra em template importado.
 *
 * Também normaliza CRLF para LF: o Windows envia CRLF em textarea, e o \r
 * sobreviveria ao escape indo parar no .tex.
 */
export function sanitizarTexto(bruto: string): string {
  return bruto
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(INVISIVEIS, "");
}

/**
 * Colapsa quebras de linha excessivas.
 *
 * No LaTeX, duas quebras seguidas iniciam um novo parágrafo; três ou mais não
 * fazem nada além de duas. O usuário que apertou Enter seis vezes no textarea
 * não está pedindo seis parágrafos — está formatando no olho. Normalizar aqui
 * mantém o espaçamento do PDF sob controle do template, e não do usuário.
 */
export function colapsarLinhas(texto: string): string {
  return texto.replace(/\n{3,}/g, "\n\n").trim();
}
