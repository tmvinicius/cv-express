import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { esquema, aplicarMigracoes, cvSessions, type Banco } from "@cv-express/db";

import { executarExpurgo } from "../tarefas";
import { iniciarSessao } from "../sessao";

let pg: PGlite;
let db: Banco;

beforeEach(async () => {
  pg = new PGlite();
  await aplicarMigracoes((sql) => pg.exec(sql));
  db = drizzle(pg, { schema: esquema }) as unknown as Banco;
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await pg.close();
});

const DIA = 24 * 60 * 60 * 1000;
const SEGREDO = "segredo-de-teste";

describe("tarefa de expurgo", () => {
  it("com o segredo certo, apaga o que venceu", async () => {
    const hoje = new Date("2026-10-05T06:00:00Z");
    await iniciarSessao(db, new Date(hoje.getTime() - 31 * DIA));
    await iniciarSessao(db, hoje);

    const r = await executarExpurgo(async () => db, `Bearer ${SEGREDO}`, SEGREDO, hoje);

    expect(r).toEqual({ status: 200, corpo: { sessoes: 1, limites: 0 } });
    expect(await db.select().from(cvSessions)).toHaveLength(1);
  });

  it("sem o segredo, ou com outro, não apaga nada — nem abre o banco", async () => {
    // A rota é alcançável pela internet; apagar dados é a operação mais
    // destrutiva do produto.
    const abrir = vi.fn(async () => db);
    await iniciarSessao(db, new Date(Date.now() - 31 * DIA));

    for (const cabecalho of [null, "", "Bearer errado", SEGREDO, `bearer ${SEGREDO}`]) {
      const r = await executarExpurgo(abrir, cabecalho, SEGREDO);
      expect(r.status).toBe(401);
    }
    expect(abrir).not.toHaveBeenCalled();
    expect(await db.select().from(cvSessions)).toHaveLength(1);
  });

  it("sem CRON_SECRET configurado, recusa até o pedido 'certo'", async () => {
    // Uma rota destrutiva aberta por esquecimento de variável é pior do que
    // um expurgo que não roda — e o 503 aparece no log do agendador.
    const abrir = vi.fn(async () => db);

    expect((await executarExpurgo(abrir, "Bearer ", undefined)).status).toBe(503);
    expect((await executarExpurgo(abrir, "Bearer undefined", undefined)).status).toBe(503);
    expect(abrir).not.toHaveBeenCalled();
  });
});
