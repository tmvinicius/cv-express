import { randomUUID } from "node:crypto";
import { validarCv, type CompilarResposta, type CvData } from "@cv-express/schema";
import { gerarTex } from "@cv-express/templates";

import { extrairPosicoes } from "./aux.js";
import { Fila, FilaCheiaError } from "./fila.js";
import {
  FalhaLatexError,
  TempoEsgotadoError,
  type ExecutorTectonic,
} from "./tectonic.js";
import { ErroDeCompilacao } from "./erros.js";
import type { Config } from "./config.js";

/**
 * Serviço de compilação: orquestra validação, geração, fila, Tectonic e
 * extração de posições.
 *
 * Note o que NÃO entra aqui: o .tex nunca chega de fora. O serviço recebe
 * CvData e chama gerarTex ele mesmo, então não existe caminho até o Tectonic
 * que pule o escape (ver a justificativa em packages/schema/src/worker.ts).
 */

interface EntradaCache {
  resposta: Omit<CompilarResposta, "doCache">;
  gravadoEm: number;
}

export interface Registrador {
  info(dados: Record<string, unknown>, msg: string): void;
  erro(dados: Record<string, unknown>, msg: string): void;
}

export class ServicoCompilacao {
  private readonly fila: Fila;
  private readonly cache = new Map<string, EntradaCache>();

  constructor(
    private readonly executor: ExecutorTectonic,
    private readonly config: Config,
    private readonly log: Registrador,
  ) {
    this.fila = new Fila({
      concorrencia: config.concorrencia,
      tamanhoMaximo: config.filaMaxima,
    });
  }

  get estado() {
    return {
      ativas: this.fila.ativas,
      aguardando: this.fila.tamanho,
      cache: this.cache.size,
    };
  }

  async compilar(
    entrada: unknown,
    contentHashEsperado?: string,
  ): Promise<CompilarResposta> {
    const requestId = randomUUID();

    // Validação na borda. O dado vem da rede e é desconhecido até aqui.
    const validado = validarCv(entrada);
    if (!validado.success) {
      const primeiro = validado.error.issues[0];
      throw new ErroDeCompilacao(
        "DADOS_INVALIDOS",
        primeiro
          ? `Currículo inválido em "${primeiro.path.join(".")}": ${primeiro.message}`
          : "Currículo inválido.",
        requestId,
        400,
      );
    }

    const cv: CvData = validado.data;
    const gerado = gerarTex(cv);

    if (contentHashEsperado && contentHashEsperado !== gerado.contentHash) {
      // Não é motivo para recusar: significa que web e worker estão com
      // versões diferentes do pacote de templates. Vale registrar, porque é
      // exatamente o tipo de divergência que passa despercebida até alguém
      // notar um PDF com layout antigo.
      this.log.info(
        { requestId, esperado: contentHashEsperado, obtido: gerado.contentHash },
        "contentHash divergente entre cliente e worker",
      );
    }

    const emCache = this.buscarNoCache(gerado.contentHash);
    if (emCache) {
      return { ...emCache, doCache: true };
    }

    let resultado;
    try {
      resultado = await this.fila.executar(() =>
        this.executor.compilar({
          tex: gerado.tex,
          classe: gerado.classe,
          timeoutMs: this.config.timeoutCompilacaoMs,
        }),
      );
    } catch (e) {
      throw this.traduzirErro(e, requestId);
    }

    /**
     * A extração de posições nunca derruba a requisição.
     *
     * O PDF já está pronto neste ponto. Falhar tudo porque o recurso de
     * edição por clique não pôde ser montado seria trocar um aprimoramento
     * por uma falha — e o planejamento (seção 3.5) já define o painel lateral
     * de seções como o caminho que funciona sem o mapa.
     */
    let posicoes: CompilarResposta["posicoes"] = [];
    try {
      posicoes = extrairPosicoes(resultado.aux);
    } catch (e) {
      this.log.erro({ requestId, erro: String(e) }, "falha ao extrair posições do .aux");
    }

    const resposta: Omit<CompilarResposta, "doCache"> = {
      contentHash: gerado.contentHash,
      templateId: gerado.templateId,
      templateVersao: gerado.templateVersao,
      pageCount: contarPaginas(resultado.pdf),
      pdf: resultado.pdf.toString("base64"),
      posicoes,
      duracaoMs: resultado.duracaoMs,
    };

    this.guardarNoCache(gerado.contentHash, resposta);

    this.log.info(
      {
        requestId,
        contentHash: gerado.contentHash,
        paginas: resposta.pageCount,
        posicoes: posicoes.length,
        duracaoMs: resultado.duracaoMs,
      },
      "compilação concluída",
    );

    return { ...resposta, doCache: false };
  }

