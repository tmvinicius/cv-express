import { sanitizarTexto, colapsarLinhas } from "./sanitizar.js";

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  PONTO ÚNICO DE ESCAPE DO PROJETO                                        ║
 * ║                                                                          ║
 * ║  Todo valor vindo do usuário passa por aqui antes de entrar no .tex.     ║
 * ║  Sem exceção. Sem caminho alternativo.                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Por que isso é crítico: LaTeX não é uma linguagem de marcação, é uma
 * linguagem de programação Turing-completa. Um usuário que digite
 * `\input{/etc/passwd}` no campo "cargo" faz o servidor ler um arquivo
 * arbitrário e despejá-lo no PDF; `\write18{...}` executa comandos no
 * shell. Não é hipótese — é o comportamento normal do LaTeX com entrada
 * não escapada.
 *
 * Existe um segundo tipo de ataque, mais sutil e igualmente sério: o usuário
 * não precisa injetar um comando novo, basta FECHAR o comando em que o texto
 * dele está. Um `}` no campo "empresa" encerra `\cvItem{...}` antes da hora,
 * e o resto do template passa a ser interpretado fora do contexto esperado.
 * Por isso `{` e `}` são tão perigosos quanto `\`.
 */

/**
 * Texto já escapado e seguro para interpolar no .tex.
 *
 * O tipo é "marcado" (branded): uma `string` comum não é atribuível a
 * `TextoLatex`. Isso transforma "esqueci de escapar este campo" de um bug de
 * produção silencioso em um erro de compilação do TypeScript — o motor de
 * templates aceita apenas `TextoLatex` nos pontos de interpolação.
 */
export type TextoLatex = string & { readonly __latexSeguro: unique symbol };

/**
 * Mapa de substituição.
 *
 * Dois estilos de escape, e a diferença importa:
 *
 * - `\{` e `\$` — o contrabarra desativa o significado especial do caractere
 *   seguinte. Funciona para os que têm essa forma.
 * - `\textbackslash{}` e `\textasciitilde{}` — macros, para os caracteres em
 *   que o contrabarra NÃO desativa o significado. `\~` não imprime um til:
 *   é o acento til, que se aplicaria à próxima letra (`\~n` vira "ñ").
 *   O mesmo vale para `\^`. E `\\` não imprime uma barra: é quebra de linha.
 *
 * O `{}` no fim das macros impede que o LaTeX engula o espaço seguinte —
 * sem ele, "a \textbackslash b" sairia como "a \b" colado.
 */
const SUBSTITUICOES: Readonly<Record<string, string>> = Object.freeze({
  "\\": "\\textbackslash{}",
  "{": "\\{",
  "}": "\\}",
  $: "\\$",
  "&": "\\&",
  "#": "\\#",
  "^": "\\textasciicircum{}",
  _: "\\_",
  "~": "\\textasciitilde{}",
  "%": "\\%",
});

/**
 * Uma única passagem, com uma única expressão regular.
 *
 * Isto é deliberado e não é otimização: substituir caractere por caractere em
 * passagens sucessivas re-processaria os contrabarras que a própria função
 * acabou de introduzir. `\` viraria `\textbackslash{}` e, na passagem
 * seguinte, o `\` desse resultado seria escapado de novo, em cascata. Uma
 * passagem só torna o double-escaping impossível por construção, em vez de
 * depender da ordem das substituições.
 */
const CARACTERES_ESPECIAIS = /[\\{}$&#^_~%]/g;

/**
 * Escapa texto do usuário para uso seguro no .tex.
 *
 * Preserva acentuação e caracteres não-ASCII sem alteração — `ç`, `ã`, `é`
 * são texto normal para o LaTeX moderno com UTF-8, e mexer neles quebraria
 * justamente o que precisa funcionar em português.
 */
export function escapeLatex(bruto: string): TextoLatex {
  const limpo = sanitizarTexto(bruto);
  const escapado = limpo.replace(
    CARACTERES_ESPECIAIS,
    (c) => SUBSTITUICOES[c] as string,
  );
  return escapado as TextoLatex;
}

/**
 * Escapa texto multilinha, preservando parágrafos.
 *
 * Usado na descrição de experiência quando o usuário recusou a sugestão da IA
 * e o texto original vira um bloco corrido (seção 3.3 do planejamento).
 */
export function escapeLatexParagrafos(bruto: string): TextoLatex {
  const limpo = colapsarLinhas(sanitizarTexto(bruto));
  const escapado = limpo.replace(
    CARACTERES_ESPECIAIS,
    (c) => SUBSTITUICOES[c] as string,
  );
  // Linha em branco é o separador de parágrafo do LaTeX; já está correto
  // depois do colapso, então nada mais a fazer aqui.
  return escapado as TextoLatex;
}

/**
 * Caracteres que quebram o argumento de `\href{...}`.
 *
 * O primeiro argumento do `\href` não é texto comum: `%` inicia comentário,
 * `#` é parâmetro de macro, `\` inicia comando, `{}` delimitam o argumento.
 * Escapar com contrabarra não serve aqui — o resultado seria uma URL
 * literalmente diferente da pretendida.
 *
 * A solução é percent-encoding, que URLs aceitam nativamente: `%5C` continua
 * sendo a mesma URL para o navegador, e é inofensivo para o LaTeX.
 */
const URL_PERIGOSOS = /[\\{}%#^~$&_]/g;

/**
 * Prepara uma URL para o primeiro argumento de `\href`.
 *
 * Recebe apenas URLs que o schema já validou como http/https (o Zod barra o
 * resto em `packages/schema`), então isto trata da camada LaTeX, não da
 * validação de protocolo — `javascript:` nunca chega aqui.
 *
 * Nota sobre `#`: percent-encodá-lo transforma um fragmento em texto literal,
 * o que tecnicamente altera a URL. É uma troca consciente: links de currículo
 * são perfis do LinkedIn e GitHub, onde fragmento praticamente não ocorre, e
 * um fragmento quebrado é um preço muito menor do que uma injeção de LaTeX.
 */
export function escapeLatexUrl(bruto: string): TextoLatex {
  const limpo = sanitizarTexto(bruto).trim();
  const seguro = limpo.replace(URL_PERIGOSOS, (c) => {
    const codigo = c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0");
    return `%${codigo}`;
  });
  return seguro as TextoLatex;
}

/**
 * Marca uma string como segura SEM escapar.
 *
 * Existe para o conteúdo que o próprio projeto produz — comandos montados
 * pelo motor de templates, como `\cvSecao{Experiência}`. Nunca para texto
 * do usuário.
 *
 * O nome é longo e desagradável de propósito: ele deve saltar aos olhos em
 * revisão de código. Se aparecer perto de qualquer coisa vinda de `CvData`,
 * é um defeito de segurança.
 */
export function confiarComoLatex(literalDoProjeto: string): TextoLatex {
  return literalDoProjeto as TextoLatex;
}

/**
 * Junta partes já escapadas.
 *
 * Aceita apenas `TextoLatex`, então não há como concatenar texto cru por
 * descuido — o TypeScript recusa.
 */
export function juntarLatex(
  partes: readonly TextoLatex[],
  separador = "",
): TextoLatex {
  return partes.join(separador) as TextoLatex;
}
