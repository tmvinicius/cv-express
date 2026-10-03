import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";

import { abrirBancoDeTeste, daquiA, type BancoDeTeste } from "./ajuda.js";
import { chaveDeLimite, consumirLimite, expurgarLimites } from "../limites.js";
import { expurgoDiario } from "../expurgo.js";
import { criarSessao, buscarSessao } from "../sessoes.js";
import { concluirSessao, resgatarLinkMagico, PRAZO_APOS_CONCLUSAO_MS } from "../linkMagico.js";
import { cvSessions, limitesEnvio, magicLinks } from "../esquema.js";

let ctx: BancoDeTeste;

beforeEach(async () => {
  ctx = await abrirBancoDeTeste();
});
afterEach(async () => {
  await ctx.fechar();
});

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;
const POR_HORA = { janelaMs: HORA, maximo: 3 };

describe("chave do limite", () => {
  it("guarda hash, nunca o IP ou o e-mail em claro", () => {
    const chave = chaveDeLimite("ip", "203.0.113.7");
    expect(chave).toMatch(/^ip:[0-9a-f]{64}$/);
    expect(chave).not.toContain("203.0.113.7");
  });

  it("maiúscula e espaço no e-mail caem na mesma chave", () => {
    // Senão, "Ana@Exemplo.com" e "ana@exemplo.com " seriam dois
    // destinatários para o limite — e o limite por destinatário, inútil.
    expect(chaveDeLimite("email", " Ana@Exemplo.COM")).toBe(chaveDeLimite("email", "ana@exemplo.com"));
  });
});

describe("consumir o limite", () => {
  const agora = new Date("2026-10-05T10:15:00Z");

  it("deixa passar até o máximo e recusa o seguinte", async () => {
    const chave = chaveDeLimite("ip", "203.0.113.7");
    const r = [];
    for (let i = 0; i < 4; i++) r.push(await consumirLimite(ctx.db, chave, POR_HORA, agora));
    expect(r).toEqual([true, true, true, false]);
  });

  it("chaves diferentes não dividem o mesmo contador", async () => {
    for (let i = 0; i < 3; i++) await consumirLimite(ctx.db, chaveDeLimite("ip", "a"), POR_HORA, agora);
    expect(await consumirLimite(ctx.db, chaveDeLimite("ip", "b"), POR_HORA, agora)).toBe(true);
  });

  it("a janela seguinte começa do zero", async () => {
    const chave = chaveDeLimite("ip", "203.0.113.7");
    for (let i = 0; i < 4; i++) await consumirLimite(ctx.db, chave, POR_HORA, agora);
    const proximaHora = new Date("2026-10-05T11:00:01Z");
    expect(await consumirLimite(ctx.db, chave, POR_HORA, proximaHora)).toBe(true);
  });

  it("o pedido recusado também conta — insistir não abre a porta", async () => {
    const chave = chaveDeLimite("ip", "203.0.113.7");
    for (let i = 0; i < 10; i++) await consumirLimite(ctx.db, chave, POR_HORA, agora);
    const [linha] = await ctx.db.select().from(limitesEnvio);
    expect(linha?.contagem).toBe(10);
  });

  /**
   * O incremento é um `INSERT … ON CONFLICT DO UPDATE` só. Ler, somar e
   * gravar em passos separados deixaria pedidos simultâneos passarem acima
   * do limite.
   *
   * ATENÇÃO: como no duplo clique do link mágico, o PGlite tem uma conexão só
   * e serializa tudo — aqui o teste fixa o comportamento. A atomicidade foi
   * medida em Postgres 16 real, com pool de conexões (ver COMMITS).
   */
  it("pedidos simultâneos não passam do limite", async () => {
    const chave = chaveDeLimite("ip", "203.0.113.7");
    const r = await Promise.all(
      Array.from({ length: 10 }, () => consumirLimite(ctx.db, chave, POR_HORA, agora)),
    );
    expect(r.filter(Boolean)).toHaveLength(3);
  });
});

