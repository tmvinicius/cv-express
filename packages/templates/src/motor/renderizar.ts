import { escapeLatex, escapeLatexUrl, type TextoLatex } from "../escape.js";

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  MOTOR DE RENDERIZAÇÃO                                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * DIVERGÊNCIA DO PLANEJAMENTO (seção 3.4)
 *
 * O planejamento previa "Handlebars configurado em modo restrito". Este é um
 * motor próprio, de propósito, e o motivo é de segurança:
 *
 * O escape padrão do Handlebars é escape de HTML. Para obter escape de LaTeX
 * seria preciso sobrescrever `Utils.escapeExpression` numa instância criada
 * com `Handlebars.create()` — um detalhe interno da biblioteca. Se uma versão
 * futura mudasse esse interno, o escape voltaria silenciosamente ao padrão
 * HTML, que deixa `\input{/etc/passwd}` passar intacto. Reverter em silêncio
 * para um padrão inseguro é o pior modo de falha possível justamente neste
 * módulo.
 *
 * Além disso, a sintaxe `{{{ }}}` do Handlebars não tem como ser desligada por
 * configuração — só varrendo o código-fonte do template, o que é remendo.
 *
 * O custo da escolha é real: perdemos helpers, partials aninhados complexos e
 * o ecossistema. Aceitável, porque a estrutura do currículo é fixa e pequena,
 * e porque toda a formatação já vive em TypeScript (formatadores.ts) por
 * exigência do próprio planejamento. Sobra para o template apenas
 * interpolação, blocos e inclusão — as ~150 linhas abaixo.
 *
 * O que o planejamento exigia, e continua valendo:
 *
 *   1. Escape por padrão, sem exceção  → todo `{{ }}` passa por escapeLatex
 *   2. Nenhuma sintaxe "raw"           → `{{{ }}}` é erro de compilação
 *   3. Falha ruidosa em campo ausente  → `{{ x }}` inexistente lança
 *   4. Determinismo                    → só caminhos explícitos são lidos
 */

// ── Sintaxe ─────────────────────────────────────────────────────────────────
//
//   {{ caminho.do.campo }}      interpolação — SEMPRE escapada como texto
//   {{& caminho }}              interpolação de URL — escapada como URL
//   {{ . }}                     o próprio item (listas de string)
//   {{# caminho }} … {{/ }}     bloco: itera se lista, renderiza se verdadeiro
//   {{> nomeDoPartial }}        inclusão
//
// Não existe sintaxe para inserir LaTeX cru a partir dos dados. Comandos
// LaTeX moram no arquivo .tex, que é do projeto; dados moram no CvData, que é
// do usuário. A fronteira não tem passagem.
//
// Sobre o `{{& }}`: ele NÃO é uma saída sem escape — é escape com a regra
// certa. O primeiro argumento de `\href` não aceita escape por contrabarra
// (o resultado seria uma URL diferente da pretendida), então ali vale
// percent-encoding. Sem uma marcação própria, uma URL interpolada com `{{ }}`
// viraria `https://github.com/foo\_bar` e o link quebraria — um defeito
// silencioso, porque o PDF continuaria sendo gerado.

type No =
  | { tipo: "texto"; valor: string }
  | { tipo: "valor"; caminho: string }
  | { tipo: "url"; caminho: string }
  | { tipo: "partial"; nome: string }
  | { tipo: "bloco"; caminho: string; filhos: No[] };

