import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { novoCv, novaExperiencia, type CvData } from "@cv-express/schema";

import { obterServicoIa, esquecerServicoIa } from "../servicoIa";
import { polirExperiencia } from "../ia";

/**
 * O defeito que esta suíte impede: a cota de IA existir no código e não
 * existir em produção.
 *
 * `criarServicoIa` cria uma `Cota` NOVA a cada chamada. Enquanto cada Server
 * Action criava o seu próprio serviço, o contador nascia zerado toda vez e o
 * teto nunca era atingido — nem uma vez. Uma aba num laço de reprocessamento
 * gastava dinheiro real sem nenhum limite.
 *
 * O teste principal abaixo falha se alguém voltar a criar o serviço por
 * chamada.
 */

const AMBIENTE_COM_IA = { AI_PROVIDER: "mock" } as Record<string, string | undefined>;

const cv = (): CvData => ({
  ...novoCv("s1"),
  experiencias: [
    novaExperiencia({ id: "e1", cargo: "Dev", empresa: "Acme", descricaoOriginal: "fiz apis" }),
  ],
});

beforeEach(() => {
  esquecerServicoIa();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  esquecerServicoIa();
  vi.restoreAllMocks();
});

describe("reuso do serviço de IA", () => {
  it("devolve a MESMA instância em chamadas sucessivas", () => {
    // É a identidade que mantém a Cota viva entre duas Server Actions.
    const a = obterServicoIa(AMBIENTE_COM_IA);
    const b = obterServicoIa(AMBIENTE_COM_IA);
    expect(a).not.toBeNull();
    expect(a).toBe(b);
  });

  /**
   * Imita exatamente o que a Server Action faz: RESOLVE O SERVIÇO A CADA
   * CHAMADA. É o detalhe que dá valor ao teste — se ele guardasse a instância
   * numa variável, passaria mesmo sem memoização e não provaria nada.
   */
  async function acao(sessionId: string, opcoes = {}) {
    const servico = obterServicoIa(AMBIENTE_COM_IA, opcoes);
    if (!servico) throw new Error("ambiente de teste deveria ter IA");
    return polirExperiencia(servico, cv(), "e1", sessionId);
  }

  const TETO_2 = { chamadasPorSessao: 2, janelaMs: 60_000 };

  it("recusa a chamada N+1 da mesma sessão", async () => {
    // A prova de ponta, e a que falha sem a memoização: com o teto em 2, a
    // terceira chamada da sessão tem de ser recusada com COTA_DA_SESSAO.
    // Serviço novo por chamada ⇒ Cota nova por chamada ⇒ as três passam.
    const r1 = await acao("sessao-a", TETO_2);
    const r2 = await acao("sessao-a", TETO_2);
    const r3 = await acao("sessao-a", TETO_2);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r3.ok).toBe(false);
    expect(r3.ok === false && r3.motivo).toBe("COTA_DA_SESSAO");
  });

  it("conta por sessão, não globalmente", async () => {
    // Impede a correção preguiçosa (um contador só para todo mundo), que
    // faria uma pessoa esgotar a cota de outra.
    const teto1 = { chamadasPorSessao: 1, janelaMs: 60_000 };
    expect((await acao("sessao-a", teto1)).ok).toBe(true);
    expect((await acao("sessao-b", teto1)).ok).toBe(true);
    expect((await acao("sessao-a", teto1)).ok).toBe(false);
  });

  it("devolve null, e memoriza o null, quando não há IA configurada", () => {
    // O ambiente sem IA não pode custar uma reavaliação (e uma linha de log)
    // por clique.
    const vazio = { AI_PROVIDER: "anthropic" } as Record<string, string | undefined>;
    expect(obterServicoIa(vazio)).toBeNull();
    expect(obterServicoIa(vazio)).toBeNull();
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});
