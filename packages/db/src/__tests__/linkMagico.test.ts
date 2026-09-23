import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";

import { abrirBancoDeTeste, daquiA, type BancoDeTeste } from "./ajuda.js";
import { criarSessao } from "../sessoes.js";
import {
  criarLinkMagico,
  resgatarLinkMagico,
  gerarToken,
  hashDoToken,
  linksAtivos,
  VALIDADE_LINK_MS,
  VALIDADE_SESSAO_MS,
} from "../linkMagico.js";
import { magicLinks, cvSessions } from "../esquema.js";

let ctx: BancoDeTeste;

beforeEach(async () => {
  ctx = await abrirBancoDeTeste();
});
afterEach(async () => {
  await ctx.fechar();
});

describe("geração do token", () => {
  it("produz tokens distintos", () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => gerarToken()));
    expect(tokens.size).toBe(1000);
  });

  it("usa base64url — sobrevive a link em e-mail", () => {
    // Caracteres de base64 comum (+, /, =) precisariam de escape na URL e
    // quebram com o reencaminhamento de alguns clientes de e-mail.
    for (let i = 0; i < 100; i++) {
      expect(gerarToken()).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("carrega 256 bits de entropia", () => {
    // 32 bytes em base64url dão 43 caracteres.
    expect(gerarToken().length).toBe(43);
  });

  it("hash é determinístico e diferente do token", () => {
    const t = gerarToken();
    expect(hashDoToken(t)).toBe(hashDoToken(t));
    expect(hashDoToken(t)).not.toBe(t);
    expect(hashDoToken(t)).toHaveLength(64);
  });
});

describe("o banco nunca guarda o token", () => {
  /**
   * A propriedade de segurança central desta parte. Quem ler o banco — backup
   * vazado, dump de suporte — não pode entrar em sessão nenhuma.
   */
  it("persiste o hash, e o token não aparece em lugar nenhum", async () => {
    const sessao = await criarSessao(ctx.db);
    const { token } = await criarLinkMagico(ctx.db, sessao.id, "ana@exemplo.com");

    const linhas = await ctx.db.select().from(magicLinks);

    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.tokenHash).toBe(hashDoToken(token));

    // Varredura na linha inteira: nenhum campo pode conter o token.
    expect(JSON.stringify(linhas[0])).not.toContain(token);
  });
});

describe("resgate", () => {
  it("devolve a sessão para um token válido", async () => {
    const sessao = await criarSessao(ctx.db);
    const { token } = await criarLinkMagico(ctx.db, sessao.id, "ana@exemplo.com");

    const r = await resgatarLinkMagico(ctx.db, token);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sessionId).toBe(sessao.id);
  });

  it("grava o e-mail na sessão ao criar o link", async () => {
    const sessao = await criarSessao(ctx.db);
    expect(sessao.email).toBeNull();

    await criarLinkMagico(ctx.db, sessao.id, "ana@exemplo.com");

    const [linha] = await ctx.db
      .select()
      .from(cvSessions)
      .where(eq(cvSessions.id, sessao.id));
    expect(linha?.email).toBe("ana@exemplo.com");
  });

  it("recusa token inexistente", async () => {
    const r = await resgatarLinkMagico(ctx.db, gerarToken());
    expect(r).toEqual({ ok: false, motivo: "invalido" });
  });

  it("recusa token expirado", async () => {
    const sessao = await criarSessao(ctx.db);
    const { token } = await criarLinkMagico(ctx.db, sessao.id, "ana@exemplo.com");

    const depoisDaValidade = daquiA(VALIDADE_LINK_MS + 1000);
    const r = await resgatarLinkMagico(ctx.db, token, depoisDaValidade);

    expect(r).toEqual({ ok: false, motivo: "expirado" });
  });

  it("renova a validade da sessão no resgate", async () => {
    const sessao = await criarSessao(ctx.db);
    const validadeInicial = sessao.expiraEm.getTime();
    const { token } = await criarLinkMagico(ctx.db, sessao.id, "ana@exemplo.com");

    // Dentro da validade do LINK (7 dias), que é menor que a da sessão (30).
    // A primeira versão deste teste resgatava no dia 20 e falhava com
    // "expirado" — o código estava certo e o teste, errado. Fica registrado
    // porque é fácil repetir o engano: são dois prazos diferentes.
    const daqui5Dias = daquiA(5 * 24 * 60 * 60 * 1000);
    const r = await resgatarLinkMagico(ctx.db, token, daqui5Dias);
    expect(r.ok).toBe(true);

    const [linha] = await ctx.db
      .select()
      .from(cvSessions)
      .where(eq(cvSessions.id, sessao.id));

    // Resgatar é acessar: a sessão ganha 30 dias contados a partir de agora,
    // e não dos 30 originais.
    expect(linha!.expiraEm.getTime()).toBeGreaterThan(validadeInicial);
    expect(linha!.expiraEm.getTime()).toBe(
      daqui5Dias.getTime() + VALIDADE_SESSAO_MS,
    );
  });
});

