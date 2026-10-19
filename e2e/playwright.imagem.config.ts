import { defineConfig } from "@playwright/test";

/**
 * Fumaça contra a IMAGEM Docker do worker, já no ar (`pnpm imagem`).
 *
 * Separada da configuração do E2E porque não sobe nada: o worker é o
 * container do docker-compose, com o Tectonic de verdade, e quem o sobe é
 * quem roda isto — no CI, o job `imagem do worker`. Também não abre
 * navegador: são pedidos HTTP e a leitura do PDF devolvido.
 *
 *     docker compose up -d --build --wait latex-worker
 *     WORKER_URL=http://localhost:8080 WORKER_TOKEN=token-local-nao-use-em-producao \
 *       pnpm --filter @cv-express/e2e imagem
 */

for (const nome of ["WORKER_URL", "WORKER_TOKEN"]) {
  if (!process.env[nome]) {
    throw new Error(`${nome} não definida (ver o comentário em playwright.imagem.config.ts).`);
  }
}

export default defineConfig({
  testDir: "imagem",
  outputDir: "resultados/imagem",
  // Em ordem: o teste do cache depende da compilação anterior.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env["CI"]),
  retries: 0,
  // Uma compilação real leva segundos; o limite do worker é 10 s por PDF.
  timeout: 60_000,
  reporter: [["list"]],
});
