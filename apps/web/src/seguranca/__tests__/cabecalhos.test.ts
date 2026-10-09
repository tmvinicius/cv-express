// @vitest-environment node
//
// Node, e não jsdom: o middleware usa `Request`/`Headers` do runtime, e o
// jsdom não traz os seus.
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";

import { CABECALHOS_FIXOS, gerarNonce, politicaDeConteudo } from "../cabecalhos";
import { middleware } from "../../middleware";
import configuracaoNext from "../../../next.config";

/** As fontes de uma diretiva, já separadas. */
function diretiva(politica: string, nome: string): string[] {
  const achada = politica
    .split(";")
    .map((d) => d.trim().split(/\s+/))
    .find(([n]) => n === nome);
  if (!achada) throw new Error(`diretiva ausente: ${nome}`);
  return achada.slice(1);
}

describe("Content-Security-Policy", () => {
  const producao = politicaDeConteudo("abc123");

  it("só roda script com o nonce desta resposta — nunca inline solto", () => {
    // `unsafe-inline` faria um <script> injetado no HTML rodar; a CSP
    // inteira existe para impedir exatamente isso.
    const scripts = diretiva(producao, "script-src");
    expect(scripts).toContain("'nonce-abc123'");
    expect(scripts).toContain("'strict-dynamic'");
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");
  });

  it("libera atributo style, mas não elemento <style>", () => {
    // A barra de progresso desenha a largura num atributo; um <style>
    // injetado é o vetor de exfiltração por CSS.
    expect(diretiva(producao, "style-src")).not.toContain("'unsafe-inline'");
    expect(diretiva(producao, "style-src-attr")).toEqual(["'unsafe-inline'"]);
  });

  it("deixa o preview do PDF abrir: iframe com URL blob:", () => {
    // Medido no Chromium: sem `blob:` aqui, o iframe é recusado e o preview
    // fica vazio.
    expect(diretiva(producao, "frame-src")).toContain("blob:");
  });

  it("não pode ser emoldurado por outro site, nem carregar plugin", () => {
    expect(diretiva(producao, "frame-ancestors")).toEqual(["'none'"]);
    expect(diretiva(producao, "object-src")).toEqual(["'none'"]);
    expect(diretiva(producao, "base-uri")).toEqual(["'self'"]);
    expect(diretiva(producao, "form-action")).toEqual(["'self'"]);
  });

  it("eval, WebSocket e <style> só em desenvolvimento", () => {
    // O `next dev` injeta o CSS em <style>; sem isto, a página de quem
    // desenvolve sai sem estilo (medido).
    const dev = politicaDeConteudo("abc123", { desenvolvimento: true });
    expect(diretiva(dev, "script-src")).toContain("'unsafe-eval'");
    expect(diretiva(dev, "connect-src")).toContain("ws:");
    expect(diretiva(dev, "style-src")).toContain("'unsafe-inline'");
    // Com nonce junto, o navegador ignoraria o `unsafe-inline`.
    expect(diretiva(dev, "style-src").some((f) => f.startsWith("'nonce-"))).toBe(false);
    expect(diretiva(producao, "connect-src")).toEqual(["'self'"]);
  });
});

describe("nonce", () => {
  it("é novo a cada chamada e tem 128 bits em base64", () => {
    const nonces = new Set(Array.from({ length: 200 }, gerarNonce));
    expect(nonces.size).toBe(200);
    for (const n of nonces) expect(n).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});

describe("middleware", () => {
  const pedido = () => new NextRequest("http://localhost/cv/abc");

  it("manda a mesma política ao navegador e ao renderizador do Next", () => {
    // Na resposta, o navegador aplica. Na requisição, o Next lê o nonce para
    // carimbar os próprios scripts — é o contrato documentado dele. Nonces
    // diferentes nos dois lados bloqueariam todos os scripts da página.
    const r = middleware(pedido());
    const naResposta = r.headers.get("content-security-policy");
    const paraORenderizador = r.headers.get("x-middleware-request-content-security-policy");

    expect(naResposta).toMatch(/'nonce-[^']+'/);
    expect(paraORenderizador).toBe(naResposta);
  });

  it("gera um nonce por requisição — nonce fixo é senha publicada", () => {
    const nonce = (r: Response) =>
      r.headers.get("content-security-policy")?.match(/'nonce-([^']+)'/)?.[1];
    expect(nonce(middleware(pedido()))).not.toBe(nonce(middleware(pedido())));
  });
});

describe("cabeçalhos fixos", () => {
  const valor = (nome: string) => CABECALHOS_FIXOS.find((c) => c.key === nome)?.value;

  it("trazem o mínimo para um site que recebe dados pessoais", () => {
    expect(valor("X-Frame-Options")).toBe("DENY");
    expect(valor("X-Content-Type-Options")).toBe("nosniff");
    expect(valor("Permissions-Policy")).toMatch(/camera=\(\)/);
    expect(valor("Strict-Transport-Security")).toMatch(/^max-age=\d+/);
  });

  it("Referrer-Policy NÃO é no-referrer", () => {
    // Com no-referrer o navegador manda `Origin: null` no POST do botão
    // "Começar" sem JavaScript, e o Next responde 500 (medido no Chromium).
    // O caminho do currículo continua protegido: para outro site, só a
    // origem sai.
    expect(valor("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("valem para toda rota, e o Next não se anuncia", async () => {
    expect(configuracaoNext.poweredByHeader).toBe(false);
    const regras = await configuracaoNext.headers!();
    expect(regras).toEqual([{ source: "/:path*", headers: [...CABECALHOS_FIXOS] }]);
  });
});
