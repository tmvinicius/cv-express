import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { novoCv, type CompilarResposta, type CvData } from "@cv-express/schema";

import { useCompilacao } from "../useCompilacao";
import type { ResultadoCompilacao } from "../../acoes/compilar";

afterEach(cleanup);

const RESPOSTA: CompilarResposta = {
  contentHash: "a".repeat(64),
  templateId: "classico",
  templateVersao: "1.0.0",
  pageCount: 1,
  pdf: "JVBERi0xLjUK",
  posicoes: [],
  duracaoMs: 10,
  doCache: false,
};

// Data fixa: `novoCv` grava a hora atual em `atualizadoEm`, e dois objetos
// criados em milissegundos diferentes não seriam "o mesmo conteúdo".
const AGORA = new Date("2026-01-15T12:00:00Z");

function cvCom(nome: string): CvData {
  return { ...novoCv("s1", AGORA), pessoal: { nome, cidade: "BH", email: "a@b.com" } };
}

describe("useCompilacao", () => {
  it("não compila enquanto inativo", () => {
    const compilar = vi.fn(async (): Promise<ResultadoCompilacao> => ({ ok: true, resposta: RESPOSTA }));
    renderHook(() => useCompilacao(cvCom("Ana"), compilar, false));
    expect(compilar).not.toHaveBeenCalled();
  });

  it("o mesmo conteúdo não recompila, mesmo com objeto novo", async () => {
    const compilar = vi.fn(async (): Promise<ResultadoCompilacao> => ({ ok: true, resposta: RESPOSTA }));
    const { rerender, result } = renderHook(({ cv }) => useCompilacao(cv, compilar, true), {
      initialProps: { cv: cvCom("Ana") },
    });
    await waitFor(() => expect(result.current.emDia).toBe(true));

    rerender({ cv: cvCom("Ana") });

    expect(compilar).toHaveBeenCalledTimes(1);
    expect(result.current.emDia).toBe(true);
  });

  it("'emDia' fica falso no instante em que o conteúdo muda", async () => {
    /**
     * O defeito que isto impede: sem a chave junto do resultado, o primeiro
     * render depois de uma edição ainda via `pronto` (da versão anterior) e
     * quem avança sozinho para o preview avançava com o PDF velho.
     */
    let liberar: (r: ResultadoCompilacao) => void = () => {};
    const compilar = vi
      .fn<(cv: CvData) => Promise<ResultadoCompilacao>>()
      .mockResolvedValueOnce({ ok: true, resposta: RESPOSTA })
      .mockImplementationOnce(() => new Promise((r) => (liberar = r)));

    const vistos: boolean[] = [];
    const { rerender, result } = renderHook(
      ({ cv }) => {
        const c = useCompilacao(cv, compilar, true);
        vistos.push(c.emDia);
        return c;
      },
      { initialProps: { cv: cvCom("Ana") } },
    );
    await waitFor(() => expect(result.current.emDia).toBe(true));

    vistos.length = 0;
    rerender({ cv: cvCom("Ana Souza") });

    // Nenhum render depois da mudança pode ter dito "em dia" antes da resposta.
    expect(vistos.every((v) => v === false)).toBe(true);
    expect(result.current.estado.fase).toBe("gerando");

    liberar({ ok: true, resposta: RESPOSTA });
    await waitFor(() => expect(result.current.emDia).toBe(true));
  });

  it("só a resposta do pedido mais recente vale", async () => {
    const liberar: ((r: ResultadoCompilacao) => void)[] = [];
    const compilar = vi.fn(
      () => new Promise<ResultadoCompilacao>((r) => liberar.push(r)),
    );

    const { rerender, result } = renderHook(({ cv }) => useCompilacao(cv, compilar, true), {
      initialProps: { cv: cvCom("Ana") },
    });
    rerender({ cv: cvCom("Ana Souza") });

    // A segunda termina primeiro; a primeira, lenta, chega depois.
    liberar[1]?.({ ok: true, resposta: { ...RESPOSTA, pageCount: 2 } });
    await waitFor(() => expect(result.current.emDia).toBe(true));
    liberar[0]?.({ ok: true, resposta: { ...RESPOSTA, pageCount: 1 } });
    await new Promise((r) => setTimeout(r, 20));

    const estado = result.current.estado;
    expect(estado.fase === "pronto" && estado.paginas).toBe(2);
  });

  it("sessão ausente é erro definitivo; os demais, não", async () => {
    // Sem a marca, a tela diria "continua salvo" e ofereceria "tentar de
    // novo" para um currículo cujo prazo acabou.
    const recusa = (codigo: "SESSAO_AUSENTE" | "MUITOS_PEDIDOS") =>
      vi.fn(async (): Promise<ResultadoCompilacao> => ({ ok: false, codigo, mensagem: "x" }));

    const ausente = renderHook(() => useCompilacao(cvCom("Ana"), recusa("SESSAO_AUSENTE"), true));
    await waitFor(() => expect(ausente.result.current.estado).toMatchObject({ fase: "erro", definitivo: true }));

    const muitos = renderHook(() => useCompilacao(cvCom("Ana"), recusa("MUITOS_PEDIDOS"), true));
    await waitFor(() => expect(muitos.result.current.estado.fase).toBe("erro"));
    expect(muitos.result.current.estado).not.toHaveProperty("definitivo");
  });
});
