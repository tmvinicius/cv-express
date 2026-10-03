import { describe, it, expect, vi } from "vitest";

import { configuracaoEmail, ResendEnviador, ConsoleEnviador } from "../envio";
import { montarEmailDoLink, escaparHtml } from "../mensagem";
import { formatarPrazo } from "../../formulario/prazo";

describe("prazo em horário de Brasília", () => {
  it("UTC−3 fixo, com dia da semana por extenso", () => {
    // 2026-10-08 17:30 UTC = quinta, 14:30 em Brasília.
    expect(formatarPrazo("2026-10-08T17:30:00Z")).toBe("quinta-feira, 08/10, às 14:30");
  });

  it("vira o dia corretamente perto da meia-noite", () => {
    // 02:00 UTC de sábado ainda é 23:00 de sexta em Brasília.
    expect(formatarPrazo(new Date("2026-10-10T02:00:00Z"))).toBe(
      "sexta-feira, 09/10, às 23:00",
    );
  });

  it("não depende do fuso da máquina", () => {
    // Formatado à mão justamente para servidor e navegador concordarem — uma
    // diferença aqui vira erro de hidratação.
    const antes = process.env["TZ"];
    process.env["TZ"] = "Asia/Tokyo";
    const tokyo = formatarPrazo("2026-10-08T17:30:00Z");
    process.env["TZ"] = antes;
    expect(tokyo).toBe("quinta-feira, 08/10, às 14:30");
  });
});

describe("a mensagem", () => {
  const base = {
    nome: "Ana Souza",
    link: "https://cv.exemplo.com/retomar/abc123",
    expiraEm: new Date("2026-10-08T17:30:00Z"),
  };

  it("leva o link e o prazo, no texto e no HTML", () => {
    const m = montarEmailDoLink(base);

    for (const corpo of [m.texto, m.html]) {
      expect(corpo).toContain(base.link);
      expect(corpo).toContain("quinta-feira, 08/10, às 14:30");
    }
    expect(m.texto).toContain("Olá, Ana!");
    // A regra do mantenedor, dita a quem recebe.
    expect(m.texto).toContain("editar não muda esse prazo");
  });

  it("escapa o nome no HTML — dado do usuário nunca vira marcação", () => {
    // Um `<a>` no campo "nome" viraria um link de phishing assinado pelo
    // nosso domínio. Mesma regra do LaTeX, em outra linguagem.
    const m = montarEmailDoLink({
      ...base,
      nome: '<a href="https://golpe.exemplo">Clique</a>',
    });

    expect(m.html).not.toContain('<a href="https://golpe.exemplo"');
    expect(m.html).toContain("&lt;a");
  });

  it("escaparHtml cobre os cinco caracteres perigosos", () => {
    expect(escaparHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });

  it("sem nome, a saudação não fica pela metade", () => {
    expect(montarEmailDoLink({ ...base, nome: "  " }).texto).toMatch(/^Olá!\n/);
  });
});

describe("configuração do ambiente", () => {
  const resend = {
    EMAIL_PROVIDER: "resend",
    RESEND_API_KEY: "re_x",
    EMAIL_REMETENTE: "CV Express <nao-responda@exemplo.com>",
    APP_URL: "https://cv.exemplo.com/",
  };

  it("resend completo funciona, e a barra final da URL é removida", () => {
    const c = configuracaoEmail(resend);
    expect(c?.enviador).toBeInstanceOf(ResendEnviador);
    expect(c?.urlBase).toBe("https://cv.exemplo.com");
  });

  it("falta de chave, remetente ou provider desliga o e-mail sem lançar", () => {
    expect(configuracaoEmail({ ...resend, RESEND_API_KEY: undefined })).toBeNull();
    expect(configuracaoEmail({ ...resend, EMAIL_REMETENTE: undefined })).toBeNull();
    expect(configuracaoEmail({ ...resend, EMAIL_PROVIDER: undefined })).toBeNull();
    expect(configuracaoEmail({ ...resend, EMAIL_PROVIDER: "sendgird" })).toBeNull();
  });

  it("em produção, exige APP_URL — o link nunca vem do cabeçalho Host", () => {
    expect(
      configuracaoEmail({ ...resend, APP_URL: undefined, NODE_ENV: "production" }),
    ).toBeNull();
  });

  it("o adaptador de console é recusado em produção", () => {
    // Ele escreve o link — uma chave do currículo — no log do servidor.
    expect(configuracaoEmail({ EMAIL_PROVIDER: "console" })?.enviador).toBeInstanceOf(
      ConsoleEnviador,
    );
    expect(
      configuracaoEmail({
        EMAIL_PROVIDER: "console",
        APP_URL: "https://cv.exemplo.com",
        NODE_ENV: "production",
      }),
    ).toBeNull();
  });
});

describe("ResendEnviador", () => {
  const mensagem = {
    para: "ana@exemplo.com",
    assunto: "Assunto",
    texto: "link: https://cv.exemplo.com/retomar/SEGREDO",
    html: "<p>SEGREDO</p>",
  };

  it("chama a API com a chave e o destinatário", async () => {
    const buscar = vi.fn(async () => new Response('{"id":"1"}', { status: 200 }));
    const r = await new ResendEnviador("re_x", "CV <a@b.com>", buscar).enviar(mensagem);

    expect(r).toEqual({ ok: true });
    const [url, init] = buscar.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer re_x");
    expect(JSON.parse(String(init.body)).to).toEqual(["ana@exemplo.com"]);
  });

  it("recusa do provedor vira resultado, e o link não vai para o log", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const buscar = vi.fn(async () => new Response("domain not verified", { status: 403 }));

    const r = await new ResendEnviador("re_x", "CV <a@b.com>", buscar).enviar(mensagem);

    expect(r).toEqual({ ok: false, motivo: "recusado" });
    expect(JSON.stringify(erro.mock.calls)).not.toContain("SEGREDO");
    erro.mockRestore();
  });

  it("falha de rede vira resultado, não exceção", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const buscar = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });

    expect(await new ResendEnviador("re_x", "CV <a@b.com>", buscar).enviar(mensagem)).toEqual({
      ok: false,
      motivo: "rede",
    });
    erro.mockRestore();
  });
});
