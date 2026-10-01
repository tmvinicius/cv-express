import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const criarConexao = vi.fn(async (_url: string) => ({ falso: true }));
vi.mock("@cv-express/db", () => ({ criarConexao }));

const { obterBanco } = await import("../banco");

const CHAVE = Symbol.for("cv-express.banco");
const URL_ORIGINAL = process.env["DATABASE_URL"];

beforeEach(() => {
  delete (globalThis as Record<symbol, unknown>)[CHAVE];
  criarConexao.mockClear();
  process.env["DATABASE_URL"] = "postgres://u:s@localhost:5432/cv";
});

afterEach(() => {
  if (URL_ORIGINAL === undefined) delete process.env["DATABASE_URL"];
  else process.env["DATABASE_URL"] = URL_ORIGINAL;
});

describe("um pool por processo", () => {
  /**
   * O defeito que isto impede: cada página chamava `criarConexao` por
   * requisição. Toda troca de etapa abria um pool novo, e o Postgres
   * esgotava o limite de conexões com poucas dezenas de pessoas ao mesmo
   * tempo — o autosave era o primeiro a falhar.
   */
  it("requisições seguidas reaproveitam a mesma conexão", async () => {
    const a = await obterBanco();
    const b = await obterBanco();
    const c = await obterBanco();

    expect(criarConexao).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("requisições SIMULTÂNEAS também — sem corrida na primeira chamada", async () => {
    // O singleton antigo guardava o resultado depois do await: duas
    // chamadas no processo recém-subido viam null e criavam dois pools.
    const todas = await Promise.all([obterBanco(), obterBanco(), obterBanco()]);

    expect(criarConexao).toHaveBeenCalledTimes(1);
    expect(new Set(todas).size).toBe(1);
  });

  it("uma falha de conexão não fica guardada para sempre", async () => {
    criarConexao.mockRejectedValueOnce(new Error("banco fora do ar"));

    await expect(obterBanco()).rejects.toThrow(/fora do ar/);
    // A próxima requisição tenta de novo, em vez de o processo inteiro ficar
    // preso a uma falha que já passou.
    await expect(obterBanco()).resolves.toBeDefined();
    expect(criarConexao).toHaveBeenCalledTimes(2);
  });

  it("sem DATABASE_URL falha de forma legível", async () => {
    delete process.env["DATABASE_URL"];
    await expect(obterBanco()).rejects.toThrow(/DATABASE_URL/);
    expect(criarConexao).not.toHaveBeenCalled();
  });
});
