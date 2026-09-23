import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";

import { criarServidor } from "../servidor.js";
import type { Config } from "../config.js";
import {
  FalhaLatexError,
  TempoEsgotadoError,
  type ExecutorTectonic,
  type PedidoCompilacao,
  type ResultadoCompilacao,
} from "../tectonic.js";
import { cvCompleto, cvMinimo } from "./fixtures.js";

/**
 * Executor falso.
 *
 * É o que torna todo o worker testável sem Docker, sem Tectonic e sem LaTeX
 * instalado — o motivo de o executor real estar atrás de uma interface. Ele
 * devolve um PDF sintético com a quantidade de páginas pedida e um .aux com
 * âncoras, exercitando o caminho completo de resposta.
 */
class ExecutorFalso implements ExecutorTectonic {
  chamadas = 0;
  ultimoPedido?: PedidoCompilacao;
  erroAoCompilar?: Error;
  paginas = 1;
  aux = "";
  atrasoMs = 0;

  async compilar(pedido: PedidoCompilacao): Promise<ResultadoCompilacao> {
    this.chamadas++;
    this.ultimoPedido = pedido;

    if (this.atrasoMs > 0) {
      await new Promise((r) => setTimeout(r, this.atrasoMs));
    }
    if (this.erroAoCompilar) throw this.erroAoCompilar;

    const paginas = Array.from(
      { length: this.paginas },
      (_, i) => `${i + 1} 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj`,
    ).join("\n");

    const pdf = Buffer.from(
      `%PDF-1.7\n2 0 obj\n<< /Type /Pages /Count ${this.paginas} >>\nendobj\n${paginas}\n%%EOF`,
      "latin1",
    );

    return { pdf, aux: this.aux, duracaoMs: 5 };
  }
}

const CONFIG: Config = {
  porta: 0,
  host: "127.0.0.1",
  tokenInterno: "token-de-teste",
  concorrencia: 2,
  filaMaxima: 10,
  timeoutCompilacaoMs: 5_000,
  corpoMaximoBytes: 512 * 1024,
  cacheMaximo: 10,
  cacheTtlMs: 60_000,
};

const AUTH = { "x-worker-token": CONFIG.tokenInterno };

let executor: ExecutorFalso;
let app: FastifyInstance;

beforeEach(() => {
  executor = new ExecutorFalso();
  app = criarServidor({ executor, config: CONFIG, nivelLog: "silent" });
});

describe("autenticação", () => {
  it("recusa requisição sem token", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/compilar",
      payload: { cv: cvMinimo() },
    });
    expect(r.statusCode).toBe(401);
    expect(executor.chamadas).toBe(0);
  });

  it("recusa token errado", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/compilar",
      headers: { "x-worker-token": "errado" },
      payload: { cv: cvMinimo() },
    });
    expect(r.statusCode).toBe(401);
  });

  it("recusa token de tamanho diferente sem quebrar", async () => {
    // timingSafeEqual lança se os buffers têm tamanhos diferentes; o
    // comprimento precisa ser checado antes.
    const r = await app.inject({
      method: "POST",
      url: "/compilar",
      headers: { "x-worker-token": "x" },
      payload: { cv: cvMinimo() },
    });
    expect(r.statusCode).toBe(401);
  });

  it("deixa /saude público — o health check não tem credencial", async () => {
    const r = await app.inject({ method: "GET", url: "/saude" });
    expect(r.statusCode).toBe(200);
    expect(r.json().estado).toBe("ok");
  });
});

describe("POST /compilar", () => {
  it("compila e devolve o contrato completo", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/compilar",
      headers: AUTH,
      payload: { cv: cvCompleto() },
    });

    expect(r.statusCode).toBe(200);
    const corpo = r.json();
    expect(corpo.contentHash).toHaveLength(64);
    expect(corpo.templateId).toBe("classico");
    expect(corpo.pageCount).toBe(1);
    expect(corpo.doCache).toBe(false);
    expect(Buffer.from(corpo.pdf, "base64").toString("latin1")).toContain("%PDF");
  });

  it("gera o .tex a partir do CvData — o cliente não envia LaTeX", async () => {
    await app.inject({
      method: "POST",
      url: "/compilar",
      headers: AUTH,
      payload: { cv: cvCompleto() },
    });

    // O .tex chegou ao Tectonic com o escape aplicado, montado pelo worker.
    expect(executor.ultimoPedido?.tex).toContain("\\documentclass{cvexpress}");
    expect(executor.ultimoPedido?.classe).toContain("ProvidesClass{cvexpress}");
  });

  it("ignora um campo tex enviado pelo cliente", async () => {
    // A garantia central do contrato: não existe caminho até o Tectonic que
    // pule o pipeline de escape. Um .tex no corpo é simplesmente ignorado.
    await app.inject({
      method: "POST",
      url: "/compilar",
      headers: AUTH,
      payload: { cv: cvMinimo(), tex: "\\input{/etc/passwd}" },
    });

    expect(executor.ultimoPedido?.tex).not.toContain("\\input{/etc/passwd}");
  });

  it("conta as páginas do PDF", async () => {
    executor.paginas = 3;
    const r = await app.inject({
      method: "POST",
      url: "/compilar",
      headers: AUTH,
      payload: { cv: cvCompleto() },
    });
    expect(r.json().pageCount).toBe(3);
  });

  it("devolve as posições extraídas do .aux", async () => {
    executor.aux = [
      "\\zref@newlabel{pessoal.nome@x}{\\posx{100}}",
      "\\zref@newlabel{pessoal.nome@y}{\\posy{200}}",
      "\\zref@newlabel{pessoal.nome@p}{\\abspage{1}}",
    ].join("\n");

    const r = await app.inject({
      method: "POST",
      url: "/compilar",
      headers: AUTH,
      payload: { cv: cvMinimo() },
    });

    expect(r.json().posicoes).toHaveLength(1);
    expect(r.json().posicoes[0].fieldId).toBe("pessoal.nome");
  });

  it("responde 200 com posições vazias quando o .aux não tem âncoras", async () => {
    // Mapa vazio NÃO é erro: o preview cai para o painel lateral de seções.
    executor.aux = "";
    const r = await app.inject({
      method: "POST",
      url: "/compilar",
      headers: AUTH,
      payload: { cv: cvMinimo() },
    });

    expect(r.statusCode).toBe(200);
    expect(r.json().posicoes).toEqual([]);
  });
});

