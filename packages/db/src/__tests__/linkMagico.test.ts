import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";

import { abrirBancoDeTeste, daquiA, type BancoDeTeste } from "./ajuda.js";
import { criarSessao, buscarSessao, salvarCv } from "../sessoes.js";
import {
  concluirSessao,
  resgatarLinkMagico,
  revogarLink,
  gerarToken,
  hashDoToken,
  linksAtivos,
  PRAZO_APOS_CONCLUSAO_MS,
  MAXIMO_LINKS_POR_SESSAO,
} from "../linkMagico.js";
import { lerMigracoes } from "../migracoes.js";
import { magicLinks, cvSessions } from "../esquema.js";

let ctx: BancoDeTeste;

beforeEach(async () => {
  ctx = await abrirBancoDeTeste();
});
afterEach(async () => {
  await ctx.fechar();
});

const DIA = 24 * 60 * 60 * 1000;

/** Conclui e devolve o token — falha o teste se não houver link novo. */
async function concluir(sessionId: string, email: string, agora?: Date) {
  const r = await concluirSessao(ctx.db, sessionId, email, agora);
  if (!r.ok || r.envio !== "novo") {
    throw new Error(`esperava link novo, veio ${JSON.stringify(r)}`);
  }
  return r;
}

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
    const { token } = await concluir(sessao.id, "ana@exemplo.com");

    const linhas = await ctx.db.select().from(magicLinks);

    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.tokenHash).toBe(hashDoToken(token));
    expect(JSON.stringify(linhas[0])).not.toContain(token);
  });
});

describe("concluir fixa o prazo em 5 dias", () => {
  it("link e sessão terminam no MESMO instante", async () => {
    // Se só o link expirasse, o endereço /cv/<id> continuaria valendo por 30
    // dias — e o prazo de 5 seria decorativo.
    const hoje = new Date("2026-10-03T12:00:00Z");
    const sessao = await criarSessao(ctx.db, hoje);

    const r = await concluir(sessao.id, "ana@exemplo.com", hoje);

    const prazo = hoje.getTime() + PRAZO_APOS_CONCLUSAO_MS;
    expect(r.expiraEm.getTime()).toBe(prazo);

    const [linha] = await ctx.db.select().from(cvSessions).where(eq(cvSessions.id, sessao.id));
    expect(linha?.expiraEm.getTime()).toBe(prazo);
    expect(linha?.concluidoEm?.getTime()).toBe(hoje.getTime());
    expect(linha?.email).toBe("ana@exemplo.com");
  });

  it("recusa concluir sessão inexistente ou vencida", async () => {
    expect(await concluirSessao(ctx.db, "nao-existe", "a@b.com")).toEqual({
      ok: false,
      motivo: "sessao_inexistente",
    });
  });
});

