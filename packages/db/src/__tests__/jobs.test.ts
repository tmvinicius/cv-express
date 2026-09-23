import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { abrirBancoDeTeste, type BancoDeTeste } from "./ajuda.js";
import { criarSessao } from "../sessoes.js";
import {
  registrarJob,
  concluirJob,
  falharJob,
  buscarJobConcluido,
} from "../jobs.js";
import { compileJobs } from "../esquema.js";

let ctx: BancoDeTeste;

beforeEach(async () => {
  ctx = await abrirBancoDeTeste();
});
afterEach(async () => {
  await ctx.fechar();
});

const JOB = {
  contentHash: "a".repeat(64),
  templateId: "classico",
  templateVersao: "1.0.0",
};

describe("ciclo de vida do job", () => {
  it("nasce pendente e vira concluído", async () => {
    const sessao = await criarSessao(ctx.db);
    const id = await registrarJob(ctx.db, { sessionId: sessao.id, ...JOB });

    await concluirJob(ctx.db, id, {
      pdfUrl: "https://exemplo.com/cv.pdf",
      pageCount: 1,
    });

    const [linha] = await ctx.db.select().from(compileJobs);
    expect(linha?.status).toBe("concluido");
    expect(linha?.pageCount).toBe(1);
  });

  it("registra a falha com a mensagem traduzida", async () => {
    const sessao = await criarSessao(ctx.db);
    const id = await registrarJob(ctx.db, { sessionId: sessao.id, ...JOB });

    await falharJob(ctx.db, id, "Não conseguimos montar o PDF do seu currículo.");

    const [linha] = await ctx.db.select().from(compileJobs);
    expect(linha?.status).toBe("falhou");

    // Mensagem para o usuário, nunca o log do LaTeX: ele carrega caminhos
    // absolutos do servidor e vazaria em qualquer dump do banco.
    expect(linha?.erro).not.toContain("/srv");
    expect(linha?.erro).not.toContain(".tex");
  });

  it("o banco recusa status fora do conjunto", async () => {
    // O CHECK constraint da migração é real — este teste só passa porque o
    // PGlite é Postgres de verdade.
    const sessao = await criarSessao(ctx.db);

    await expect(
      ctx.db.insert(compileJobs).values({
        id: "x",
        sessionId: sessao.id,
        status: "inventado" as never,
        ...JOB,
      }),
    ).rejects.toThrow();
  });
});

describe("cache de compilação", () => {
  it("encontra o job concluído do mesmo conteúdo", async () => {
    const sessao = await criarSessao(ctx.db);
    const id = await registrarJob(ctx.db, { sessionId: sessao.id, ...JOB });
    await concluirJob(ctx.db, id, { pdfUrl: "url", pageCount: 2 });

    const achado = await buscarJobConcluido(ctx.db, sessao.id, JOB.contentHash);
    expect(achado?.pageCount).toBe(2);
  });

  it("ignora job que ainda não concluiu", async () => {
    const sessao = await criarSessao(ctx.db);
    await registrarJob(ctx.db, { sessionId: sessao.id, ...JOB });

    expect(await buscarJobConcluido(ctx.db, sessao.id, JOB.contentHash)).toBeNull();
  });

  /**
   * O teste que justifica incluir o sessionId na busca.
   *
   * Só o contentHash bastaria para acertar o cache — e faria o PDF de uma
   * pessoa ser servido para outra que por acaso preencheu o currículo igual.
   * Improvável, e catastrófico se acontecer.
   */
  it("não serve o PDF de uma sessão para outra", async () => {
    const ana = await criarSessao(ctx.db);
    const bruno = await criarSessao(ctx.db);

    const id = await registrarJob(ctx.db, { sessionId: ana.id, ...JOB });
    await concluirJob(ctx.db, id, { pdfUrl: "pdf-da-ana", pageCount: 1 });

    expect(await buscarJobConcluido(ctx.db, ana.id, JOB.contentHash)).not.toBeNull();
    expect(await buscarJobConcluido(ctx.db, bruno.id, JOB.contentHash)).toBeNull();
  });

  it("devolve o mais recente quando há vários", async () => {
    const sessao = await criarSessao(ctx.db);

    const antigo = await registrarJob(
      ctx.db,
      { sessionId: sessao.id, ...JOB },
      new Date("2026-01-01T10:00:00Z"),
    );
    await concluirJob(ctx.db, antigo, { pdfUrl: "antigo", pageCount: 1 });

    const recente = await registrarJob(
      ctx.db,
      { sessionId: sessao.id, ...JOB },
      new Date("2026-02-01T10:00:00Z"),
    );
    await concluirJob(ctx.db, recente, { pdfUrl: "recente", pageCount: 3 });

    const achado = await buscarJobConcluido(ctx.db, sessao.id, JOB.contentHash);
    expect(achado?.pdfUrl).toBe("recente");
  });
});