describe("cache", () => {
  it("não chama o Tectonic de novo para o mesmo conteúdo", async () => {
    const cv = cvCompleto();
    const pedido = { method: "POST" as const, url: "/compilar", headers: AUTH, payload: { cv } };

    const primeira = await app.inject(pedido);
    const segunda = await app.inject(pedido);

    expect(executor.chamadas).toBe(1);
    expect(primeira.json().doCache).toBe(false);
    expect(segunda.json().doCache).toBe(true);
    expect(segunda.json().contentHash).toBe(primeira.json().contentHash);
  });

  it("recompila quando o conteúdo muda", async () => {
    const cv = cvCompleto();
    await app.inject({ method: "POST", url: "/compilar", headers: AUTH, payload: { cv } });

    const outro = cvCompleto();
    outro.pessoal.nome = "Outro Nome";
    await app.inject({ method: "POST", url: "/compilar", headers: AUTH, payload: { cv: outro } });

    expect(executor.chamadas).toBe(2);
  });
});

describe("erros", () => {
  it("400 para CvData inválido", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/compilar",
      headers: AUTH,
      payload: { cv: { ...cvMinimo(), pessoal: { nome: "", cidade: "", email: "x" } } },
    });

    expect(r.statusCode).toBe(400);
    expect(r.json().codigo).toBe("DADOS_INVALIDOS");
    expect(executor.chamadas).toBe(0);
  });

  it("400 quando falta o campo cv", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/compilar",
      headers: AUTH,
      payload: {},
    });
    expect(r.statusCode).toBe(400);
  });

  it("504 e mensagem amigável quando estoura o tempo", async () => {
    executor.erroAoCompilar = new TempoEsgotadoError(10_000);
    const r = await app.inject({
      method: "POST",
      url: "/compilar",
      headers: AUTH,
      payload: { cv: cvMinimo() },
    });

    expect(r.statusCode).toBe(504);
    expect(r.json().codigo).toBe("TEMPO_ESGOTADO");
  });

  it("500 em falha do LaTeX, SEM vazar o log", async () => {
    // O log carrega caminhos absolutos do servidor (seção 5.3). Ele vai para
    // o log estruturado, indexado pelo requestId — nunca para o cliente.
    executor.erroAoCompilar = new FalhaLatexError(
      "erro interno",
      "! Undefined control sequence.\nl.42 /srv/worker/tmp/cvexpress-xK9/cv.tex",
    );

    const r = await app.inject({
      method: "POST",
      url: "/compilar",
      headers: AUTH,
      payload: { cv: cvMinimo() },
    });

    expect(r.statusCode).toBe(500);
    expect(r.json().codigo).toBe("FALHA_LATEX");

    const corpo = r.payload;
    expect(corpo).not.toContain("/srv/worker");
    expect(corpo).not.toContain("Undefined control sequence");
    expect(corpo).not.toContain("cv.tex");
  });

  it("todo erro traz requestId para correlacionar com o log", async () => {
    executor.erroAoCompilar = new FalhaLatexError("x", "log secreto");
    const r = await app.inject({
      method: "POST",
      url: "/compilar",
      headers: AUTH,
      payload: { cv: cvMinimo() },
    });
    expect(r.json().requestId).toBeTruthy();
  });

  it("503 quando a fila enche", async () => {
    const apertado = criarServidor({
      executor,
      config: { ...CONFIG, concorrencia: 1, filaMaxima: 1 },
      nivelLog: "silent",
    });
    executor.atrasoMs = 100;

    // Currículos distintos: iguais cairiam no cache e não ocupariam a fila.
    const pedido = (nome: string) => {
      const cv = cvCompleto();
      cv.pessoal.nome = nome;
      return apertado.inject({
        method: "POST" as const,
        url: "/compilar",
        headers: AUTH,
        payload: { cv },
      });
    };

    const respostas = await Promise.all([
      pedido("A"),
      pedido("B"),
      pedido("C"),
      pedido("D"),
    ]);

    const sobrecarga = respostas.filter((r) => r.statusCode === 503);
    expect(sobrecarga.length).toBeGreaterThan(0);
    expect(sobrecarga[0]?.json().codigo).toBe("SOBRECARGA");
  });
});
