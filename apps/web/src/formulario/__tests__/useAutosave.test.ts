import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { novoCv, type CvData } from "@cv-express/schema";
import { useAutosave } from "../useAutosave";

function cvCom(nome: string): CvData {
  const cv = novoCv("t");
  return { ...cv, pessoal: { ...cv.pessoal, nome } };
}

describe("debounce", () => {
  // Timers falsos só aqui: o objeto destes testes é o tempo em si.
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it("não grava a cada tecla", async () => {
    const salvar = vi.fn(async () => true);
    const { rerender } = renderHook(({ cv }) => useAutosave(cv, { salvar }), {
      initialProps: { cv: cvCom("A") },
    });

    // Três alterações rápidas.
    rerender({ cv: cvCom("An") });
    rerender({ cv: cvCom("Ana") });

    expect(salvar).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(900);
    });

    expect(salvar).toHaveBeenCalledTimes(1);
  });

  it("grava a versão MAIS RECENTE, não a agendada", async () => {
    /**
     * Sem a ref de "mais recente", o setTimeout gravaria o currículo que
     * existia quando foi agendado — a pessoa digitaria mais três campos
     * durante a espera e esses três se perderiam em silêncio.
     */
    // O parâmetro é declarado para que o mock carregue o tipo do argumento;
    // sem ele, `mock.calls[0][0]` não existe para o TypeScript.
    const salvar = vi.fn(async (_cv: CvData) => true);
    const { rerender } = renderHook(({ cv }) => useAutosave(cv, { salvar }), {
      initialProps: { cv: cvCom("A") },
    });

    rerender({ cv: cvCom("Ana Souza") });

    await act(async () => {
      vi.advanceTimersByTime(900);
    });

    expect(salvar.mock.calls[0]?.[0]?.pessoal.nome).toBe("Ana Souza");
  });

  it("não grava de novo quando nada mudou", async () => {
    const salvar = vi.fn(async () => true);
    const cv = cvCom("Ana");

    const { rerender } = renderHook(({ c }) => useAutosave(c, { salvar }), {
      initialProps: { c: cv },
    });

    await act(async () => {
      vi.advanceTimersByTime(900);
    });
    expect(salvar).toHaveBeenCalledTimes(1);

    // Re-render sem mudança de conteúdo.
    rerender({ c: { ...cv } });
    await act(async () => {
      vi.advanceTimersByTime(900);
    });

    expect(salvar).toHaveBeenCalledTimes(1);
  });
});

/**
 * Estes usam timers REAIS, com espera curta.
 *
 * Com timers falsos o `waitFor` do testing-library não avança o relógio, e o
 * estado fica preso em "salvando" para sempre — o teste falharia sem que
 * houvesse nada errado no hook. Como o que se verifica aqui é a transição de
 * estado, e não o tempo, 10ms de espera real custa menos que a briga entre as
 * duas ferramentas.
 */
describe("estado visível", () => {
  const rapido = { esperaMs: 10 };

  it("passa por salvando e chega em salvo", async () => {
    const salvar = vi.fn(async () => true);
    const { result } = renderHook(() =>
      useAutosave(cvCom("Ana"), { salvar, ...rapido }),
    );

    expect(result.current.estado).toBe("salvando");
    await waitFor(() => expect(result.current.estado).toBe("salvo"));
  });

  it("marca erro quando a gravação recusa", async () => {
    const salvar = vi.fn(async () => false);
    const { result } = renderHook(() =>
      useAutosave(cvCom("Ana"), { salvar, ...rapido }),
    );

    await waitFor(() => expect(result.current.estado).toBe("erro"));
  });

  it("uma exceção na gravação não derruba o formulário", async () => {
    // Rede caiu, aba em segundo plano, servidor reiniciando. O texto continua
    // na tela; o que muda é só o indicador.
    const salvar = vi.fn(async () => {
      throw new Error("rede caiu");
    });
    const { result } = renderHook(() =>
      useAutosave(cvCom("Ana"), { salvar, ...rapido }),
    );

    await waitFor(() => expect(result.current.estado).toBe("erro"));
  });
});

describe("gravações concorrentes", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  /**
   * Duas gravações em voo podem chegar fora de ordem, e a mais ANTIGA
   * sobrescreveria a mais nova — a pessoa veria o próprio texto voltar ao que
   * era. O hook serializa: uma por vez, com a alteração seguinte marcada como
   * pendente.
   */
  it("não dispara duas gravações ao mesmo tempo", async () => {
    let emVoo = 0;
    let maximo = 0;

    const salvar = vi.fn(async () => {
      emVoo++;
      maximo = Math.max(maximo, emVoo);
      await new Promise((r) => setTimeout(r, 50));
      emVoo--;
      return true;
    });

    const { rerender } = renderHook(({ cv }) => useAutosave(cv, { salvar }), {
      initialProps: { cv: cvCom("A") },
    });

    await act(async () => {
      vi.advanceTimersByTime(900);
    });

    rerender({ cv: cvCom("Ana") });
    await act(async () => {
      vi.advanceTimersByTime(900);
    });

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(maximo).toBe(1);
  });
});

describe("laços de reagendamento", () => {
  const rapido = { esperaMs: 10 };

  /**
   * Os dois defeitos que esta suíte encontrou, agora travados.
   *
   * Ambos eram invisíveis: nenhum erro, nenhum aviso, só o trabalho da pessoa
   * ficando sem gravar. É a forma mais perigosa de falha neste produto.
   */
  it("uma gravação que falha NÃO é repetida em laço", async () => {
    const salvar = vi.fn(async () => false);
    const { result } = renderHook(() =>
      useAutosave(cvCom("Ana"), { salvar, ...rapido }),
    );

    await waitFor(() => expect(result.current.estado).toBe("erro"));

    // Sem a marcação da tentativa, isto martelaria o servidor sem parar.
    const chamadasApos = salvar.mock.calls.length;
    await new Promise((r) => setTimeout(r, 100));
    expect(salvar.mock.calls.length).toBe(chamadasApos);
  });

  it("carimbo de atualizadoEm mudando não dispara nova gravação", async () => {
    // O servidor devolve o documento com o carimbo novo a cada salvamento.
    // Se ele entrasse na comparação, cada gravação provocaria a próxima.
    const salvar = vi.fn(async () => true);
    const base = cvCom("Ana");

    const { rerender, result } = renderHook(
      ({ cv }) => useAutosave(cv, { salvar, ...rapido }),
      { initialProps: { cv: base } },
    );

    await waitFor(() => expect(result.current.estado).toBe("salvo"));
    expect(salvar).toHaveBeenCalledTimes(1);

    rerender({ cv: { ...base, atualizadoEm: new Date().toISOString() } });
    await new Promise((r) => setTimeout(r, 80));

    expect(salvar).toHaveBeenCalledTimes(1);
  });
});