const TAG = /\{\{\s*([#/>&]?)\s*([^{}]*?)\s*\}\}/g;

/** Profundidade máxima de partials, para barrar inclusão circular. */
const PROFUNDIDADE_MAX = 10;

export class ErroDeTemplate extends Error {
  constructor(mensagem: string, public readonly template: string) {
    super(`[${template}] ${mensagem}`);
    this.name = "ErroDeTemplate";
  }
}

/**
 * Remove a linha inteira quando uma tag de bloco ou partial está sozinha nela.
 *
 * Isto não é cosmético. No LaTeX, uma linha em branco inicia um novo
 * parágrafo. Sem esta limpeza, um `{{# experiencias }}` sozinho numa linha
 * deixaria uma linha vazia no .tex e o PDF ganharia um espaçamento que
 * ninguém pediu — um defeito difícil de rastrear até o template.
 */
function removerLinhasDeTag(fonte: string): string {
  return fonte.replace(/^[ \t]*(\{\{[#/>][^{}]*\}\})[ \t]*\r?\n/gm, "$1");
}

export function compilar(fonte: string, nomeTemplate: string): No[] {
  if (fonte.includes("{{{")) {
    throw new ErroDeTemplate(
      "Sintaxe {{{ }}} não existe neste motor. Ela inseriria LaTeX sem escape, " +
        "que é exatamente o que o motor impede. Use {{ }}.",
      nomeTemplate,
    );
  }

  const limpa = removerLinhasDeTag(fonte);
  const raiz: No[] = [];
  const pilha: { caminho: string; filhos: No[] }[] = [];
  const atual = () => pilha[pilha.length - 1]?.filhos ?? raiz;

  let ultimo = 0;
  TAG.lastIndex = 0;

  for (let m = TAG.exec(limpa); m !== null; m = TAG.exec(limpa)) {
    const [bruto, marcador = "", conteudo = ""] = m;

    if (m.index > ultimo) {
      atual().push({ tipo: "texto", valor: limpa.slice(ultimo, m.index) });
    }
    ultimo = m.index + bruto.length;

    if (marcador === "#") {
      pilha.push({ caminho: conteudo, filhos: [] });
    } else if (marcador === "/") {
      const aberto = pilha.pop();
      if (!aberto) {
        throw new ErroDeTemplate(`Fechamento sem abertura: ${bruto}`, nomeTemplate);
      }
      // O fechamento pode ser {{/ }} ou repetir o caminho; se repetir, confere.
      if (conteudo !== "" && conteudo !== aberto.caminho) {
        throw new ErroDeTemplate(
          `Bloco "${aberto.caminho}" fechado como "${conteudo}".`,
          nomeTemplate,
        );
      }
      atual().push({ tipo: "bloco", caminho: aberto.caminho, filhos: aberto.filhos });
    } else if (marcador === ">") {
      atual().push({ tipo: "partial", nome: conteudo });
    } else {
      if (conteudo === "") {
        throw new ErroDeTemplate("Interpolação vazia: {{ }}", nomeTemplate);
      }
      atual().push({
        tipo: marcador === "&" ? "url" : "valor",
        caminho: conteudo,
      });
    }
  }

  if (ultimo < limpa.length) {
    atual().push({ tipo: "texto", valor: limpa.slice(ultimo) });
  }

  if (pilha.length > 0) {
    throw new ErroDeTemplate(
      `Bloco "${pilha[pilha.length - 1]!.caminho}" não foi fechado.`,
      nomeTemplate,
    );
  }

  return raiz;
}

/**
 * Resolve um caminho contra o contexto.
 *
 * Devolve `undefined` quando o caminho não existe. Quem chama decide se isso
 * é erro: um bloco `{{# telefone }}` está TESTANDO a existência, enquanto um
 * `{{ telefone }}` está EXIGINDO o valor. Essa distinção é o que permite ter
 * campos opcionais sem abrir mão da falha ruidosa.
 */
function resolver(contexto: unknown, caminho: string): unknown {
  if (caminho === ".") return contexto;

  let atual: unknown = contexto;
  for (const parte of caminho.split(".")) {
    if (atual === null || atual === undefined) return undefined;
    if (typeof atual !== "object") return undefined;
    atual = (atual as Record<string, unknown>)[parte];
  }
  return atual;
}

function vazio(valor: unknown): boolean {
  if (valor === undefined || valor === null || valor === false) return true;
  if (Array.isArray(valor)) return valor.length === 0;
  if (typeof valor === "string") return valor.length === 0;
  return false;
}

export interface OpcoesRender {
  /** Partials disponíveis, já compilados ou como fonte. */
  partials?: Readonly<Record<string, string>>;
  nomeTemplate?: string;
}

function renderNos(
  nos: readonly No[],
  contexto: unknown,
  partials: Readonly<Record<string, string>>,
  nomeTemplate: string,
  profundidade: number,
): string {
  let saida = "";

  for (const no of nos) {
    switch (no.tipo) {
      case "texto":
        saida += no.valor;
        break;

      case "valor": {
        const valor = resolver(contexto, no.caminho);
        if (valor === undefined || valor === null) {
          throw new ErroDeTemplate(
            `Campo "${no.caminho}" não existe no contexto. ` +
              `Campos opcionais precisam de um bloco {{# ${no.caminho} }}.`,
            nomeTemplate,
          );
        }
        if (typeof valor === "object") {
          throw new ErroDeTemplate(
            `Campo "${no.caminho}" é um objeto e não pode ser impresso.`,
            nomeTemplate,
          );
        }
        // O ponto onde todo dado do usuário é neutralizado.
        saida += escapeLatex(String(valor));
        break;
      }

      case "url": {
        const valor = resolver(contexto, no.caminho);
        if (typeof valor !== "string" || valor === "") {
          throw new ErroDeTemplate(
            `URL "${no.caminho}" ausente ou não é string. ` +
              `Envolva em um bloco {{# ${no.caminho} }} se for opcional.`,
            nomeTemplate,
          );
        }
        saida += escapeLatexUrl(valor);
        break;
      }

      case "bloco": {
        const valor = resolver(contexto, no.caminho);
        if (vazio(valor)) break;

        if (Array.isArray(valor)) {
          for (const item of valor) {
            saida += renderNos(no.filhos, item, partials, nomeTemplate, profundidade);
          }
        } else {
          // Verdadeiro e não-lista: renderiza uma vez, mantendo o contexto —
          // é o que faz {{ telefone }} continuar resolvendo dentro de
          // {{# telefone }}.
          saida += renderNos(no.filhos, contexto, partials, nomeTemplate, profundidade);
        }
        break;
      }

      case "partial": {
        if (profundidade >= PROFUNDIDADE_MAX) {
          throw new ErroDeTemplate(
            `Inclusão de partials passou de ${PROFUNDIDADE_MAX} níveis — provável ciclo em "${no.nome}".`,
            nomeTemplate,
          );
        }
        const fonte = partials[no.nome];
        if (fonte === undefined) {
          throw new ErroDeTemplate(`Partial "${no.nome}" não encontrado.`, nomeTemplate);
        }
        saida += renderNos(
          compilar(fonte, no.nome),
          contexto,
          partials,
          no.nome,
          profundidade + 1,
        );
        break;
      }
    }
  }

  return saida;
}

/**
 * Renderiza um template com o contexto dado.
 *
 * O retorno é `TextoLatex`: o motor é uma das poucas fontes legítimas desse
 * tipo, porque combina literais do projeto (o template) com dados já
 * escapados (as interpolações).
 */
export function renderizar(
  fonte: string,
  contexto: unknown,
  opcoes: OpcoesRender = {},
): TextoLatex {
  const nome = opcoes.nomeTemplate ?? "template";
  const nos = compilar(fonte, nome);
  return renderNos(nos, contexto, opcoes.partials ?? {}, nome, 0) as TextoLatex;
}
