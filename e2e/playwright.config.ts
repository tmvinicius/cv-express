import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { defineConfig, devices } from "@playwright/test";

import {
  LOG_WEB,
  PORTA_WEB,
  PORTA_WORKER,
  RAIZ,
  TECTONIC_FALSO,
  URL_WEB,
} from "./ambiente";

/**
 * Testes de ponta a ponta: um navegador de verdade contra o app web, o worker
 * e um Postgres de verdade.
 *
 * O que sobe aqui, e o que não:
 *
 *   - o app web com o build de PRODUÇÃO (`next start`), que é o que vai ao ar
 *     — o `next dev` compila sob demanda e esconde erro de fronteira entre
 *     servidor e cliente;
 *   - o worker de verdade (fila, cache, rotas, leitura do .aux), mas com um
 *     Tectonic FALSO (`tectonic-falso.sh`), que devolve um PDF real guardado.
 *     O E2E prova o fluxo; a composição tipográfica tem verificação própria;
 *   - a IA no modo `mock` e o e-mail no modo `console`: nenhum serviço pago,
 *     e o link do e-mail é lido do log do app (`resultados/web.log`).
 *
 * Pré-requisitos: `pnpm run build && pnpm run build:apps`, e um Postgres em
 * `DATABASE_URL`. As migrações são aplicadas na subida. Os testes NÃO apagam
 * nada — criam sessões novas, que expiram como qualquer outra —, então o
 * banco do docker-compose serve.
 */

const TOKEN = "token-e2e-nao-use-em-producao";

const banco = process.env["DATABASE_URL"];
if (!banco) {
  throw new Error(
    "DATABASE_URL não definida. Ex.: DATABASE_URL=postgres://cvexpress:dev@localhost:5432/cvexpress pnpm run e2e",
  );
}

mkdirSync(dirname(LOG_WEB), { recursive: true });
// O worker executa o arquivo direto, sem shell. Quem extrai o repositório de
// um zip, ou de um sistema que não guarda a permissão, perde o +x — e o erro
// seria um EACCES a três processos de distância daqui.
chmodSync(TECTONIC_FALSO, 0o755);

export default defineConfig({
  testDir: "testes",
  outputDir: "resultados/testes",
  // Um teste por vez: alguns contam linhas no banco antes e depois, e outro
  // teste criando sessão no meio daria um número errado.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env["CI"]),
  retries: 0,
  timeout: 60_000,
  reporter: process.env["CI"]
    ? [["list"], ["html", { outputFolder: "resultados/relatorio", open: "never" }]]
    : [["list"]],
  use: {
    baseURL: URL_WEB,
    locale: "pt-BR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Para rodar com um Chromium já instalado em vez do baixado pelo
        // `playwright install` (ambientes sem acesso ao download).
        ...(process.env["E2E_CHROMIUM"]
          ? { launchOptions: { executablePath: process.env["E2E_CHROMIUM"] } }
          : {}),
      },
    },
  ],
  webServer: [
    {
      command: "node apps/latex-worker/dist/index.js",
      cwd: RAIZ,
      url: `http://127.0.0.1:${PORTA_WORKER}/saude`,
      env: {
        PORT: String(PORTA_WORKER),
        HOST: "127.0.0.1",
        WORKER_TOKEN: TOKEN,
        TECTONIC_BIN: TECTONIC_FALSO,
        LOG_LEVEL: "warn",
      },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      // As migrações são idempotentes (regra do projeto, com teste), então
      // aplicá-las a cada execução é seguro. O log vai para um arquivo e não
      // para o Playwright: os testes precisam lê-lo.
      command: `node packages/db/dist/cli/migrar.js && cd apps/web && exec node node_modules/next/dist/bin/next start -p ${PORTA_WEB} > "${LOG_WEB}" 2>&1`,
      cwd: RAIZ,
      url: `${URL_WEB}/`,
      env: {
        DATABASE_URL: banco,
        WORKER_URL: `http://127.0.0.1:${PORTA_WORKER}`,
        WORKER_TOKEN: TOKEN,
        AI_PROVIDER: "mock",
        EMAIL_PROVIDER: "console",
        APP_URL: URL_WEB,
        // Os testes repetem; o teto do dia é coberto pelos testes unitários.
        IA_TETO_DIARIO: "1000000",
        // Só por causa do e-mail: o modo console é recusado em produção (ele
        // escreve no log o link, que é a chave do currículo). O BUILD continua
        // o de produção — o NODE_ENV do código do Next foi fixado nele.
        NODE_ENV: "development",
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
