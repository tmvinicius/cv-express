import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import {
  esquema,
  aplicarMigracoes,
  cvSessions,
  resgatarLinkMagico,
  PRAZO_APOS_CONCLUSAO_MS,
  type Banco,
} from "@cv-express/db";
import { novoCv, type CvData } from "@cv-express/schema";

import {
  concluirESalvar,
  origemDoPedido,
  LIMITE_POR_ORIGEM,
  LIMITE_POR_DESTINATARIO,
} from "../concluir";
import { iniciarSessao, carregarSessao } from "../sessao";
import type { ConfiguracaoEmail, MensagemEmail, ResultadoEnvio } from "../../email/envio";

let pg: PGlite;
let db: Banco;

beforeEach(async () => {
  pg = new PGlite();
  await aplicarMigracoes((sql) => pg.exec(sql));
  db = drizzle(pg, { schema: esquema }) as unknown as Banco;
});
afterEach(async () => {
  await pg.close();
});

const DIA = 24 * 60 * 60 * 1000;
const IP = "203.0.113.7";

/** Enviador de mentira que guarda o que "mandou". */
function caixaDeSaida(resposta: ResultadoEnvio = { ok: true }) {
  const enviados: MensagemEmail[] = [];
  const config: ConfiguracaoEmail = {
    urlBase: "https://cv.exemplo.com",
    enviador: {
      enviar: vi.fn(async (m: MensagemEmail) => {
        enviados.push(m);
        return resposta;
      }),
    },
  };
  return { config, enviados };
}

/** O token, lido do link no texto do e-mail — como a pessoa o receberia. */
function tokenDo(m: MensagemEmail | undefined): string {
  const achado = m?.texto.match(/\/retomar\/([A-Za-z0-9_-]+)/);
  if (!achado?.[1]) throw new Error("e-mail sem link");
  return achado[1];
}

async function cvPronto(): Promise<{ id: string; cv: CvData }> {
  const sessao = await iniciarSessao(db);
  return {
    id: sessao.id,
    cv: {
      ...novoCv(sessao.id),
      pessoal: { nome: "Ana Souza", cidade: "Belo Horizonte", email: "ana@exemplo.com" },
      objetivo: { texto: "Atuar com desenvolvimento backend." },
    },
  };
}

