import { readFileSync } from "node:fs";
import pg from "pg";
import type { Browser, BrowserContextOptions, Page } from "@playwright/test";

import { LOG_WEB } from "../ambiente";

/**
 * Um IP de documentação novo (RFC 5737) por contexto de navegador.
 *
 * O app limita sessões, IA e compilação por IP, e o banco de quem roda o E2E
 * pode ser o mesmo de ontem — com os contadores de ontem. Cada contexto com a
 * sua origem não esbarra em limite nenhum, rode o E2E quantas vezes for.
 * Funciona porque sem proxy na frente o `x-forwarded-for` chega como veio.
 */
export function origemNova(): string {
  const bloco = Math.random() < 0.5 ? "198.51.100" : "203.0.113";
  return `${bloco}.${1 + Math.floor(Math.random() * 254)}`;
}

export async function novoContexto(navegador: Browser, opcoes: BrowserContextOptions = {}) {
  return navegador.newContext({
    ...opcoes,
    extraHTTPHeaders: { ...opcoes.extraHTTPHeaders, "x-forwarded-for": origemNova() },
  });
}

/** Uma consulta de leitura no banco do app. */
export async function consultar<T extends pg.QueryResultRow>(
  sql: string,
  valores: unknown[] = [],
): Promise<T[]> {
  const cliente = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
  await cliente.connect();
  try {
    return (await cliente.query<T>(sql, valores)).rows;
  } finally {
    await cliente.end();
  }
}

export async function contarSessoes(): Promise<number> {
  const [linha] = await consultar<{ total: string }>("select count(*) as total from cv_sessions");
  return Number(linha?.total ?? 0);
}

/**
 * O link que o app "mandou" para este endereço, lido do log.
 *
 * Com `EMAIL_PROVIDER=console`, o e-mail inteiro vai para o log do app em vez
 * de sair — é o mesmo texto que a pessoa receberia.
 */
export function linksEnviadosPara(email: string): string[] {
  const log = readFileSync(LOG_WEB, "utf8");
  const blocos = log.split("[email:console]").slice(1);
  return blocos
    .filter((b) => b.includes(`Para: ${email}`))
    .map((b) => b.match(/https?:\/\/\S+\/retomar\/[A-Za-z0-9_-]+/)?.[0])
    .filter((l): l is string => Boolean(l));
}

/**
 * Junta tudo o que a página reclamou: erro de JavaScript e violação de CSP.
 *
 * Uma CSP errada não derruba o teste por si: o navegador só bloqueia e
 * escreve no console. Sem coletar isto, o E2E passaria com metade da página
 * sem funcionar.
 */
export function vigiarProblemas(pagina: Page): string[] {
  const problemas: string[] = [];
  pagina.on("pageerror", (e) => problemas.push(`erro: ${e.message}`));
  pagina.on("console", (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) {
      problemas.push(`CSP em ${pagina.url()}: ${m.text().slice(0, 160)}`);
    }
  });
  return problemas;
}

/** O id da sessão na URL `/cv/<id>`. */
export function idDaSessao(url: string): string {
  const id = new URL(url).pathname.split("/cv/")[1];
  if (!id) throw new Error(`não é uma URL de currículo: ${url}`);
  return id;
}
