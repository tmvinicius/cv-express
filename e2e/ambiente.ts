import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * O que a configuração do Playwright e os testes precisam combinar.
 *
 * Portas fora das do `pnpm dev` (3000) e do compose (8080): dá para rodar o
 * E2E com o ambiente de desenvolvimento no ar.
 */
const AQUI = dirname(fileURLToPath(import.meta.url));

export const RAIZ = join(AQUI, "..");
export const PORTA_WEB = 3100;
export const PORTA_WORKER = 8100;
export const URL_WEB = `http://127.0.0.1:${PORTA_WEB}`;

/** Onde o app escreve o log — é dali que os testes leem o link do e-mail. */
export const LOG_WEB = join(AQUI, "resultados", "web.log");
export const TECTONIC_FALSO = join(AQUI, "tectonic-falso.sh");