describe("concluir e salvar", () => {
  it("salva a versão da tela, envia o link e devolve o prazo", async () => {
    const { id, cv } = await cvPronto();
    const { config, enviados } = caixaDeSaida();
    const agora = new Date("2026-10-03T12:00:00Z");

    const r = await concluirESalvar(db, id, cv, config, IP, agora);

    expect(r).toEqual({
      ok: true,
      envio: "novo",
      email: "ana@exemplo.com",
      expiraEm: new Date(agora.getTime() + PRAZO_APOS_CONCLUSAO_MS).toISOString(),
    });
    expect(enviados).toHaveLength(1);
    expect(enviados[0]?.para).toBe("ana@exemplo.com");

    // O link do e-mail funciona e leva a esta sessão.
    const resgate = await resgatarLinkMagico(db, tokenDo(enviados[0]), agora);
    expect(resgate.ok && resgate.sessionId).toBe(id);

    // A versão concluída foi gravada — não depende do debounce do autosave.
    const salva = await carregarSessao(db, id, agora);
    expect(salva?.data.objetivo.texto).toBe("Atuar com desenvolvimento backend.");
  });

  it("o token nunca volta na resposta para o navegador", async () => {
    const { id, cv } = await cvPronto();
    const { config, enviados } = caixaDeSaida();

    const r = await concluirESalvar(db, id, cv, config, IP);

    expect(JSON.stringify(r)).not.toContain(tokenDo(enviados[0]));
  });

  it("concluir de novo com o mesmo e-mail não envia outro, e o prazo não muda", async () => {
    // A regra "o link não reseta", vista pela ação que a tela chama.
    const { id, cv } = await cvPronto();
    const { config, enviados } = caixaDeSaida();
    const hoje = new Date("2026-10-03T12:00:00Z");
    const amanha = new Date(hoje.getTime() + DIA);

    const primeira = await concluirESalvar(db, id, cv, config, IP, hoje);
    const editado = { ...cv, objetivo: { texto: "Objetivo revisto amanhã." } };
    const segunda = await concluirESalvar(db, id, editado, config, IP, amanha);

    expect(enviados).toHaveLength(1);
    expect(segunda.ok && segunda.envio).toBe("ja_enviado");
    expect(segunda.ok && segunda.expiraEm).toBe(primeira.ok && primeira.expiraEm);

    // A edição de amanhã foi salva, e o link de hoje continua levando a ela.
    const resgate = await resgatarLinkMagico(db, tokenDo(enviados[0]), amanha);
    expect(resgate.ok).toBe(true);
    const salva = await carregarSessao(db, id, amanha);
    expect(salva?.data.objetivo.texto).toBe("Objetivo revisto amanhã.");
  });

  it("sem e-mail configurado, não toca no banco", async () => {
    // Concluir fixaria o prazo de 5 dias de uma sessão para a qual nenhum
    // link vai sair.
    const { id, cv } = await cvPronto();

    expect(await concluirESalvar(db, id, cv, null, IP)).toEqual({
      ok: false,
      motivo: "sem_configuracao",
    });
    const [linha] = await db.select().from(cvSessions);
    expect(linha?.concluidoEm).toBeNull();
  });

  it("recusa sem e-mail válido no currículo", async () => {
    const { id, cv } = await cvPronto();
    const { config, enviados } = caixaDeSaida();
    const semEmail = { ...cv, pessoal: { ...cv.pessoal, email: "" } };

    expect(await concluirESalvar(db, id, semEmail, config, IP)).toEqual({
      ok: false,
      motivo: "dados_incompletos",
    });
    expect(enviados).toHaveLength(0);
  });

  it("falha do provedor revoga o link, e o próximo clique envia de novo", async () => {
    const { id, cv } = await cvPronto();
    const falha = caixaDeSaida({ ok: false, motivo: "recusado" });

    expect(await concluirESalvar(db, id, cv, falha.config, IP)).toEqual({
      ok: false,
      motivo: "falha_envio",
    });
    // O link que não saiu não funciona — ninguém o recebeu.
    expect(await resgatarLinkMagico(db, tokenDo(falha.enviados[0]))).toEqual({
      ok: false,
      motivo: "revogado",
    });

    // Sem a revogação, este clique responderia "já enviamos".
    const ok = caixaDeSaida();
    const r = await concluirESalvar(db, id, cv, ok.config, IP);
    expect(r.ok && r.envio).toBe("novo");
    expect(ok.enviados).toHaveLength(1);
  });

  it("um enviador que LANÇA é tratado como falha, sem derrubar a ação", async () => {
    const { id, cv } = await cvPronto();
    const config: ConfiguracaoEmail = {
      urlBase: "https://cv.exemplo.com",
      enviador: {
        enviar: async () => {
          throw new Error("bug no adaptador");
        },
      },
    };

    expect(await concluirESalvar(db, id, cv, config, IP)).toEqual({
      ok: false,
      motivo: "falha_envio",
    });
  });

  it("sessão inexistente devolve resultado, não exceção", async () => {
    const { cv } = await cvPronto();
    const { config } = caixaDeSaida();

    expect(await concluirESalvar(db, "nao-existe", cv, config, IP)).toEqual({
      ok: false,
      motivo: "sessao_ausente",
    });
  });
});