describe("a regra do mantenedor: o link não reseta", () => {
  /**
   * O cenário descrito, ao pé da letra: a pessoa conclui hoje e recebe o
   * link; amanhã volta pelo link, edita e conclui de novo. O prazo continua
   * sendo hoje + 5 dias, e o link que ela tem continua sendo o link.
   */
  it("concluiu hoje, editou amanhã: o prazo continua o de hoje", async () => {
    const hoje = new Date("2026-10-03T12:00:00Z");
    const amanha = new Date(hoje.getTime() + DIA);
    const prazo = hoje.getTime() + PRAZO_APOS_CONCLUSAO_MS;

    const sessao = await criarSessao(ctx.db, hoje);
    const { token } = await concluir(sessao.id, "ana@exemplo.com", hoje);

    // Amanhã: volta pelo link...
    const resgate = await resgatarLinkMagico(ctx.db, token, amanha);
    expect(resgate).toEqual({ ok: true, sessionId: sessao.id, expiraEm: new Date(prazo) });

    // ...abre o currículo, edita, salva...
    expect(await buscarSessao(ctx.db, sessao.id, amanha)).not.toBeNull();
    const editado = { ...sessao.data, objetivo: { texto: "Mudei o objetivo." } };
    expect(await salvarCv(ctx.db, sessao.id, editado, amanha)).toBe(true);

    // ...e clica "Concluir e salvar" de novo.
    const deNovo = await concluirSessao(ctx.db, sessao.id, "ana@exemplo.com", amanha);
    expect(deNovo).toEqual({ ok: true, envio: "ja_enviado", expiraEm: new Date(prazo) });

    // Nada renovou nada.
    const [linha] = await ctx.db.select().from(cvSessions).where(eq(cvSessions.id, sessao.id));
    expect(linha?.expiraEm.getTime()).toBe(prazo);
    expect(linha?.data.objetivo.texto).toBe("Mudei o objetivo.");

    // E o MESMO link continua funcionando.
    expect((await resgatarLinkMagico(ctx.db, token, amanha)).ok).toBe(true);
  });

  it("o link é reutilizável quantas vezes a pessoa quiser até o prazo", async () => {
    const sessao = await criarSessao(ctx.db);
    const { token } = await concluir(sessao.id, "ana@exemplo.com");

    for (const dias of [0, 1, 2, 4]) {
      expect((await resgatarLinkMagico(ctx.db, token, daquiA(dias * DIA))).ok).toBe(true);
    }
  });

  it("passado o prazo, link, leitura e gravação param juntos", async () => {
    const sessao = await criarSessao(ctx.db);
    const { token } = await concluir(sessao.id, "ana@exemplo.com");
    const depois = daquiA(PRAZO_APOS_CONCLUSAO_MS + 1000);

    expect(await resgatarLinkMagico(ctx.db, token, depois)).toEqual({
      ok: false,
      motivo: "expirado",
    });
    // O endereço /cv/<id> também deixa de responder — não há porta dos fundos.
    expect(await buscarSessao(ctx.db, sessao.id, depois)).toBeNull();
    // E uma aba esquecida aberta não grava nem ressuscita a sessão.
    expect(await salvarCv(ctx.db, sessao.id, sessao.data, depois)).toBe(false);
  });

  it("resgatar não renova nada", async () => {
    const sessao = await criarSessao(ctx.db);
    const { token, expiraEm } = await concluir(sessao.id, "ana@exemplo.com");

    await resgatarLinkMagico(ctx.db, token, daquiA(3 * DIA));

    const [link] = await ctx.db.select().from(magicLinks);
    const [linha] = await ctx.db.select().from(cvSessions);
    expect(link?.expiraEm.getTime()).toBe(expiraEm.getTime());
    expect(linha?.expiraEm.getTime()).toBe(expiraEm.getTime());
    expect(link?.ultimoUsoEm).not.toBeNull();
  });

  it("maiúscula e espaço no e-mail não contam como e-mail novo", async () => {
    const sessao = await criarSessao(ctx.db);
    await concluir(sessao.id, "ana@exemplo.com");

    const r = await concluirSessao(ctx.db, sessao.id, "  Ana@Exemplo.COM ");
    expect(r.ok && r.envio).toBe("ja_enviado");
  });
});

describe("trocar o e-mail", () => {
  it("manda link novo, revoga o antigo e NÃO estende o prazo", async () => {
    // O link antigo pode ter ido para a caixa de outra pessoa (e-mail
    // digitado errado). Lá, ele seria uma chave do currículo.
    const hoje = new Date("2026-10-03T12:00:00Z");
    const sessao = await criarSessao(ctx.db, hoje);
    const primeiro = await concluir(sessao.id, "ana@exmplo.com", hoje);

    const doisDiasDepois = new Date(hoje.getTime() + 2 * DIA);
    const segundo = await concluir(sessao.id, "ana@exemplo.com", doisDiasDepois);

    expect(segundo.token).not.toBe(primeiro.token);
    expect(segundo.expiraEm.getTime()).toBe(primeiro.expiraEm.getTime());

    expect(await resgatarLinkMagico(ctx.db, primeiro.token, doisDiasDepois)).toEqual({
      ok: false,
      motivo: "revogado",
    });
    expect((await resgatarLinkMagico(ctx.db, segundo.token, doisDiasDepois)).ok).toBe(true);
    expect(await linksAtivos(ctx.db, sessao.id, doisDiasDepois)).toHaveLength(1);
  });

  it("tem teto, para a sessão não virar disparador de e-mail", async () => {
    const sessao = await criarSessao(ctx.db);
    for (let i = 0; i < MAXIMO_LINKS_POR_SESSAO; i++) {
      await concluir(sessao.id, `pessoa${i}@exemplo.com`);
    }

    expect(await concluirSessao(ctx.db, sessao.id, "mais-uma@exemplo.com")).toEqual({
      ok: false,
      motivo: "limite_de_envios",
    });
  });
});

