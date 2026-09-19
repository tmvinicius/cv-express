import { z } from "zod";
import { cvDataCompletoSchema } from "./cv.js";

/**
 * Contrato HTTP do latex-worker.
 *
 * Vive em @cv-express/schema porque é compartilhado: o worker o implementa, o
 * app web o consome, e os dois precisam concordar byte a byte.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DECISÃO DE SEGURANÇA: O WORKER NÃO ACEITA .tex
 *
 * O fluxo do planejamento (seção 1) desenha o web gerando o .tex e enviando-o
 * ao worker. Aqui o worker recebe o CvData e gera o .tex ele mesmo.
 *
 * O motivo: um endpoint que aceita .tex arbitrário é, por definição, um
 * endpoint de execução remota de LaTeX. Quem alcançasse o worker — um bug de
 * SSRF no web, um contêiner comprometido, uma regra de rede frouxa — poderia
 * mandar `\input{/etc/passwd}` direto, e todo o trabalho de escape do
 * packages/templates seria contornado por completo.
 *
 * Recebendo CvData, o worker sempre re-deriva o .tex pelo pipeline de escape.
 * Não existe caminho que chegue ao Tectonic sem passar por escapeLatex. O
 * custo é duplicar a geração (web gera para o preview, worker gera para
 * compilar), e ela é determinística, então os dois resultados batem — o
 * contentHash é justamente a prova disso.
 * ────────────────────────────────────────────────────────────────────────────
 */

export const compilarRequestSchema = z.object({
  cv: cvDataCompletoSchema,
  /**
   * contentHash que o cliente calculou. Opcional.
   *
   * Quando enviado, o worker compara com o seu: se baterem e houver PDF em
   * cache, responde sem chamar o Tectonic. Se divergirem, a compilação segue
   * normalmente e a resposta traz o hash do worker — divergência indica
   * versões diferentes do pacote de templates entre web e worker, que é
   * informação útil e não motivo para recusar.
   */
  contentHashEsperado: z.string().length(64).optional(),
});
export type CompilarRequest = z.infer<typeof compilarRequestSchema>;

/**
 * Posição de um campo no PDF, em pontos PDF (1/72"), origem no canto inferior
 * esquerdo da página.
 */
export const posicaoCampoSchema = z.object({
  fieldId: z.string(),
  pagina: z.number().int().positive(),
  x: z.number(),
  y: z.number(),
});
export type PosicaoCampo = z.infer<typeof posicaoCampoSchema>;

export const compilarRespostaSchema = z.object({
  contentHash: z.string(),
  templateId: z.string(),
  templateVersao: z.string(),
  pageCount: z.number().int().positive(),
  /** PDF em base64. */
  pdf: z.string(),
  /**
   * Mapa de posições para a edição por clique.
   *
   * Pode vir vazio: a extração depende de o LaTeX ter gravado as âncoras no
   * .aux, e o planejamento (seção 3.5) é explícito em que o preview degrada
   * para o painel lateral de seções nesse caso. Mapa vazio NÃO é erro.
   */
  posicoes: z.array(posicaoCampoSchema),
  /** Milissegundos gastos no Tectonic. Para observabilidade. */
  duracaoMs: z.number().int().nonnegative(),
  /** true quando a resposta veio do cache e o Tectonic não rodou. */
  doCache: z.boolean(),
});
export type CompilarResposta = z.infer<typeof compilarRespostaSchema>;

/**
 * Taxonomia de erros de compilação.
 *
 * Fechada de propósito: o app web faz `switch` sobre ela para escolher a
 * mensagem que o usuário vê. Se o worker pudesse inventar códigos, o web
 * cairia no caso genérico sem perceber.
 */
export const codigoErroCompilacaoSchema = z.enum([
  /** O CvData não passou na validação. Culpa do cliente. */
  "DADOS_INVALIDOS",
  /** O LaTeX falhou. Quase sempre um defeito nosso de template. */
  "FALHA_LATEX",
  /** Passou do tempo limite — laço infinito ou documento gigante. */
  "TEMPO_ESGOTADO",
  /** A fila está cheia. O cliente pode tentar de novo. */
  "SOBRECARGA",
  /** Erro inesperado no worker. */
  "ERRO_INTERNO",
]);
export type CodigoErroCompilacao = z.infer<typeof codigoErroCompilacaoSchema>;

export const erroCompilacaoSchema = z.object({
  codigo: codigoErroCompilacaoSchema,
  /**
   * Mensagem segura para exibir.
   *
   * NUNCA contém o log do LaTeX: ele carrega caminhos absolutos do servidor e
   * nomes de arquivos internos (seção 5.3 do planejamento). O log vai para o
   * log estruturado do worker, indexado pelo requestId.
   */
  mensagem: z.string(),
  /** Correlaciona com o log do servidor, onde os detalhes ficam. */
  requestId: z.string(),
});
export type ErroCompilacao = z.infer<typeof erroCompilacaoSchema>;