describe("limite de envio", () => {
  /** Uma sessão nova pronta para concluir, com o e-mail pedido. */
  async function outraSessao(email: string) {
    const { id, cv } = await cvPronto();
    return { id, cv: { ...cv, pessoal: { ...cv.pessoal, email } } };
  }

  it("por origem: sessões novas do mesmo IP param no limite da hora", async () => {
    // O abuso que o teto por sessão não pegava: criar sessão nova a cada
    // envio para disparar e-mail a endereços quaisquer.
    const { config, enviados } = caixaDeSaida();
    const agora = new Date("2026-10-05T10:15:00Z");

    const resultados = [];
    for (let i = 0; i <= LIMITE_POR_ORIGEM.maximo; i++) {
      const { id, cv } = await outraSessao(`alvo${i}@exemplo.com`);
      resultados.push(await concluirESalvar(db, id, cv, config, IP, agora));
    }

    expect(enviados).toHaveLength(LIMITE_POR_ORIGEM.maximo);
    expect(resultados.at(-1)).toEqual({ ok: false, motivo: "muitos_envios" });

    // Outro IP, na mesma hora, segue normal.
    const { id, cv } = await outraSessao("legitimo@exemplo.com");
    const r = await concluirESalvar(db, id, cv, config, "198.51.100.1", agora);
    expect(r.ok).toBe(true);
  });

  it("por destinatário: muitas origens mirando a MESMA caixa", async () => {
    const { config, enviados } = caixaDeSaida();
    const agora = new Date("2026-10-05T10:15:00Z");

    const resultados = [];
    for (let i = 0; i <= LIMITE_POR_DESTINATARIO.maximo; i++) {
      const { id, cv } = await outraSessao("vitima@exemplo.com");
      resultados.push(await concluirESalvar(db, id, cv, config, `198.51.100.${i}`, agora));
    }

    expect(enviados).toHaveLength(LIMITE_POR_DESTINATARIO.maximo);
    expect(resultados.at(-1)).toEqual({ ok: false, motivo: "muitos_envios" });
  });

  it("bloqueado, o currículo continua salvo e o prazo não começa", async () => {
    const { config } = caixaDeSaida();
    const agora = new Date("2026-10-05T10:15:00Z");
    for (let i = 0; i < LIMITE_POR_ORIGEM.maximo; i++) {
      const s = await outraSessao(`x${i}@exemplo.com`);
      await concluirESalvar(db, s.id, s.cv, config, IP, agora);
    }

    const { id, cv } = await outraSessao("ana@exemplo.com");
    const editado = { ...cv, objetivo: { texto: "Versão final." } };
    expect(await concluirESalvar(db, id, editado, config, IP, agora)).toEqual({
      ok: false,
      motivo: "muitos_envios",
    });

    const salva = await carregarSessao(db, id, agora);
    expect(salva?.data.objetivo.texto).toBe("Versão final.");
    expect(salva?.concluidoEm).toBeNull();
  });

  it("concluir de novo ('já enviado') não gasta cota", async () => {
    const { id, cv } = await cvPronto();
    const { config } = caixaDeSaida();
    const agora = new Date("2026-10-05T10:15:00Z");

    for (let i = 0; i < 20; i++) {
      const r = await concluirESalvar(db, id, cv, config, IP, agora);
      expect(r.ok).toBe(true);
    }
  });
});

describe("origem do pedido", () => {
  const h = (valores: Record<string, string>) => new Headers(valores);

  it("usa o primeiro endereço do x-forwarded-for", () => {
    expect(origemDoPedido(h({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  });

  it("cai para x-real-ip", () => {
    expect(origemDoPedido(h({ "x-real-ip": "203.0.113.8" }))).toBe("203.0.113.8");
  });

  it("sem cabeçalho, todos dividem a mesma origem — o limite aperta, não some", () => {
    expect(origemDoPedido(h({}))).toBe("desconhecida");
    expect(origemDoPedido(h({ "x-forwarded-for": " " }))).toBe("desconhecida");
  });
});

describe("o link do e-mail aponta para uma rota que existe", () => {
  /**
   * O defeito que isto impede aconteceu de verdade: a página foi parar em
   * `app/cv/retomar/[token]/`, a rota virou `/cv/retomar/<token>`, e o
   * e-mail continuava mandando `/retomar/<token>` — todo link enviado dava
   * 404, com a suíte verde. O caminho do link e o do arquivo andam juntos.
   */
  it("o link usa /retomar/ e a página mora em app/retomar/[token]", async () => {
    const { id, cv } = await cvPronto();
    const { config, enviados } = caixaDeSaida();
    await concluirESalvar(db, id, cv, config, IP);

    const caminho = new URL(enviados[0]!.texto.match(/https?:\/\/\S+/)![0]).pathname;
    expect(caminho).toMatch(/^\/retomar\/[A-Za-z0-9_-]{43}$/);

    const pagina = join(__dirname, "..", "..", "app", "retomar", "[token]", "page.tsx");
    expect(existsSync(pagina)).toBe(true);
  });
});
