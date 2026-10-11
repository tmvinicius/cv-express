// @vitest-environment node
//
// Node, e não jsdom: a imagem é gerada pelo `next/og`, que roda WebAssembly e
// lê a fonte do disco — o mesmo ambiente do servidor em produção.
import { describe, it, expect } from "vitest";

import {
  DESCRICAO_DO_SITE,
  TITULO_DO_SITE,
  metadadosDoSite,
  urlPublica,
} from "../metadados";
import Imagem, { alt, contentType, size } from "../../app/opengraph-image";
import * as ImagemX from "../../app/twitter-image";

describe("metadados de compartilhamento", () => {
  it("a prévia tem título, descrição e cartão grande", () => {
    const m = metadadosDoSite({ APP_URL: "https://cv.exemplo.com.br" });
    expect(m.openGraph).toMatchObject({
      type: "website",
      locale: "pt_BR",
      siteName: "CV Express",
      title: TITULO_DO_SITE,
      description: DESCRICAO_DO_SITE,
    });
    expect(m.twitter).toMatchObject({ card: "summary_large_image" });
  });

  it("a base das URLs vem do APP_URL — as redes ignoram imagem com endereço relativo", () => {
    const m = metadadosDoSite({ APP_URL: "https://cv.exemplo.com.br/" });
    expect(m.metadataBase?.toString()).toBe("https://cv.exemplo.com.br/");
  });

  it("sem APP_URL válida não inventa base: o Next decide (domínio da Vercel ou localhost)", () => {
    expect(metadadosDoSite({}).metadataBase).toBeUndefined();
    for (const ruim of ["cv.exemplo.com.br", "javascript:alert(1)", "   ", "http://"]) {
      expect(urlPublica({ APP_URL: ruim }), ruim).toBeUndefined();
    }
  });

  it("o iOS não transforma número em link de ligação", () => {
    expect(metadadosDoSite({}).formatDetection).toEqual({ telephone: false });
  });
});

describe("imagem da prévia", () => {
  it("é um PNG 1200×630 — o tamanho que WhatsApp, LinkedIn e X esperam", async () => {
    expect(size).toEqual({ width: 1200, height: 630 });
    expect(contentType).toBe("image/png");
    expect(alt).toBe(TITULO_DO_SITE);

    const resposta = Imagem();
    expect(resposta.headers.get("content-type")).toBe("image/png");
    const bytes = new Uint8Array(await resposta.arrayBuffer());
    // Assinatura PNG: se o gerador falhar (fonte sem um caractere, estilo
    // que o Satori não aceita), a resposta não chega até aqui.
    expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  }, 20_000);

  it("o X recebe a mesma imagem", () => {
    expect(ImagemX.default).toBe(Imagem);
    expect(ImagemX.size).toBe(size);
  });
});
