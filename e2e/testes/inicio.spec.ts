import { test, expect } from "@playwright/test";

import { contarSessoes, consultar, idDaSessao, novoContexto, vigiarProblemas } from "./ajuda";

/**
 * A porta de entrada: onde a sessão nasce, e o que toda resposta carrega.
 */

test("abrir a página inicial não grava nada — robô e prévia de link fazem GET", async ({
  request,
}) => {
  // Antes, todo GET em / criava uma linha no banco: Googlebot, a prévia do
  // WhatsApp, monitor de uptime.
  const antes = await contarSessoes();
  for (const agente of ["Googlebot/2.1", "WhatsApp/2.23", "facebookexternalhit/1.1"]) {
    const r = await request.get("/", { headers: { "user-agent": agente } });
    expect(r.status()).toBe(200);
  }
  expect(await contarSessoes()).toBe(antes);
});

test("Começar cria a sessão e abre a primeira etapa", async ({ browser }) => {
  const contexto = await novoContexto(browser);
  const pagina = await contexto.newPage();
  const problemas = vigiarProblemas(pagina);

  await pagina.goto("/");
  await pagina.getByRole("button", { name: "Começar meu currículo" }).click();
  await pagina.waitForURL(/\/cv\/[A-Za-z0-9_-]{21}/);

  const id = idDaSessao(pagina.url());
  expect(await consultar("select 1 from cv_sessions where id = $1", [id])).toHaveLength(1);
  await expect(pagina.getByLabel(/nome completo/i)).toBeVisible();
  expect(problemas).toEqual([]);
  await contexto.close();
});

test("Começar funciona sem JavaScript — o primeiro toque num celular lento não se perde", async ({
  browser,
}) => {
  const contexto = await novoContexto(browser, { javaScriptEnabled: false });
  const pagina = await contexto.newPage();
  await pagina.goto("/");
  await pagina.getByRole("button", { name: "Começar meu currículo" }).click();
  await pagina.waitForURL(/\/cv\/[A-Za-z0-9_-]{21}/);
  await contexto.close();
});

test("toda página sai com os cabeçalhos de segurança e a CSP com nonce", async ({ request }) => {
  // `/dados-apagados` e o 404 não tocam no banco: são as páginas que o Next
  // tentaria gerar no build, sem nonce, se o layout deixasse de ser dinâmico.
  for (const caminho of ["/", "/privacidade", "/dados-apagados", "/nao-existe"]) {
    const r = await request.get(caminho);
    const h = r.headers();

    expect(h["x-frame-options"], caminho).toBe("DENY");
    expect(h["x-content-type-options"], caminho).toBe("nosniff");
    expect(h["referrer-policy"], caminho).toBe("strict-origin-when-cross-origin");
    expect(h["x-powered-by"], caminho).toBeUndefined();

    // O nonce do cabeçalho é o mesmo dos <script> do HTML. Se não fosse, o
    // navegador bloquearia todos — a página apareceria e nada responderia.
    const nonce = h["content-security-policy"]?.match(/'nonce-([^']+)'/)?.[1];
    expect(nonce, caminho).toBeTruthy();
    const html = await r.text();
    const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
    expect(scripts.length, caminho).toBeGreaterThan(0);
    for (const s of scripts) expect(s, caminho).toContain(`nonce="${nonce}"`);
  }
});

test("endereço inexistente responde 404 em português", async ({ page }) => {
  const r = await page.goto("/cv/nao-existe-este-curriculo");
  expect(r?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Este currículo não está mais disponível",
  );

  const r2 = await page.goto("/qualquer-coisa");
  expect(r2?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Esta página não existe");
});
