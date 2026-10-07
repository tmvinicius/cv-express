import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { esquema, aplicarMigracoes, cvSessions, type Banco } from "@cv-express/db";

import {
  autorizarIa,
  autorizarCompilacao,
  origemDoPedido,
  tetoDiarioIa,
  COTAS_IA,
  COTAS_COMPILACAO,
  LIMITE_SESSOES_POR_ORIGEM,
  TETO_DIARIO_IA_PADRAO,
} from "../cotas";
import { comecar, iniciarSessao } from "../sessao";
import { mensagemDeFalhaIa, podeTentarDeNovo } from "../../componentes/mensagensIa";

let pg: PGlite;
let db: Banco;

beforeEach(async () => {
  pg = new PGlite();
  await aplicarMigracoes((sql) => pg.exec(sql));
  db = drizzle(pg, { schema: esquema }) as unknown as Banco;
});
afterEach(async () => {
  vi.restoreAllMocks();
  if (!pg.closed) await pg.close();
});

const AGORA = new Date("2026-10-06T15:00:00Z");
const IP = "203.0.113.7";
const TETO_FOLGADO = 10_000;

async function sessao(): Promise<string> {
  return (await iniciarSessao(db, AGORA)).id;
}

describe("IA: a sessão precisa existir", () => {
  it("recusa um id inventado — rotacionar ids não compra cota nova", async () => {
    // O furo que existia: o sessionId vinha do navegador sem conferência, e
    // cada id novo nascia com 15 chamadas zeradas.
    for (let i = 0; i < 30; i++) {
      expect(await autorizarIa(db, `inventado-${i}`, IP, TETO_FOLGADO, AGORA)).toBe("sessao_ausente");
    }
  });

  it("libera uma sessão de verdade", async () => {
    expect(await autorizarIa(db, await sessao(), IP, TETO_FOLGADO, AGORA)).toBeNull();
  });
});

describe("IA: cota por sessão no banco", () => {
  it(`passa ${COTAS_IA.porSessao.maximo} por hora e recusa a seguinte`, async () => {
    const id = await sessao();
    for (let i = 0; i < COTAS_IA.porSessao.maximo; i++) {
      expect(await autorizarIa(db, id, IP, TETO_FOLGADO, AGORA)).toBeNull();
    }
    expect(await autorizarIa(db, id, IP, TETO_FOLGADO, AGORA)).toBe("COTA_DA_SESSAO");
  });

  it("vale entre instâncias: o contador está no banco, não na memória", async () => {
    // A cota antiga morava num Map do processo. Duas "instâncias" aqui são
    // só duas sequências de chamadas sem nada em comum além do banco — que é
    // exatamente a situação de duas funções serverless.
    const id = await sessao();
    const metade = Math.ceil(COTAS_IA.porSessao.maximo / 2);
    for (let i = 0; i < metade; i++) await autorizarIa(db, id, "198.51.100.1", TETO_FOLGADO, AGORA);
    for (let i = metade; i < COTAS_IA.porSessao.maximo; i++) {
      await autorizarIa(db, id, "198.51.100.2", TETO_FOLGADO, AGORA);
    }
    expect(await autorizarIa(db, id, "198.51.100.3", TETO_FOLGADO, AGORA)).toBe("COTA_DA_SESSAO");
  });

  it("volta na hora seguinte", async () => {
    const id = await sessao();
    for (let i = 0; i <= COTAS_IA.porSessao.maximo; i++) {
      await autorizarIa(db, id, IP, TETO_FOLGADO, AGORA);
    }
    const depois = new Date(AGORA.getTime() + COTAS_IA.porSessao.janelaMs);
    expect(await autorizarIa(db, id, IP, TETO_FOLGADO, depois)).toBeNull();
  });
});

