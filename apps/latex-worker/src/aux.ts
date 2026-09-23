import type { PosicaoCampo } from "@cv-express/schema";

/**
 * Extração do mapa de posições a partir do .aux gerado pelo LaTeX.
 *
 * A macro \cvCampo (cvexpress.cls) grava três rótulos por campo:
 *
 *   \zref@newlabel{<fieldId>@x}{\posx{<sp>}}
 *   \zref@newlabel{<fieldId>@y}{\posy{<sp>}}
 *   \zref@newlabel{<fieldId>@p}{\abspage{<n>}...}
 *
 * Só quando os três existem o campo vira uma região clicável. Um campo
 * incompleto é descartado em silêncio — é o comportamento certo, porque o
 * planejamento (seção 3.5) estabelece que o preview degrada para o painel
 * lateral de seções quando o mapa falha. Mapa parcial não é erro.
 */

/**
 * Conversão de unidades do TeX.
 *
 * O TeX mede em "scaled points": 65536 sp = 1 pt (ponto de impressora,
 * 1/72,27 pol). O PDF mede em "big points": 1 bp = 1/72 pol. São unidades
 * diferentes com o mesmo nome coloquial, e confundi-las dá um erro de ~0,37%
 * — pequeno o bastante para passar despercebido numa página e grande o
 * bastante para desalinhar uma região clicável no rodapé.
 */
const SP_POR_PT = 65536;
const BP_POR_PT = 72 / 72.27;

export function spParaBp(sp: number): number {
  return (sp / SP_POR_PT) * BP_POR_PT;
}

/**
 * ATENÇÃO — ORIGEM DAS COORDENADAS NÃO CALIBRADA
 *
 * Assumimos a convenção do pdfTeX para \pdfsavepos: origem no canto INFERIOR
 * ESQUERDO da página, com y crescendo para cima — a mesma do PDF, o que torna
 * a conversão uma simples mudança de unidade.
 *
 * Isso não pôde ser conferido contra um PDF real (o Tectonic não estava
 * disponível no ambiente). Se na primeira compilação as regiões saírem
 * espelhadas na vertical ou deslocadas por uma polegada, o ajuste é aqui e em
 * nenhum outro lugar: esta função é o único ponto que traduz coordenadas.
 *
 * Calibragem sugerida: gerar um currículo de uma página, comparar a posição
 * relatada para `pessoal.nome` com a posição real no PDF, e corrigir.
 */
export function converterPosicao(xSp: number, ySp: number): { x: number; y: number } {
  return { x: spParaBp(xSp), y: spParaBp(ySp) };
}

/**
 * Casa `\zref@newlabel{nome}{corpo}`.
 *
 * O corpo pode conter chaves aninhadas (`\abspage{1}\default{}`), então um
 * `[^}]*` não serve. Usamos `[\s\S]*?` não-guloso até `}\n`, o formato em que
 * o LaTeX escreve o .aux — uma entrada por linha.
 */
const ENTRADA = /\\zref@newlabel\{([^}]+)\}\{([\s\S]*?)\}\s*$/gm;

/** Extrai `\prop{valor}` do corpo de uma entrada. */
function propriedade(corpo: string, nome: string): string | undefined {
  const m = new RegExp(`\\\\${nome}\\{([^}]*)\\}`).exec(corpo);
  return m?.[1];
}

interface Parcial {
  x?: number;
  y?: number;
  pagina?: number;
}

/**
 * Lê o .aux e devolve as posições dos campos ancorados.
 *
 * Nunca lança: um .aux ausente, truncado ou em formato inesperado devolve
 * lista vazia. O PDF já está pronto nesse ponto, e falhar a requisição inteira
 * por causa do recurso de edição por clique seria trocar um aprimoramento por
 * uma falha.
 */
export function extrairPosicoes(conteudoAux: string): PosicaoCampo[] {
  const parciais = new Map<string, Parcial>();

  ENTRADA.lastIndex = 0;
  for (let m = ENTRADA.exec(conteudoAux); m !== null; m = ENTRADA.exec(conteudoAux)) {
    const rotulo = m[1];
    const corpo = m[2];
    if (rotulo === undefined || corpo === undefined) continue;

    // O sufixo é o último "@" do rótulo. Buscar o último, e não o primeiro,
    // importa: fieldIds contêm ids gerados que podem incluir "@"? Não com o
    // alfabeto do nanoid — mas depender disso seria um acoplamento silencioso
    // entre dois módulos distantes.
    const corte = rotulo.lastIndexOf("@");
    if (corte <= 0) continue;

    const fieldId = rotulo.slice(0, corte);
    const sufixo = rotulo.slice(corte + 1);

    const atual = parciais.get(fieldId) ?? {};

    if (sufixo === "x") {
      const v = propriedade(corpo, "posx");
      if (v !== undefined) atual.x = Number(v);
    } else if (sufixo === "y") {
      const v = propriedade(corpo, "posy");
      if (v !== undefined) atual.y = Number(v);
    } else if (sufixo === "p") {
      const v = propriedade(corpo, "abspage");
      if (v !== undefined) atual.pagina = Number(v);
    } else {
      continue;
    }

    parciais.set(fieldId, atual);
  }

  const posicoes: PosicaoCampo[] = [];

  for (const [fieldId, p] of parciais) {
    // Os três componentes, todos numéricos. Um NaN vindo de .aux corrompido
    // viraria uma região clicável em posição absurda.
    if (p.x === undefined || p.y === undefined || p.pagina === undefined) continue;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    if (!Number.isInteger(p.pagina) || p.pagina < 1) continue;

    const { x, y } = converterPosicao(p.x, p.y);
    posicoes.push({ fieldId, pagina: p.pagina, x, y });
  }

  // Ordem estável: o .aux reflete a ordem de compilação, que é estável, mas
  // o Map preserva ordem de inserção e não de conteúdo. Ordenar aqui torna a
  // resposta comparável entre execuções e os testes legíveis.
  posicoes.sort((a, b) => a.fieldId.localeCompare(b.fieldId));

  return posicoes;
}
