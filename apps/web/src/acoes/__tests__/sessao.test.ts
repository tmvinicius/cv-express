import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { esquema, aplicarMigracoes, type Banco } from "@cv-express/db";
import { novaExperiencia, novoCv, type CvData } from "@cv-express/schema";

import { salvarEtapa, iniciarSessao, carregarSessao, apagarTudo } from "../sessao";

/**
 * Autosave testado contra Postgres de verdade (PGlite), e não contra um dublê.
 *
 * O autosave é o mecanismo que protege o requisito mais importante do
 * produto — não perder o que a pessoa digitou. Testá-lo contra uma memória
 * falsa provaria pouco: o que precisa ser verificado é que o JSONB volta
 * igual e que a sessão ausente não derruba nada.
 */

let pg: PGlite;
let db: Banco;

beforeEach(async () => {
  pg = new PGlite();
  await aplicarMigracoes((sql) => pg.exec(sql));
  db = drizzle(pg, { schema: esquema }) as unknown as Banco;
});
afterEach(async () => {
  await pg.close();
});

describe("rascunho incompleto é estado legítimo", () => {
  /**
   * O estado normal entre a etapa 1 e a 2: currículo sem nome, sem cidade,
   * sem e-mail. Recusar isso obrigaria a pessoa a preencher tudo antes do
   * primeiro autosave — exatamente o que o planejamento quer evitar.
   */
  it("salva currículo em branco", async () => {
    const sessao = await iniciarSessao(db);
    const r = await salvarEtapa(db, sessao.id, sessao.data);

    expect(r.ok).toBe(true);
  });

  it("salva com só o nome preenchido", async () => {
    const sessao = await iniciarSessao(db);
    const cv: CvData = {
      ...sessao.data,
      pessoal: { ...sessao.data.pessoal, nome: "Ana" },
    };

    expect((await salvarEtapa(db, sessao.id, cv)).ok).toBe(true);
  });
});

describe("mas dado malformado não entra no banco", () => {
  it("recusa período invertido", async () => {
    const sessao = await iniciarSessao(db);
    const cv: CvData = {
      ...sessao.data,
      experiencias: [
        novaExperiencia({
          cargo: "Dev",
          empresa: "Acme",
          periodo: { inicio: { ano: 2024, mes: 6 }, fim: { ano: 2020, mes: 1 } },
        }),
      ],
    };

    const r = await salvarEtapa(db, sessao.id, cv);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("dados_invalidos");
  });

  it("recusa e-mail impossível", async () => {
    const sessao = await iniciarSessao(db);
    const cv: CvData = {
      ...sessao.data,
      pessoal: { ...sessao.data.pessoal, email: "isso não é e-mail" },
    };

    const r = await salvarEtapa(db, sessao.id, cv);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("dados_invalidos");
  });

  /**
   * O par que pega a regressão, no MESMO campo.
   *
   * A primeira versão do filtro dispensava qualquer erro em `pessoal.email`,
   * e com isso aceitava os dois casos. Vazio é rascunho; preenchido e
   * inválido é defeito, e a diferença tem de ser observável aqui.
   */
  it("aceita e-mail vazio mas recusa e-mail preenchido e inválido", async () => {
    const sessao = await iniciarSessao(db);

    const vazio: CvData = {
      ...sessao.data,
      pessoal: { ...sessao.data.pessoal, email: "" },
    };
    expect((await salvarEtapa(db, sessao.id, vazio)).ok).toBe(true);

    const lixo: CvData = {
      ...sessao.data,
      pessoal: { ...sessao.data.pessoal, email: "isso-nao-e-email" },
    };
    expect((await salvarEtapa(db, sessao.id, lixo)).ok).toBe(false);
  });

  it("aponta qual campo está errado", async () => {
    const sessao = await iniciarSessao(db);
    const cv: CvData = {
      ...sessao.data,
      pessoal: { ...sessao.data.pessoal, email: "quebrado" },
    };

    const r = await salvarEtapa(db, sessao.id, cv);
    if (!r.ok) expect(r.detalhe).toContain("email");
  });
});

describe("ida e volta do currículo", () => {
  it("o que foi salvo volta idêntico, com acentuação", async () => {
    const sessao = await iniciarSessao(db);
    const cv: CvData = {
      ...sessao.data,
      pessoal: {
        nome: "João Conceição",
        cidade: "São Paulo",
        email: "joao@exemplo.com",
      },
      experiencias: [
        novaExperiencia({
          id: "e1",
          cargo: "Analista Sênior",
          empresa: "Acme & Cia",
          descricaoOriginal: "cuidei de 100% das integrações",
        }),
      ],
    };

    await salvarEtapa(db, sessao.id, cv);
    const lida = await carregarSessao(db, sessao.id);

    expect(lida?.data).toEqual(cv);
  });
});

describe("falhas não derrubam o autosave", () => {
  it("sessão inexistente devolve resultado, não exceção", async () => {
    // O autosave roda em segundo plano; uma aba esquecida aberta por semanas
    // é cenário esperado, não excepcional.
    const r = await salvarEtapa(db, "sessao-que-sumiu", novoCv("x"));

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("sessao_ausente");
  });
});

describe("apagar meus dados agora", () => {
  it("remove a sessão e ela deixa de carregar", async () => {
    const sessao = await iniciarSessao(db);

    expect(await apagarTudo(db, sessao.id)).toBe(true);
    expect(await carregarSessao(db, sessao.id)).toBeNull();
  });
});
