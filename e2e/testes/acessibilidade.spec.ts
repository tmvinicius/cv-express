import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

import { novoContexto } from "./ajuda";

/**
 * Acessibilidade das telas principais, medida pelo axe-core.
 *
 * Existe porque a suíte de contraste mede as cores DECLARADAS da paleta, e um
 * `opacity: 0.55` no rótulo da trilha deixou o texto com 2,48:1 (o AA pede
 * 4,5:1) sem que ela percebesse. O axe mede o que o navegador desenha.
 *
 * Regras: WCAG 2.1 A e AA, mais as boas práticas do axe (é onde mora "a
 * página tem <h1>"). O axe não substitui teste com leitor de tela de verdade
 * — pega o que é mecânico (contraste, rótulo, título, estrutura) e é isso que
 * não pode regredir em silêncio.
 */

async function auditar(pagina: Page, tela: string) {
  // O título da aba precisa estar lá antes de medir: logo depois de uma
  // navegação no cliente, há um instante em que ele ainda não foi trocado.
  await expect(pagina).toHaveTitle(/CV Express/);
  const { violations } = await new AxeBuilder({ page: pagina })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
    .analyze();
  const resumo = violations.map(
    (v) => `${v.id} (${v.impact}): ${v.nodes.length}× — ${v.nodes[0]?.target.join(" ")}`,
  );
  expect(resumo, `violações em "${tela}"`).toEqual([]);
}

test("as telas principais não têm violação do axe (WCAG 2.1 AA)", async ({ browser }) => {
  test.setTimeout(120_000);
  const contexto = await novoContexto(browser);
  const pagina = await contexto.newPage();

  await pagina.goto("/");
  await auditar(pagina, "início");

  await pagina.getByRole("button", { name: "Começar meu currículo" }).click();
  await pagina.waitForURL(/\/cv\//);
  await auditar(pagina, "dados pessoais");

  // Avançar vazio mostra os erros de validação — é a tela mais densa de
  // mensagens, e onde contraste e associação a campo mais importam.
  await pagina.getByRole("button", { name: /^continuar$/i }).click();
  await expect(pagina.locator(".formulario__erros")).toBeVisible();
  await auditar(pagina, "dados pessoais com erros");

  await pagina.getByLabel(/nome completo/i).fill("Ana Souza");
  await pagina.getByLabel(/cidade/i).first().fill("Salvador");
  await pagina.getByLabel(/e-mail/i).fill(`ana.a11y.${Date.now()}@exemplo.com`);
  await pagina.getByRole("button", { name: /^continuar$/i }).click();
  await pagina.waitForURL(/etapa=objetivo/);
  await auditar(pagina, "objetivo");

  await pagina.getByRole("textbox").first().fill("Atendimento ao cliente.");
  await pagina.locator(".formulario__navegacao button").last().click();
  await pagina.waitForURL(/etapa=experiencias/);
  await pagina.getByRole("button", { name: /adicionar experiência/i }).click();
  await pagina.getByLabel("Cargo").fill("Atendente");
  await pagina.getByLabel("Empresa").fill("Loja Boa");
  await pagina.getByLabel("Trabalho aqui atualmente").check();
  await pagina.getByLabel("O que você fazia lá?").fill("atendia clientes no balcão");
  await pagina.getByRole("button", { name: /organizar com ajuda da ia/i }).click();
  await expect(pagina.getByRole("button", { name: "Usar sugestão" })).toBeVisible();
  await auditar(pagina, "experiência com sugestão da IA");

  await pagina.getByRole("button", { name: "Usar sugestão" }).click();
  for (const etapa of ["formacao", "idiomas", "habilidades"]) {
    await pagina.locator(".formulario__navegacao button").last().click();
    await pagina.waitForURL(new RegExp(`etapa=${etapa}`));
  }
  await auditar(pagina, "habilidades");

  await pagina.locator(".formulario__navegacao button").last().click();
  await pagina.waitForURL(/etapa=preview/, { timeout: 45_000 });
  await expect(pagina.getByRole("img", { name: /Página 1 de/ })).toBeVisible({ timeout: 30_000 });
  await auditar(pagina, "preview");

  await pagina.goto("/privacidade");
  await auditar(pagina, "privacidade");

  await pagina.goto("/nao-existe");
  await auditar(pagina, "404");

  await contexto.close();
});

test("a troca de etapa é anunciada, leva o foco ao título e abre do topo", async ({ browser }) => {
  // O axe olha cada tela parada; isto olha a passagem de uma para outra.
  // Medido antes da correção, nesta mesma tela de celular: depois de
  // "Continuar", o título da aba não mudava, o anunciador do Next não dizia
  // nada, o foco ficava no botão e a etapa nova abria rolada para baixo.
  const contexto = await novoContexto(browser, { viewport: { width: 390, height: 700 } });
  const pagina = await contexto.newPage();

  await pagina.goto("/");
  await pagina.getByRole("button", { name: "Começar meu currículo" }).click();
  await pagina.waitForURL(/\/cv\//);
  await expect(pagina).toHaveTitle("Seus dados (etapa 1 de 6) — CV Express");

  await pagina.getByLabel(/nome completo/i).fill("Ana Souza");
  await pagina.getByLabel(/cidade/i).first().fill("Salvador");
  await pagina.getByLabel(/e-mail/i).fill(`ana.etapa.${Date.now()}@exemplo.com`);
  // Do fim da tela, como quem acabou de preencher no celular.
  await pagina.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await pagina.getByRole("button", { name: /^continuar$/i }).click();
  await pagina.waitForURL(/etapa=objetivo/);

  const titulo = pagina.getByRole("heading", { level: 1 });
  await expect(pagina).toHaveTitle("Objetivo (etapa 2 de 6) — CV Express");
  // O anunciador do Next (uma região aria-live) lê o título novo.
  await expect(pagina.locator("next-route-announcer [aria-live]")).toHaveText(
    "Objetivo (etapa 2 de 6) — CV Express",
  );
  await expect(titulo).toHaveText("Etapa 2 de 6: Objetivo");
  await expect(titulo).toBeFocused();
  await expect(titulo).toBeInViewport();

  // E o Tab seguinte cai no começo da etapa, não no fim dela.
  await pagina.keyboard.press("Tab");
  const focado = await pagina.evaluate(() => document.activeElement?.getBoundingClientRect().top ?? -1);
  expect(focado).toBeGreaterThanOrEqual(0);
  expect(focado).toBeLessThan(700);

  await contexto.close();
});