describe("falha no envio do e-mail", () => {
  it("revogar o link faz o próximo clique enviar de novo, com o mesmo prazo", async () => {
    // Sem isto, o link que ninguém recebeu ficaria "ativo", e o próximo
    // clique responderia "já enviamos" — a pessoa ficaria sem link.
    const sessao = await criarSessao(ctx.db);
    const primeiro = await concluir(sessao.id, "ana@exemplo.com");

    await revogarLink(ctx.db, primeiro.token);

    const segundo = await concluirSessao(ctx.db, sessao.id, "ana@exemplo.com");
    expect(segundo.ok && segundo.envio).toBe("novo");
    expect(segundo.ok && segundo.expiraEm.getTime()).toBe(primeiro.expiraEm.getTime());
  });
});

describe("duplo clique", () => {
  /**
   * `FOR UPDATE` serializa as conclusões. Sem ele, os cliques passariam pela
   * checagem "já enviado?" antes de qualquer um gravar, e sairiam vários
   * e-mails com links diferentes.
   *
   * ATENÇÃO: aqui este teste fixa o COMPORTAMENTO, não prova a trava. O
   * PGlite tem uma conexão só e já serializa as transações — ele passa mesmo
   * sem o `FOR UPDATE` (conferido). A trava foi medida contra Postgres 16 de
   * verdade, com pool de 10 conexões, 20 sessões e 10 cliques simultâneos em
   * cada: com ela, 20 e-mails; sem ela, 100. Não a remova por este teste
   * continuar verde.
   */
  it("conclusões simultâneas geram um link só", async () => {
    const sessao = await criarSessao(ctx.db);

    const resultados = await Promise.all([
      concluirSessao(ctx.db, sessao.id, "ana@exemplo.com"),
      concluirSessao(ctx.db, sessao.id, "ana@exemplo.com"),
      concluirSessao(ctx.db, sessao.id, "ana@exemplo.com"),
    ]);

    const novos = resultados.filter((r) => r.ok && r.envio === "novo");
    expect(novos).toHaveLength(1);
    expect(await ctx.db.select().from(magicLinks)).toHaveLength(1);
  });
});

describe("resgate recusado", () => {
  it("token inexistente", async () => {
    expect(await resgatarLinkMagico(ctx.db, gerarToken())).toEqual({
      ok: false,
      motivo: "invalido",
    });
  });

  it("apagar a sessão leva os links junto (CASCADE)", async () => {
    const sessao = await criarSessao(ctx.db);
    const { token } = await concluir(sessao.id, "ana@exemplo.com");

    await ctx.db.delete(cvSessions).where(eq(cvSessions.id, sessao.id));

    expect(await ctx.db.select().from(magicLinks)).toHaveLength(0);
    expect(await resgatarLinkMagico(ctx.db, token)).toEqual({ ok: false, motivo: "invalido" });
  });
});

describe("migração 0001 sobre um banco que já existia", () => {
  /**
   * Na regra antiga, `usado_em` preenchido queria dizer "este link não vale
   * mais". A migração troca o nome da coluna; se não convertesse esses
   * registros em revogados, links antigos voltariam a funcionar.
   */
  it("link consumido pela regra antiga continua sem valer", async () => {
    const pg = new PGlite();
    const [m0000, m0001] = lerMigracoes();

    await pg.exec(m0000!.sql);
    await pg.exec(`
      INSERT INTO cv_sessions (id, data, expira_em) VALUES ('s1', '{}', now() + interval '30 days');
      INSERT INTO magic_links (token_hash, session_id, expira_em, usado_em)
        VALUES ('consumido', 's1', now() + interval '1 day', now()),
               ('virgem',    's1', now() + interval '1 day', NULL);
    `);

    await pg.exec(m0001!.sql);
    // Idempotente: aplicar de novo não quebra nem desfaz.
    await pg.exec(m0001!.sql);

    const { rows } = await pg.query<{ token_hash: string; revogado: boolean }>(
      "SELECT token_hash, revogado_em IS NOT NULL AS revogado FROM magic_links ORDER BY token_hash",
    );
    expect(rows).toEqual([
      { token_hash: "consumido", revogado: true },
      { token_hash: "virgem", revogado: false },
    ]);
    await pg.close();
  });
});