describe("o limite dentro do Concluir e salvar", () => {
  it("bloqueado: não emite link e NÃO dispara o prazo de 5 dias", async () => {
    // Se o prazo começasse mesmo sem e-mail, quem esbarrou no limite teria o
    // currículo vencendo em 5 dias sem nunca ter recebido o link.
    const sessao = await criarSessao(ctx.db);

    const r = await concluirSessao(ctx.db, sessao.id, "ana@exemplo.com", new Date(), {
      permitirEnvio: async () => false,
    });

    expect(r).toEqual({ ok: false, motivo: "envio_bloqueado" });
    expect(await ctx.db.select().from(magicLinks)).toHaveLength(0);
    const [linha] = await ctx.db.select().from(cvSessions);
    expect(linha?.concluidoEm).toBeNull();
  });

  it("'já enviado' não consulta o limite — não gasta cota sem mandar nada", async () => {
    const sessao = await criarSessao(ctx.db);
    let consultas = 0;
    const permitirEnvio = async () => {
      consultas++;
      return true;
    };

    await concluirSessao(ctx.db, sessao.id, "ana@exemplo.com", new Date(), { permitirEnvio });
    const deNovo = await concluirSessao(ctx.db, sessao.id, "ana@exemplo.com", new Date(), {
      permitirEnvio,
    });

    expect(deNovo.ok && deNovo.envio).toBe("ja_enviado");
    expect(consultas).toBe(1);
  });

  it("o contador é gravado na MESMA transação da conclusão", async () => {
    const sessao = await criarSessao(ctx.db);
    const chave = chaveDeLimite("ip", "203.0.113.7");

    await concluirSessao(ctx.db, sessao.id, "ana@exemplo.com", new Date(), {
      permitirEnvio: (tx) => consumirLimite(tx, chave, POR_HORA),
    });

    const [linha] = await ctx.db.select().from(limitesEnvio).where(eq(limitesEnvio.chave, chave));
    expect(linha?.contagem).toBe(1);
  });
});

describe("expurgo diário", () => {
  it("apaga sessões vencidas — com seus links — e contadores velhos", async () => {
    const hoje = new Date("2026-10-05T12:00:00Z");

    // Rascunho abandonado há 31 dias.
    await criarSessao(ctx.db, new Date(hoje.getTime() - 31 * DIA));
    // Concluído há 6 dias: o prazo de 5 já passou.
    const concluida = await criarSessao(ctx.db, new Date(hoje.getTime() - 6 * DIA));
    const { token } = (await concluirSessao(
      ctx.db,
      concluida.id,
      "ana@exemplo.com",
      new Date(hoje.getTime() - 6 * DIA),
    )) as { token: string };
    // Concluído ontem: ainda vale.
    const viva = await criarSessao(ctx.db, new Date(hoje.getTime() - DIA));
    await concluirSessao(ctx.db, viva.id, "bia@exemplo.com", new Date(hoje.getTime() - DIA));

    await consumirLimite(ctx.db, "ip:velho", POR_HORA, new Date(hoje.getTime() - 3 * DIA));
    await consumirLimite(ctx.db, "ip:recente", POR_HORA, new Date(hoje.getTime() - HORA));

    expect(await expurgoDiario(ctx.db, hoje)).toEqual({ sessoes: 2, limites: 1 });

    expect(await buscarSessao(ctx.db, viva.id, hoje)).not.toBeNull();
    // A sessão concluída e vencida foi embora de verdade, com o link junto.
    expect(await ctx.db.select().from(cvSessions)).toHaveLength(1);
    expect(await resgatarLinkMagico(ctx.db, token, hoje)).toEqual({ ok: false, motivo: "invalido" });
    expect((await ctx.db.select().from(limitesEnvio)).map((l) => l.chave)).toEqual(["ip:recente"]);
  });

  it("não apaga contador de janela de 24h ainda aberta", async () => {
    const hoje = new Date("2026-10-05T12:00:00Z");
    await consumirLimite(ctx.db, "email:x", { janelaMs: DIA, maximo: 3 }, hoje);
    expect(await expurgarLimites(ctx.db, daquiA(0))).toBe(0);
    expect(await expurgarLimites(ctx.db, new Date(hoje.getTime() + DIA - 1))).toBe(0);
  });

  it("o prazo de 5 dias continua sendo o critério da sessão concluída", async () => {
    const hoje = new Date("2026-10-05T12:00:00Z");
    const s = await criarSessao(ctx.db, hoje);
    await concluirSessao(ctx.db, s.id, "ana@exemplo.com", hoje);

    const antes = new Date(hoje.getTime() + PRAZO_APOS_CONCLUSAO_MS - 1000);
    const depois = new Date(hoje.getTime() + PRAZO_APOS_CONCLUSAO_MS + 1000);
    expect((await expurgoDiario(ctx.db, antes)).sessoes).toBe(0);
    expect((await expurgoDiario(ctx.db, depois)).sessoes).toBe(1);
  });
});
