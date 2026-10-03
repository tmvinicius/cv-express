import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

import { concluirESalvar } from "../concluir";
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

    const r = await concluirESalvar(db, id, cv, config, agora);

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

    const r = await concluirESalvar(db, id, cv, config);

    expect(JSON.stringify(r)).not.toContain(tokenDo(enviados[0]));
  });

  it("concluir de novo com o mesmo e-mail não envia outro, e o prazo não muda", async () => {
    // A regra "o link não reseta", vista pela ação que a tela chama.
    const { id, cv } = await cvPronto();
    const { config, enviados } = caixaDeSaida();
    const hoje = new Date("2026-10-03T12:00:00Z");
    const amanha = new Date(hoje.getTime() + DIA);

    const primeira = await concluirESalvar(db, id, cv, config, hoje);
    const editado = { ...cv, objetivo: { texto: "Objetivo revisto amanhã." } };
    const segunda = await concluirESalvar(db, id, editado, config, amanha);

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

    expect(await concluirESalvar(db, id, cv, null)).toEqual({
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

    expect(await concluirESalvar(db, id, semEmail, config)).toEqual({
      ok: false,
      motivo: "dados_incompletos",
    });
    expect(enviados).toHaveLength(0);
  });

  it("falha do provedor revoga o link, e o próximo clique envia de novo", async () => {
    const { id, cv } = await cvPronto();
    const falha = caixaDeSaida({ ok: false, motivo: "recusado" });

    expect(await concluirESalvar(db, id, cv, falha.config)).toEqual({
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
    const r = await concluirESalvar(db, id, cv, ok.config);
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

    expect(await concluirESalvar(db, id, cv, config)).toEqual({
      ok: false,
      motivo: "falha_envio",
    });
  });

  it("sessão inexistente devolve resultado, não exceção", async () => {
    const { cv } = await cvPronto();
    const { config } = caixaDeSaida();

    expect(await concluirESalvar(db, "nao-existe", cv, config)).toEqual({
      ok: false,
      motivo: "sessao_ausente",
    });
  });
});
