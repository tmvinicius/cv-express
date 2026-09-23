import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { novaExperiencia, validarCv } from "@cv-express/schema";

import { abrirBancoDeTeste, daquiA, type BancoDeTeste } from "./ajuda.js";
import {
  criarSessao,
  buscarSessao,
  salvarCv,
  apagarSessao,
  expurgarExpiradas,
} from "../sessoes.js";
import { criarLinkMagico } from "../linkMagico.js";
import { registrarJob } from "../jobs.js";
import { cvSessions, magicLinks, compileJobs } from "../esquema.js";
import { VALIDADE_SESSAO_MS } from "../linkMagico.js";

let ctx: BancoDeTeste;

beforeEach(async () => {
  ctx = await abrirBancoDeTeste();
});
afterEach(async () => {
  await ctx.fechar();
});

describe("criar e buscar", () => {
  it("cria sessão com currículo em branco", async () => {
    const sessao = await criarSessao(ctx.db);

    expect(sessao.id).toBeTruthy();
    expect(sessao.email).toBeNull();
    expect(sessao.data.experiencias).toEqual([]);
    expect(sessao.data.locale).toBe("pt-BR");
  });

  it("gera ids imprevisíveis — é a propriedade de segurança do produto anônimo", async () => {
    // Não há autenticação: quem tem o id tem a sessão. Ids sequenciais
    // deixariam qualquer um enumerar currículos alheios.
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) {
      ids.add((await criarSessao(ctx.db)).id);
    }
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id.length).toBeGreaterThanOrEqual(21);
  });

  it("devolve null para sessão inexistente", async () => {
    expect(await buscarSessao(ctx.db, "nao-existe")).toBeNull();
  });
});

describe("JSONB preserva o CvData", () => {
  /**
   * O currículo vai e volta do Postgres como JSONB. Este teste garante que a
   * ida e volta não perde nem altera nada — inclusive acentuação, que é o
   * requisito mais sensível do projeto.
   */
  it("preserva acentuação e estrutura na ida e volta", async () => {
    const sessao = await criarSessao(ctx.db);

    const cv = {
      ...sessao.data,
      pessoal: {
        nome: "João Conceição d'Ávila",
        cidade: "São Paulo",
        email: "joao@exemplo.com.br",
      },
      experiencias: [
        novaExperiencia({
          id: "exp-1",
          cargo: "Desenvolvedor Sênior",
          empresa: "Acme & Cia",
          periodo: { inicio: { ano: 2021, mes: 3 }, fim: "atual" },
          descricaoOriginal: "cuidei das APIs — 100% do tempo",
          bullets: ["Desenvolvi APIs REST"],
          statusIa: "applied",
        }),
      ],
    };

    expect(await salvarCv(ctx.db, sessao.id, cv)).toBe(true);

    const lida = await buscarSessao(ctx.db, sessao.id);
    expect(lida?.data).toEqual(cv);
    expect(lida?.data.pessoal.nome).toBe("João Conceição d'Ávila");
    expect(lida?.data.experiencias[0]?.descricaoOriginal).toContain("100%");
  });

  it("o currículo lido continua válido pelo schema", async () => {
    // Guarda contra o banco alterar o formato em silêncio — data virando
    // string, número virando texto.
    const sessao = await criarSessao(ctx.db);
    const cv = {
      ...sessao.data,
      pessoal: { nome: "Ana", cidade: "BH", email: "ana@exemplo.com" },
    };

    await salvarCv(ctx.db, sessao.id, cv);
    const lida = await buscarSessao(ctx.db, sessao.id);

    expect(validarCv(lida!.data).success).toBe(true);
  });
});

