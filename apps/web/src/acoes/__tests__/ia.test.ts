import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AiError, type CvAiService } from "@cv-express/ai";
import { novoCv, novaExperiencia, type CvData } from "@cv-express/schema";

import { polirExperiencia, normalizarHabilidades } from "../ia";

/**
 * O defeito que esta suíte impede: a falha da IA chegar à tela como frase
 * genérica, ou pior, como exceção.
 *
 * Antes, a Server Action lançava `new Error(r.erro.message)`. Em produção o
 * Next substitui essa mensagem por um digest — então o motivo NUNCA chegaria à
 * pessoa, não importa o texto escrito ali. Aqui se prova que o motivo vem como
 * dado, e que o detalhe técnico não vem junto.
 */

const cv = (): CvData => ({
  ...novoCv("s1"),
  experiencias: [
    novaExperiencia({ id: "e1", cargo: "Dev", empresa: "Acme", descricaoOriginal: "apis" }),
  ],
});

/** Serviço de mentira: devolve o que o teste mandar. */
function servico(parcial: Partial<CvAiService>): CvAiService {
  return {
    polirExperiencia: vi.fn(async () => {
      throw new Error("não usado neste teste");
    }),
    normalizarHabilidades: vi.fn(async () => {
      throw new Error("não usado neste teste");
    }),
    ...parcial,
  } as CvAiService;
}

const uso = { entrada: 10, saida: 20 };

beforeEach(() => {
  // O log do servidor é o destino do detalhe técnico; silenciá-lo aqui evita
  // poluir a saída do teste sem deixar de verificar o que ele recebe.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("polirExperiencia", () => {
  it("devolve os bullets quando dá certo", async () => {
    const r = await polirExperiencia(
      servico({
        polirExperiencia: vi.fn(async () => ({
          ok: true as const,
          dados: { bullets: ["Desenvolvi APIs"] },
          uso,
        })),
      }),
      cv(),
      "e1",
      "s1",
    );

    expect(r).toEqual({ ok: true, dados: ["Desenvolvi APIs"] });
  });

  it("traduz o código do erro, sem levar a mensagem interna", async () => {
    const r = await polirExperiencia(
      servico({
        polirExperiencia: vi.fn(async () => ({
          ok: false as const,
          erro: new AiError(
            "TEMPO_ESGOTADO",
            "timeout após 30000ms",
            "stack interno do provider",
          ),
        })),
      }),
      cv(),
      "e1",
      "s1",
    );

    expect(r).toEqual({ ok: false, motivo: "TEMPO_ESGOTADO" });
    // Nem a mensagem do provider nem o detalhe atravessam a fronteira.
    expect(JSON.stringify(r)).not.toContain("30000");
    expect(JSON.stringify(r)).not.toContain("stack interno");
  });

  it("manda o detalhe para o log do servidor, indexado pelo motivo", async () => {
    // Mesma regra do log do LaTeX: o diagnóstico existe, só não vai para o
    // cliente.
    await polirExperiencia(
      servico({
        polirExperiencia: vi.fn(async () => ({
          ok: false as const,
          erro: new AiError("INDISPONIVEL", "provider fora do ar", "ECONNREFUSED"),
        })),
      }),
      cv(),
      "e1",
      "s1",
    );

    expect(console.error).toHaveBeenCalledWith("[ia] falha", {
      motivo: "INDISPONIVEL",
      detalhe: "ECONNREFUSED",
    });
  });

  it("exceção inesperada vira motivo 'desconhecido', não estouro", async () => {
    /**
     * O serviço promete não lançar, mas quem chama uma Server Action não pode
     * depender da promessa: a pessoa acabou de preencher o currículo, e uma
     * exceção aqui viraria a tela de erro do Next.
     */
    const r = await polirExperiencia(
      servico({
        polirExperiencia: vi.fn(async () => {
          throw new TypeError("fetch failed");
        }),
      }),
      cv(),
      "e1",
      "s1",
    );

    expect(r).toEqual({ ok: false, motivo: "desconhecido" });
  });

  it("experiência removida no meio do caminho não é falha de IA", async () => {
    // A pessoa apagou o item enquanto o pedido ia e voltava. Mostrar erro
    // acusaria a IA de algo que não aconteceu.
    const chamou = vi.fn();
    const r = await polirExperiencia(
      servico({ polirExperiencia: chamou }),
      cv(),
      "id-que-nao-existe",
      "s1",
    );

    expect(r).toEqual({ ok: true, dados: [] });
    expect(chamou).not.toHaveBeenCalled();
  });

  it("passa cargo e descrição originais — a IA vê o que a pessoa escreveu", async () => {
    const espiao = vi.fn(async () => ({
      ok: true as const,
      dados: { bullets: [] },
      uso,
    }));

    await polirExperiencia(servico({ polirExperiencia: espiao }), cv(), "e1", "s1");

    expect(espiao).toHaveBeenCalledWith({ cargo: "Dev", descricao: "apis" }, "s1");
  });
});

describe("normalizarHabilidades", () => {
  it("devolve os itens sugeridos", async () => {
    const r = await normalizarHabilidades(
      servico({
        normalizarHabilidades: vi.fn(async () => ({
          ok: true as const,
          dados: { itens: [{ nome: "Python", categoria: "tecnica" as const }] },
          uso,
        })),
      }),
      { ...novoCv("s1"), habilidades: { textoOriginal: "python", itens: [], statusIa: "none" } },
      "s1",
    );

    expect(r).toEqual({ ok: true, dados: [{ nome: "Python", categoria: "tecnica" }] });
  });

  it("guardrail acionado chega como motivo próprio", async () => {
    // Merece texto próprio na tela: o guardrail funcionando é a promessa
    // central do produto, não um defeito.
    const r = await normalizarHabilidades(
      servico({
        normalizarHabilidades: vi.fn(async () => ({
          ok: false as const,
          erro: new AiError("GUARDRAIL", "inventou uma habilidade"),
        })),
      }),
      novoCv("s1"),
      "s1",
    );

    expect(r).toEqual({ ok: false, motivo: "GUARDRAIL" });
  });
});
