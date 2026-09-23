import { describe, it, expect } from "vitest";
import { Fila, FilaCheiaError } from "../fila.js";

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("Fila", () => {
  it("respeita o limite de concorrência", async () => {
    const fila = new Fila({ concorrencia: 2, tamanhoMaximo: 100 });
    let simultaneas = 0;
    let pico = 0;

    const tarefa = async () => {
      simultaneas++;
      pico = Math.max(pico, simultaneas);
      await dormir(20);
      simultaneas--;
    };

    await Promise.all(Array.from({ length: 8 }, () => fila.executar(tarefa)));

    expect(pico).toBe(2);
  });

  it("executa todas as tarefas, mesmo enfileiradas", async () => {
    const fila = new Fila({ concorrencia: 1, tamanhoMaximo: 100 });
    const feitas: number[] = [];

    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        fila.executar(async () => {
          await dormir(1);
          feitas.push(i);
        }),
      ),
    );

    expect(feitas).toHaveLength(5);
  });

  it("devolve o valor da tarefa", async () => {
    const fila = new Fila({ concorrencia: 1, tamanhoMaximo: 10 });
    await expect(fila.executar(async () => 42)).resolves.toBe(42);
  });

  it("propaga a falha sem travar a fila", async () => {
    const fila = new Fila({ concorrencia: 1, tamanhoMaximo: 10 });

    await expect(
      fila.executar(async () => {
        throw new Error("falhou");
      }),
    ).rejects.toThrow("falhou");

    // A vaga tem de ser liberada: se o finally não rodasse na rejeição, a
    // fila travaria para sempre depois da primeira falha — e falha de
    // compilação LaTeX é rotina, não exceção.
    await expect(fila.executar(async () => "ok")).resolves.toBe("ok");
  });

  it("recusa quando a fila enche, em vez de aceitar sem limite", async () => {
    const fila = new Fila({ concorrencia: 1, tamanhoMaximo: 2 });

    // 1 em execução + 2 aguardando = cheia.
    const emVoo = [
      fila.executar(() => dormir(50)),
      fila.executar(() => dormir(50)),
      fila.executar(() => dormir(50)),
    ];

    await expect(fila.executar(async () => "extra")).rejects.toBeInstanceOf(
      FilaCheiaError,
    );

    await Promise.all(emVoo);
  });

  it("volta a aceitar depois de esvaziar", async () => {
    const fila = new Fila({ concorrencia: 1, tamanhoMaximo: 1 });

    const emVoo = [fila.executar(() => dormir(20)), fila.executar(() => dormir(20))];
    await expect(fila.executar(async () => 1)).rejects.toBeInstanceOf(FilaCheiaError);

    await Promise.all(emVoo);
    await expect(fila.executar(async () => 1)).resolves.toBe(1);
  });

  it("recusa concorrência inválida na construção", () => {
    expect(() => new Fila({ concorrencia: 0, tamanhoMaximo: 10 })).toThrow();
  });

  it("relata o estado", async () => {
    const fila = new Fila({ concorrencia: 1, tamanhoMaximo: 10 });
    expect(fila.ativas).toBe(0);
    expect(fila.tamanho).toBe(0);

    const emVoo = [fila.executar(() => dormir(20)), fila.executar(() => dormir(20))];
    expect(fila.ativas).toBe(1);
    expect(fila.tamanho).toBe(1);

    await Promise.all(emVoo);
    expect(fila.ativas).toBe(0);
  });
});