describe("retenção por acesso, não por criação", () => {
  /**
   * A regra é "30 dias SEM USO". Quem volta ao currículo toda semana nunca
   * perde o trabalho — e apagar o rascunho de alguém que está usando o
   * produto é um defeito grave, do tipo que só aparece um mês depois do
   * lançamento.
   */
  it("buscar renova a validade", async () => {
    const sessao = await criarSessao(ctx.db);
    const validadeInicial = sessao.expiraEm.getTime();

    const daqui25Dias = daquiA(25 * 24 * 60 * 60 * 1000);
    const renovada = await buscarSessao(ctx.db, sessao.id, daqui25Dias);

    expect(renovada).not.toBeNull();
    expect(renovada!.expiraEm.getTime()).toBeGreaterThan(validadeInicial);
  });

  it("salvar também renova", async () => {
    const sessao = await criarSessao(ctx.db);

    const daqui25Dias = daquiA(25 * 24 * 60 * 60 * 1000);
    await salvarCv(ctx.db, sessao.id, sessao.data, daqui25Dias);

    const [linha] = await ctx.db
      .select()
      .from(cvSessions)
      .where(eq(cvSessions.id, sessao.id));

    expect(linha!.expiraEm.getTime()).toBeGreaterThan(
      daqui25Dias.getTime() + 29 * 24 * 60 * 60 * 1000,
    );
  });

  it("sessão vencida é tratada como inexistente, mesmo antes do expurgo", async () => {
    // O expurgo roda uma vez por dia; até lá a linha existe e não deve
    // responder.
    const sessao = await criarSessao(ctx.db);
    const depoisDaValidade = daquiA(VALIDADE_SESSAO_MS + 1000);

    expect(await buscarSessao(ctx.db, sessao.id, depoisDaValidade)).toBeNull();
    expect(await ctx.db.select().from(cvSessions)).toHaveLength(1);
  });

  it("salvar em sessão inexistente devolve false, sem lançar", async () => {
    // O autosave roda em segundo plano; aba esquecida aberta por semanas é
    // cenário esperado.
    const sessao = await criarSessao(ctx.db);
    expect(await salvarCv(ctx.db, "id-que-nao-existe", sessao.data)).toBe(false);
  });
});

describe("apagar meus dados agora", () => {
  /** O botão exigido pela LGPD (seção 5.3). */
  it("leva sessão, links e jobs juntos", async () => {
    const sessao = await criarSessao(ctx.db);
    await criarLinkMagico(ctx.db, sessao.id, "ana@exemplo.com");
    await registrarJob(ctx.db, {
      sessionId: sessao.id,
      contentHash: "abc",
      templateId: "classico",
      templateVersao: "1.0.0",
    });

    expect(await apagarSessao(ctx.db, sessao.id)).toBe(true);

    expect(await ctx.db.select().from(cvSessions)).toHaveLength(0);
    expect(await ctx.db.select().from(magicLinks)).toHaveLength(0);
    expect(await ctx.db.select().from(compileJobs)).toHaveLength(0);
  });

  it("devolve false quando não havia nada para apagar", async () => {
    expect(await apagarSessao(ctx.db, "nao-existe")).toBe(false);
  });
});

describe("expurgo diário", () => {
  it("apaga só as vencidas", async () => {
    const antiga = await criarSessao(ctx.db);
    const nova = await criarSessao(ctx.db);

    // Renova a nova, deixando a antiga para trás.
    const daqui20Dias = daquiA(20 * 24 * 60 * 60 * 1000);
    await buscarSessao(ctx.db, nova.id, daqui20Dias);

    const daqui35Dias = daquiA(35 * 24 * 60 * 60 * 1000);
    const apagadas = await expurgarExpiradas(ctx.db, daqui35Dias);

    expect(apagadas).toBe(1);
    const restantes = await ctx.db.select().from(cvSessions);
    expect(restantes).toHaveLength(1);
    expect(restantes[0]?.id).toBe(nova.id);
    expect(antiga.id).not.toBe(nova.id);
  });

  it("não apaga nada quando tudo está válido", async () => {
    await criarSessao(ctx.db);
    expect(await expurgarExpiradas(ctx.db)).toBe(0);
  });
});