describe("IA: cota por origem", () => {
  it("segura quem cria várias sessões no mesmo IP", async () => {
    const porSessao = COTAS_IA.porSessao.maximo;
    const sessoes = Math.ceil(COTAS_IA.porOrigem.maximo / porSessao);
    let liberadas = 0;
    for (let s = 0; s < sessoes; s++) {
      const id = await sessao();
      for (let i = 0; i < porSessao; i++) {
        if ((await autorizarIa(db, id, IP, TETO_FOLGADO, AGORA)) === null) liberadas++;
      }
    }
    expect(liberadas).toBe(COTAS_IA.porOrigem.maximo);
    expect(await autorizarIa(db, await sessao(), IP, TETO_FOLGADO, AGORA)).toBe("muitos_pedidos");
    // Outra origem não paga pela primeira.
    expect(await autorizarIa(db, await sessao(), "198.51.100.9", TETO_FOLGADO, AGORA)).toBeNull();
  });
});

describe("IA: teto diário global", () => {
  it("pausa a IA para todo mundo ao atingir o teto e volta no dia seguinte", async () => {
    const teto = 3;
    for (let i = 0; i < teto; i++) {
      expect(await autorizarIa(db, await sessao(), `198.51.100.${i}`, teto, AGORA)).toBeNull();
    }
    // Sessão nova, IP novo: as cotas individuais não explicam a recusa.
    expect(await autorizarIa(db, await sessao(), "192.0.2.50", teto, AGORA)).toBe("teto_diario");

    const amanha = new Date(AGORA.getTime() + 24 * 60 * 60 * 1000);
    const id = (await iniciarSessao(db, amanha)).id;
    expect(await autorizarIa(db, id, "192.0.2.50", teto, amanha)).toBeNull();
  });

  it("um pedido recusado pela cota da sessão não gasta o teto de todo mundo", async () => {
    // Sem esta ordem, uma única aba em laço consumiria o teto do dia.
    const teto = COTAS_IA.porSessao.maximo + 1;
    const laco = await sessao();
    for (let i = 0; i < COTAS_IA.porSessao.maximo + 50; i++) {
      await autorizarIa(db, laco, IP, teto, AGORA);
    }
    expect(await autorizarIa(db, await sessao(), "192.0.2.60", teto, AGORA)).toBeNull();
  });

  it("teto zero desliga a IA sem tirar a chave", async () => {
    expect(await autorizarIa(db, await sessao(), IP, 0, AGORA)).toBe("teto_diario");
  });
});

describe("IA: falha fechada", () => {
  it("sem banco, recusa — gastar sem contar é o defeito que a cota impede", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const id = await sessao();
    await pg.close();
    expect(await autorizarIa(db, id, IP, TETO_FOLGADO, AGORA)).toBe("desconhecido");
  });
});

describe("IA: o teto lido do ambiente", () => {
  it("usa o padrão sem a variável", () => {
    expect(tetoDiarioIa({})).toBe(TETO_DIARIO_IA_PADRAO);
  });

  it("aceita zero e inteiros positivos", () => {
    expect(tetoDiarioIa({ IA_TETO_DIARIO: "0" })).toBe(0);
    expect(tetoDiarioIa({ IA_TETO_DIARIO: " 250 " })).toBe(250);
  });

  it("valor inválido cai no padrão — erro de digitação não vira teto infinito", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const v of ["abc", "-1", "1.5", "Infinity", "1e9x"]) {
      expect(tetoDiarioIa({ IA_TETO_DIARIO: v })).toBe(TETO_DIARIO_IA_PADRAO);
    }
  });
});

describe("IA: a tela sabe explicar cada recusa da porta", () => {
  it("não oferece 'tentar de novo' quando um clique não resolve", () => {
    // Repetir não traz de volta uma sessão vencida, nem antecipa o dia.
    expect(podeTentarDeNovo("sessao_ausente")).toBe(false);
    expect(podeTentarDeNovo("teto_diario")).toBe(false);
    expect(podeTentarDeNovo("muitos_pedidos")).toBe(true);
    expect(podeTentarDeNovo("COTA_DA_SESSAO")).toBe(true);
  });

  it("o teto do dia é ajuda pausada, não erro: o texto diz que o currículo sai igual", () => {
    expect(mensagemDeFalhaIa("teto_diario")).toMatch(/currículo sai igual/);
  });
});