  /**
   * Traduz a falha interna em erro de contrato.
   *
   * O log bruto do LaTeX fica AQUI, no log do servidor, indexado pelo
   * requestId. Ele carrega caminhos absolutos e nomes de arquivos internos —
   * mandá-lo ao cliente vazaria a topologia do servidor (seção 5.3).
   */
  private traduzirErro(e: unknown, requestId: string): ErroDeCompilacao {
    if (e instanceof FilaCheiaError) {
      return new ErroDeCompilacao(
        "SOBRECARGA",
        "Estamos com muitos currículos na fila. Tente de novo em alguns segundos.",
        requestId,
        503,
      );
    }

    if (e instanceof TempoEsgotadoError) {
      this.log.erro({ requestId, timeoutMs: e.timeoutMs }, "compilação estourou o tempo");
      return new ErroDeCompilacao(
        "TEMPO_ESGOTADO",
        "A geração demorou mais que o esperado. Tente reduzir o tamanho das descrições.",
        requestId,
        504,
      );
    }

    if (e instanceof FalhaLatexError) {
      this.log.erro({ requestId, log: e.log }, `falha do LaTeX: ${e.message}`);
      return new ErroDeCompilacao(
        "FALHA_LATEX",
        "Não conseguimos montar o PDF do seu currículo. Nossa equipe foi avisada.",
        requestId,
        500,
      );
    }

    this.log.erro({ requestId, erro: String(e) }, "erro inesperado na compilação");
    return new ErroDeCompilacao(
      "ERRO_INTERNO",
      "Algo deu errado do nosso lado. Tente de novo em instantes.",
      requestId,
      500,
    );
  }

  private buscarNoCache(hash: string): Omit<CompilarResposta, "doCache"> | null {
    const entrada = this.cache.get(hash);
    if (!entrada) return null;

    if (Date.now() - entrada.gravadoEm > this.config.cacheTtlMs) {
      this.cache.delete(hash);
      return null;
    }
    return entrada.resposta;
  }

  private guardarNoCache(hash: string, resposta: Omit<CompilarResposta, "doCache">): void {
    // Despejo simples do mais antigo. PDFs em base64 ocupam memória, e um
    // cache sem teto derruba o contêiner depois de algumas centenas de
    // currículos distintos.
    if (this.cache.size >= this.config.cacheMaximo) {
      const maisAntigo = this.cache.keys().next().value;
      if (maisAntigo !== undefined) this.cache.delete(maisAntigo);
    }
    this.cache.set(hash, { resposta, gravadoEm: Date.now() });
  }
}

/**
 * Conta as páginas do PDF.
 *
 * Lê a estrutura do arquivo em vez de usar uma biblioteca: a contagem de
 * páginas é o único dado que precisamos do PDF, e o planejamento só a usa
 * para o aviso de "passou de uma página".
 *
 * Procura `/Type /Page` (com o cuidado de não casar `/Type /Pages`, que é o
 * nó de árvore e apareceria uma vez a mais). Se nada for encontrado, devolve
 * 1: um PDF existe e tem ao menos uma página, e errar a contagem só
 * desliga um aviso — nunca vale falhar a requisição por isso.
 */
export function contarPaginas(pdf: Buffer): number {
  const texto = pdf.toString("latin1");
  const casos = texto.match(/\/Type\s*\/Page(?![s/\w])/g);
  return casos && casos.length > 0 ? casos.length : 1;
}
