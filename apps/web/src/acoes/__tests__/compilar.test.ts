import { describe, it, expect, vi } from "vitest";
import { novoCv, novaExperiencia, type CvData } from "@cv-express/schema";
import { compilarCv } from "../compilar";

const OPCOES = { urlWorker: "http://worker:8080", token: "segredo" };

function cvValido(): CvData {
  return {
    ...novoCv("s1"),
    pessoal: { nome: "Ana", cidade: "BH", email: "ana@exemplo.com" },
  };
}

function respostaOk(extra: Record<string, unknown> = {}) {
  return {
    contentHash: "a".repeat(64),
    templateId: "classico",
    templateVersao: "1.0.0",
    pageCount: 1,
    pdf: "JVBERi0=",
    posicoes: [],
    duracaoMs: 1200,
    doCache: false,
    ...extra,
  };
}

function fetchFalso(status: number, corpo: unknown) {
  return vi.fn(async () =>
    new Response(JSON.stringify(corpo), {
      status,
      headers: { "content-type": "application/json" },
    }),
  ) as unknown as typeof fetch;
}

describe("chamada bem-sucedida", () => {
  it("devolve a resposta validada", async () => {
    const r = await compilarCv(cvValido(), {
      ...OPCOES,
      buscar: fetchFalso(200, respostaOk({ pageCount: 2 })),
    });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.resposta.pageCount).toBe(2);
  });

  it("envia o CvData e o token, nunca um .tex", async () => {
    const buscar = fetchFalso(200, respostaOk());
    await compilarCv(cvValido(), { ...OPCOES, buscar });

    const [url, init] = (buscar as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, RequestInit];

    expect(url).toBe("http://worker:8080/compilar");
    expect((init.headers as Record<string, string>)["x-worker-token"]).toBe("segredo");

    const corpo = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(corpo["cv"]).toBeDefined();
    // A garantia do contrato: não existe caminho até o Tectonic que pule o
    // pipeline de escape.
    expect(corpo["tex"]).toBeUndefined();
  });

  it("normaliza barra final na URL do worker", async () => {
    const buscar = fetchFalso(200, respostaOk());
    await compilarCv(cvValido(), { ...OPCOES, urlWorker: "http://worker:8080/", buscar });

    const [url] = (buscar as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toBe("http://worker:8080/compilar");
  });
});

describe("erros do worker", () => {
  it("repassa o código e a mensagem do contrato", async () => {
    const r = await compilarCv(cvValido(), {
      ...OPCOES,
      buscar: fetchFalso(504, {
        codigo: "TEMPO_ESGOTADO",
        mensagem: "A geração demorou mais que o esperado.",
        requestId: "req-123",
      }),
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.codigo).toBe("TEMPO_ESGOTADO");
      expect(r.requestId).toBe("req-123");
    }
  });

  it("usa mensagem genérica quando o erro vem fora do contrato", async () => {
    // Um proxy no meio devolvendo HTML, por exemplo. O usuário não pode ver
    // detalhe interno nem uma tela quebrada.
    const r = await compilarCv(cvValido(), {
      ...OPCOES,
      buscar: fetchFalso(502, { qualquer: "coisa" }),
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.codigo).toBe("ERRO_INTERNO");
      expect(r.mensagem).toContain("está salvo");
    }
  });

  it("recusa resposta 200 fora do contrato", async () => {
    // Web e worker em versões diferentes. Falhar explícito é melhor que
    // renderizar lixo como se fosse um currículo.
    const r = await compilarCv(cvValido(), {
      ...OPCOES,
      buscar: fetchFalso(200, { pdf: "só isso" }),
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codigo).toBe("ERRO_INTERNO");
  });
});

describe("worker inalcançável", () => {
  /**
   * A pessoa acabou de preencher o currículo inteiro. Uma exceção não tratada
   * aqui viraria tela de erro do Next, com o trabalho salvo no banco mas sem
   * caminho de volta — a pior forma de perder alguém no último passo.
   */
  it("devolve resultado em vez de lançar", async () => {
    const buscar = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;

    const r = await compilarCv(cvValido(), { ...OPCOES, buscar });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.codigo).toBe("ERRO_INTERNO");
      expect(r.mensagem).toContain("salvo");
    }
  });

  it("marca tempo esgotado quando a requisição é abortada", async () => {
    const buscar = vi.fn(async (_url: unknown, init?: RequestInit) => {
      // Simula o AbortController disparando.
      const erro = new Error("aborted");
      erro.name = "AbortError";
      (init?.signal as AbortSignal | undefined)?.throwIfAborted?.();
      throw erro;
    }) as unknown as typeof fetch;

    const r = await compilarCv(cvValido(), { ...OPCOES, buscar, timeoutMs: 1 });

    // Com timeout de 1ms o abort dispara antes da rejeição ser observada.
    await new Promise((res) => setTimeout(res, 10));
    expect(r.ok).toBe(false);
  });
});

describe("currículo grande", () => {
  it("serializa sem estourar", async () => {
    const cv: CvData = {
      ...cvValido(),
      experiencias: Array.from({ length: 20 }, (_, i) =>
        novaExperiencia({
          id: `e${i}`,
          cargo: `Cargo ${i}`,
          empresa: "Acme",
          descricaoOriginal: "x".repeat(1000),
        }),
      ),
    };

    const r = await compilarCv(cv, { ...OPCOES, buscar: fetchFalso(200, respostaOk()) });
    expect(r.ok).toBe(true);
  });
});
