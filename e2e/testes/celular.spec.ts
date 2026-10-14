import { test, expect, devices } from "@playwright/test";

import { novoContexto, tintaDasPaginas, vigiarProblemas } from "./ajuda";

/**
 * O preview no celular.
 *
 * O preview era um <iframe> com o PDF, e o celular — onde está boa parte do
 * público — não mostrava nada: o Chrome do Android não tem leitor de PDF
 * dentro da página, e o Safari do iPhone mostra só a primeira. Agora as
 * páginas são desenhadas pelo PDF.js.
 *
 * Limite do que isto prova: a emulação do Playwright é um Chromium com tela,
 * densidade e toque de um Pixel 7, mas COM leitor de PDF. O teste garante que
 * o preview não depende dele (nenhum <iframe>) e que as páginas saem
 * desenhadas, nítidas e sem rolagem lateral nessa tela. Um aparelho de
 * verdade continua sendo a última palavra.
 */
test("no celular, o preview mostra todas as páginas desenhadas", async ({ browser }) => {
  test.setTimeout(90_000);
  const contexto = await novoContexto(browser, { ...devices["Pixel 7"] });
  const pagina = await contexto.newPage();
  const problemas = vigiarProblemas(pagina);

  await pagina.goto("/");
  await pagina.getByRole("button", { name: "Começar meu currículo" }).click();
  await pagina.waitForURL(/\/cv\//);
  await pagina.getByLabel(/nome completo/i).fill("Ana Souza");
  await pagina.getByLabel(/cidade/i).first().fill("Recife");
  await pagina.getByLabel(/e-mail/i).fill(`ana.celular.${Date.now()}@exemplo.com`);
  await pagina.getByRole("button", { name: /^continuar$/i }).click();
  await pagina.waitForURL(/etapa=objetivo/);
  await pagina.getByRole("textbox").first().fill("Atendimento ao cliente.");
  for (const etapa of ["experiencias", "formacao", "idiomas", "habilidades", "preview"]) {
    await pagina.locator(".formulario__navegacao button").last().click();
    await pagina.waitForURL(new RegExp(`etapa=(${etapa}|gerando)`), { timeout: 45_000 });
  }
  await pagina.waitForURL(/etapa=preview/, { timeout: 45_000 });

  const paginas = pagina.getByRole("img", { name: /Página \d de 2 do seu currículo/ });
  await expect(paginas).toHaveCount(2, { timeout: 30_000 });
  expect(await pagina.locator("iframe").count()).toBe(0);
  for (const tinta of await tintaDasPaginas(pagina)) expect(tinta).toBeGreaterThan(0.005);

  // Nítido: o canvas tem mais pixels que a largura que ocupa na tela (a
  // densidade do Pixel 7 é 2,625). Esticado, o texto sairia borrado.
  const [larguraReal, larguraNaTela] = await pagina
    .locator(".preview__pagina")
    .first()
    .evaluate((c: HTMLCanvasElement) => [c.width, c.getBoundingClientRect().width]);
  expect(larguraReal!).toBeGreaterThan(larguraNaTela! * 2);

  expect(await pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  expect(problemas).toEqual([]);
  await contexto.close();
});