describe("compilação", () => {
  it("recusa um id inventado — sem sessão, não há compilador grátis", async () => {
    const r = await autorizarCompilacao(db, "inventado", IP, AGORA);
    expect(r?.codigo).toBe("SESSAO_AUSENTE");
  });

  it(`passa ${COTAS_COMPILACAO.porSessao.maximo} por hora por sessão e recusa a seguinte`, async () => {
    const id = await sessao();
    for (let i = 0; i < COTAS_COMPILACAO.porSessao.maximo; i++) {
      expect(await autorizarCompilacao(db, id, IP, AGORA)).toBeNull();
    }
    const r = await autorizarCompilacao(db, id, IP, AGORA);
    expect(r?.codigo).toBe("MUITOS_PEDIDOS");
    // A mensagem não diz qual limite foi — só o que fazer.
    expect(r?.mensagem).not.toMatch(/sess|IP|origem/i);
  });

  it("segura a fila de um IP espalhado por muitas sessões", async () => {
    const porSessao = COTAS_COMPILACAO.porSessao.maximo;
    const sessoes = Math.ceil(COTAS_COMPILACAO.porOrigem.maximo / porSessao);
    for (let s = 0; s < sessoes; s++) {
      const id = await sessao();
      for (let i = 0; i < porSessao; i++) await autorizarCompilacao(db, id, IP, AGORA);
    }
    const r = await autorizarCompilacao(db, await sessao(), IP, AGORA);
    expect(r?.codigo).toBe("MUITOS_PEDIDOS");
  });

  it("sem banco, recusa com mensagem segura", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const id = await sessao();
    await pg.close();
    const r = await autorizarCompilacao(db, id, IP, AGORA);
    expect(r?.codigo).toBe("ERRO_INTERNO");
    expect(r?.mensagem).not.toMatch(/banco|postgres|ECONN/i);
  });
});

describe("começar: a sessão nasce do clique, com limite por origem", () => {
  it(`cria até ${LIMITE_SESSOES_POR_ORIGEM.maximo} por hora por IP e não grava a recusada`, async () => {
    for (let i = 0; i < LIMITE_SESSOES_POR_ORIGEM.maximo; i++) {
      expect((await comecar(db, IP, AGORA)).ok).toBe(true);
    }
    expect(await comecar(db, IP, AGORA)).toEqual({ ok: false, motivo: "muitos_pedidos" });
    expect(await db.select().from(cvSessions)).toHaveLength(LIMITE_SESSOES_POR_ORIGEM.maximo);

    // Outra origem segue começando.
    expect((await comecar(db, "198.51.100.20", AGORA)).ok).toBe(true);
  });

  it("devolve o id de uma sessão que existe", async () => {
    const r = await comecar(db, IP, AGORA);
    if (!r.ok) throw new Error("recusou");
    expect(await autorizarCompilacao(db, r.id, IP, AGORA)).toBeNull();
  });
});

describe("origem do pedido", () => {
  const h = (valores: Record<string, string>) => new Headers(valores);

  it("usa o primeiro endereço do x-forwarded-for", () => {
    expect(origemDoPedido(h({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  });

  it("cai para x-real-ip", () => {
    expect(origemDoPedido(h({ "x-real-ip": "203.0.113.8" }))).toBe("203.0.113.8");
  });

  it("sem cabeçalho, todos dividem a mesma origem — o limite aperta, não some", () => {
    expect(origemDoPedido(h({}))).toBe("desconhecida");
    expect(origemDoPedido(h({ "x-forwarded-for": " " }))).toBe("desconhecida");
  });
});
