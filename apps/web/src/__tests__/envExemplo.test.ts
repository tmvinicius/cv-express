// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * O `.env.example` e o código não podem divergir.
 *
 * O arquivo chegou a ser entregue e nunca entrou no repositório — o README
 * apontava para ele, e quem clonava o projeto descobria as variáveis lendo o
 * código. Agora ele existe, e este teste garante que continue completo: toda
 * variável que o app lê está nele, e nada nele está sobrando.
 */

const WEB = join(__dirname, "..", "..");
const RAIZ = join(WEB, "..", "..");

/** Onde o app web lê ambiente: o próprio código e os pacotes que ele usa. */
const ORIGENS = [
  join(WEB, "src"),
  join(WEB, "next.config.ts"),
  join(RAIZ, "packages", "ai", "src"),
  join(RAIZ, "packages", "db", "src"),
];

/** Lidas, mas não são configuração de quem implanta. */
const FORA_DO_EXEMPLO = new Set([
  "NODE_ENV", // definida pelo próprio Next
]);

function arquivos(caminho: string): string[] {
  if (statSync(caminho).isFile()) return [caminho];
  return readdirSync(caminho).flatMap((nome) => {
    if (nome === "__tests__" || nome === "node_modules") return [];
    return arquivos(join(caminho, nome));
  });
}

function variaveisLidasPeloCodigo(): Set<string> {
  const nomes = new Set<string>();
  for (const arquivo of ORIGENS.flatMap(arquivos)) {
    if (!/\.(ts|tsx)$/.test(arquivo)) continue;
    const fonte = readFileSync(arquivo, "utf8");
    for (const m of fonte.matchAll(/env\[["']([A-Z][A-Z0-9_]*)["']\]|process\.env\.([A-Z][A-Z0-9_]*)/g)) {
      const nome = m[1] ?? m[2]!;
      if (!FORA_DO_EXEMPLO.has(nome)) nomes.add(nome);
    }
  }
  return nomes;
}

const exemplo = readFileSync(join(WEB, ".env.example"), "utf8");

describe(".env.example", () => {
  it("lista toda variável que o app lê", () => {
    const faltando = [...variaveisLidasPeloCodigo()].filter(
      (nome) => !new RegExp(`\\b${nome}\\b`).test(exemplo),
    );
    expect(faltando).toEqual([]);
  });

  it("não lista variável que ninguém lê", () => {
    // Uma linha sobrando faz alguém configurar o que não existe — e
    // procurar o defeito no lugar errado quando "não funcionou".
    const lidas = variaveisLidasPeloCodigo();
    const definidas = [...exemplo.matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]!);
    expect(definidas.filter((nome) => !lidas.has(nome))).toEqual([]);
  });

  it("acha as variáveis de verdade — a varredura não está vazia", () => {
    // Sem isto, uma mudança no padrão de leitura (ou no caminho das origens)
    // faria os dois testes acima passarem sem olhar nada.
    const lidas = variaveisLidasPeloCodigo();
    for (const nome of ["DATABASE_URL", "WORKER_TOKEN", "AI_PROVIDER", "IA_TETO_DIARIO", "APP_URL"]) {
      expect(lidas.has(nome), nome).toBe(true);
    }
  });
});