describe("uso único", () => {
  it("recusa o segundo resgate", async () => {
    const sessao = await criarSessao(ctx.db);
    const { token } = await criarLinkMagico(ctx.db, sessao.id, "ana@exemplo.com");

    expect((await resgatarLinkMagico(ctx.db, token)).ok).toBe(true);

    const segunda = await resgatarLinkMagico(ctx.db, token);
    expect(segunda).toEqual({ ok: false, motivo: "ja_usado" });
  });

  /**
   * O teste que justifica o UPDATE condicional.
   *
   * Ler e depois gravar tem janela de corrida: dois cliques no mesmo link, ou
   * duas abas abrindo juntas, passariam os dois pela checagem antes de
   * qualquer um gravar. Com `usado_em IS NULL` na cláusula WHERE, o banco
   * decide, e só uma transação afeta linha.
   *
   * Este é o tipo de garantia que um dublê em memória aprovaria sem provar
   * nada — é por isso que os testes rodam Postgres de verdade.
   */
  it("resiste a resgates simultâneos", async () => {
    const sessao = await criarSessao(ctx.db);
    const { token } = await criarLinkMagico(ctx.db, sessao.id, "ana@exemplo.com");

    const resultados = await Promise.all([
      resgatarLinkMagico(ctx.db, token),
      resgatarLinkMagico(ctx.db, token),
      resgatarLinkMagico(ctx.db, token),
    ]);

    expect(resultados.filter((r) => r.ok)).toHaveLength(1);
    expect(resultados.filter((r) => !r.ok)).toHaveLength(2);
  });
});

describe("um link novo invalida os anteriores", () => {
  it("só o mais recente funciona", async () => {
    const sessao = await criarSessao(ctx.db);

    const primeiro = await criarLinkMagico(ctx.db, sessao.id, "ana@exemplo.com");
    const segundo = await criarLinkMagico(ctx.db, sessao.id, "ana@exemplo.com");

    // E-mails acumulam na caixa de entrada; o que vale é o que ela pediu por
    // último.
    expect((await resgatarLinkMagico(ctx.db, primeiro.token)).ok).toBe(false);
    expect((await resgatarLinkMagico(ctx.db, segundo.token)).ok).toBe(true);
  });

  it("deixa apenas um link ativo", async () => {
    const sessao = await criarSessao(ctx.db);
    await criarLinkMagico(ctx.db, sessao.id, "ana@exemplo.com");
    await criarLinkMagico(ctx.db, sessao.id, "ana@exemplo.com");
    await criarLinkMagico(ctx.db, sessao.id, "ana@exemplo.com");

    expect(await linksAtivos(ctx.db, sessao.id)).toHaveLength(1);
  });
});

describe("apagar a sessão leva os links junto", () => {
  it("o CASCADE limpa os links", async () => {
    const sessao = await criarSessao(ctx.db);
    const { token } = await criarLinkMagico(ctx.db, sessao.id, "ana@exemplo.com");

    await ctx.db.delete(cvSessions).where(eq(cvSessions.id, sessao.id));

    expect(await ctx.db.select().from(magicLinks)).toHaveLength(0);
    expect(await resgatarLinkMagico(ctx.db, token)).toEqual({
      ok: false,
      motivo: "invalido",
    });
  });
});
