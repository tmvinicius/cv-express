import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

/**
 * Invocação do Tectonic.
 *
 * Isolada atrás de `ExecutorTectonic` por dois motivos. O primeiro é teste:
 * todo o resto do worker — fila, erros, extração de posições, rotas — pode
 * ser exercitado com um executor falso, sem Docker e sem LaTeX instalado. O
 * segundo é substituição: trocar Tectonic por TeX Live completo, se algum dia
 * um template exigir um pacote que o Tectonic não traga, mexe só aqui.
 */

export interface PedidoCompilacao {
  /** Conteúdo do .tex. */
  tex: string;
  /** Conteúdo do cvexpress.cls, gravado ao lado. */
  classe: string;
  timeoutMs: number;
}

export interface ResultadoCompilacao {
  pdf: Buffer;
  /** Conteúdo do .aux, para extrair as posições. Vazio se não houver. */
  aux: string;
  duracaoMs: number;
}

export class FalhaLatexError extends Error {
  constructor(
    mensagem: string,
    /** Log bruto do Tectonic. NUNCA vai para o cliente — só para o log. */
    public readonly log: string,
  ) {
    super(mensagem);
    this.name = "FalhaLatexError";
  }
}

export class TempoEsgotadoError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`A compilação passou de ${timeoutMs}ms.`);
    this.name = "TempoEsgotadoError";
  }
}

export interface ExecutorTectonic {
  compilar(pedido: PedidoCompilacao): Promise<ResultadoCompilacao>;
}

/**
 * Executor real: roda o binário do Tectonic em um diretório temporário.
 *
 * As proteções de sandbox estão em duas camadas, e ambas importam:
 *
 * 1. AQUI (processo): sem shell, argumentos como array, diretório de trabalho
 *    isolado e apagado ao fim, tempo limite com SIGKILL, variáveis de
 *    ambiente enxutas.
 *
 * 2. NO CONTÊINER (Dockerfile): sem rede, filesystem read-only, usuário
 *    não-root, limite de memória.
 *
 * Nenhuma das duas basta sozinha. Sem a segunda, um `\write18` que escapasse
 * teria a rede inteira à disposição. Sem a primeira, um laço infinito
 * seguraria um núcleo até o contêiner ser reiniciado.
 */
export class TectonicReal implements ExecutorTectonic {
  constructor(
    private readonly binario: string = process.env["TECTONIC_BIN"] ?? "tectonic",
  ) {}

  async compilar(pedido: PedidoCompilacao): Promise<ResultadoCompilacao> {
    const inicio = Date.now();
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cvexpress-"));

    try {
      const arquivoTex = path.join(dir, "cv.tex");
      await fs.writeFile(arquivoTex, pedido.tex, "utf8");
      await fs.writeFile(path.join(dir, "cvexpress.cls"), pedido.classe, "utf8");

      const log = await this.rodar(dir, arquivoTex, pedido.timeoutMs);

      const pdf = await fs
        .readFile(path.join(dir, "cv.pdf"))
        .catch(() => null);

      if (!pdf) {
        throw new FalhaLatexError(
          "O Tectonic terminou sem gerar o PDF.",
          log,
        );
      }

      // O .aux é opcional: se faltar, o mapa de posições fica vazio e o
      // preview cai para o painel lateral de seções.
      const aux = await fs
        .readFile(path.join(dir, "cv.aux"), "utf8")
        .catch(() => "");

      return { pdf, aux, duracaoMs: Date.now() - inicio };
    } finally {
      // O diretório some sempre, inclusive em erro e em timeout. Sem isso, o
      // disco do contêiner enche silenciosamente sob carga.
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private rodar(dir: string, arquivoTex: string, timeoutMs: number): Promise<string> {
    return new Promise((resolver, rejeitar) => {
      const proc = spawn(
        this.binario,
        [
          "--outdir",
          dir,
          // Mantém os arquivos intermediários: é de onde o .aux sai.
          "--keep-intermediates",
          "--keep-logs",
          // Sem rede. O Tectonic baixa pacotes sob demanda por padrão, e o
          // sandbox não tem saída — falhar rápido é melhor do que esperar o
          // tempo limite de uma conexão que nunca vai completar.
          "--only-cached",
          // Reruns previsíveis: o padrão do Tectonic é decidir sozinho
          // quantas passagens fazer, e as âncoras do zref precisam de duas.
          "--reruns",
          "1",
          arquivoTex,
        ],
        {
          cwd: dir,
          // shell:false é o padrão do spawn e precisa continuar assim: com
          // shell, o conteúdo dos argumentos passaria pelo /bin/sh.
          shell: false,
          env: {
            PATH: process.env["PATH"] ?? "/usr/local/bin:/usr/bin:/bin",
            HOME: dir,
            TECTONIC_CACHE_DIR:
              process.env["TECTONIC_CACHE_DIR"] ?? "/opt/tectonic-cache",
            SOURCE_DATE_EPOCH: "0",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

      let saida = "";
      const acumular = (c: Buffer) => {
        // Teto no log: um laço que imprime sem parar encheria a memória do
        // worker antes de o tempo limite chegar.
        if (saida.length < 256_000) saida += c.toString("utf8");
      };
      proc.stdout.on("data", acumular);
      proc.stderr.on("data", acumular);

      const relogio = setTimeout(() => {
        // SIGKILL, não SIGTERM: um TeX em laço de expansão não atende sinal
        // que possa ser ignorado.
        proc.kill("SIGKILL");
        rejeitar(new TempoEsgotadoError(timeoutMs));
      }, timeoutMs);

      proc.on("error", (e) => {
        clearTimeout(relogio);
        rejeitar(
          new FalhaLatexError(
            `Não foi possível executar o Tectonic (${this.binario}).`,
            String(e),
          ),
        );
      });

      proc.on("close", (codigo) => {
        clearTimeout(relogio);
        if (codigo === 0) {
          resolver(saida);
        } else {
          rejeitar(
            new FalhaLatexError(`Tectonic terminou com código ${codigo}.`, saida),
          );
        }
      });
    });
  }
}
