import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";

import { idDaSessao, linksEnviadosPara, novoContexto, vigiarProblemas } from "./ajuda";

/**
 * O caminho principal, inteiro, como uma pessoa o percorre: começar,
 * preencher, pedir ajuda à IA, gerar, baixar, concluir e voltar pelo link do
 * e-mail em outro navegador.
 *
 * Um teste só, e longo, de propósito: cada passo depende do anterior, e é a
 * passagem entre eles — autosave, troca de etapa, compilação — que quebra.
 */

/** Avança uma etapa pelo botão principal da navegação. */
async function seguir(pagina: Page, proxima: string) {
  await pagina.locator(".formulario__navegacao button").last().click();
  await pagina.waitForURL(new RegExp(`etapa=${proxima}`), { timeout: 30_000 });
}

test("do começo ao link do e-mail", async ({ browser }) => {
  test.setTimeout(120_000);
  // E-mail único por execução: o app limita a 3 links por dia o mesmo
  // destinatário, e o banco do E2E pode ser reaproveitado.
  const email = `ana.${Date.now()}@exemplo.com`;

  const contexto = await novoContexto(browser, { acceptDownloads: true });
  const pagina = await contexto.newPage();
  const problemas = vigiarProblemas(pagina);

  // ── Começar ────────────────────────────────────────────────────────────
  await pagina.goto("/");
  await pagina.getByRole("button", { name: "Começar meu currículo" }).click();
  await pagina.waitForURL(/\/cv\//);
  const id = idDaSessao(pagina.url());

  // ── Dados pessoais ─────────────────────────────────────────────────────
  await pagina.getByLabel(/nome completo/i).fill("Ana Souza");
  await pagina.getByLabel(/cidade/i).first().fill("Belo Horizonte");
  await pagina.getByLabel(/e-mail/i).fill(email);
  await seguir(pagina, "objetivo");

  // ── Objetivo, e recarregar não perde nada ─────────────────────────────
  const objetivo = "Atuar com atendimento ao cliente em uma loja de varejo.";
  await pagina.getByRole("textbox").first().fill(objetivo);
  await expect(pagina.getByText("Salvo", { exact: true })).toBeVisible({ timeout: 10_000 });
  await pagina.reload();
  await expect(pagina.getByRole("textbox").first()).toHaveValue(objetivo);
  await seguir(pagina, "experiencias");

  // ── Experiência, com a ajuda da IA ─────────────────────────────────────
  const descricao = "atendia clientes no balcão e organizava o estoque da loja";
  await pagina.getByRole("button", { name: /adicionar experiência/i }).click();
  await pagina.getByLabel("Cargo").fill("Atendente");
  await pagina.getByLabel("Empresa").fill("Loja Boa");
  await pagina.getByLabel("Trabalho aqui atualmente").check();
  await pagina.getByLabel("O que você fazia lá?").fill(descricao);

  await pagina.getByRole("button", { name: /organizar com ajuda da ia/i }).click();
  await pagina.getByRole("button", { name: "Usar sugestão" }).click();
  await expect(pagina.locator(".bullets-aplicados li").first()).toBeVisible();
  // Invariante 2.4: a IA escreve nos tópicos, nunca por cima do original.
  await expect(pagina.getByLabel("O que você fazia lá?")).toHaveValue(descricao);

  await seguir(pagina, "formacao");
  await seguir(pagina, "idiomas");
  await seguir(pagina, "habilidades");
  await pagina.getByLabel("Suas habilidades").fill("atendimento, organização, Excel");

  // ── Gerando → preview ─────────────────────────────────────────────────
  await pagina.locator(".formulario__navegacao button").last().click();
  await pagina.waitForURL(/etapa=preview/, { timeout: 45_000 });
  const baixar = pagina.getByRole("link", { name: "Baixar currículo" });
  await expect(baixar).toBeVisible({ timeout: 30_000 });
  // O PDF do Tectonic falso tem 2 páginas: o aviso precisa aparecer.
  await expect(pagina.getByText(/ficou com 2 páginas/)).toBeVisible();

  const [download] = await Promise.all([pagina.waitForEvent("download"), baixar.click()]);
  expect(download.suggestedFilename()).toBe("curriculo-ana-souza.pdf");
  const bytes = readFileSync((await download.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");

  // ── Concluir e salvar ─────────────────────────────────────────────────
  await pagina.getByRole("button", { name: "Concluir e salvar" }).click();
  await expect(pagina.locator(".concluir__ok")).toContainText(email);
  expect(problemas).toEqual([]);

  // ── Outro navegador, pelo link do e-mail ──────────────────────────────
  await expect.poll(() => linksEnviadosPara(email).length).toBe(1);
  const [link] = linksEnviadosPara(email);

  const outro = await novoContexto(browser);
  const depois = await outro.newPage();
  const problemasDepois = vigiarProblemas(depois);
  await depois.goto(link!);
  await depois.waitForURL(new RegExp(`/cv/${id}`));
  await expect(depois.getByText(/Disponível para edição até/)).toBeVisible();
  // O token sai da barra de endereço depois do redirecionamento.
  expect(depois.url()).not.toContain("/retomar/");
  expect(problemasDepois).toEqual([]);

  await outro.close();
  await contexto.close();
});
