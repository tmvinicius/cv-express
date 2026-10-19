import { test, expect } from "@playwright/test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { compilarRespostaSchema, type CompilarResposta, type CvData } from "@cv-express/schema";
import { cvCompleto, cvExtremo } from "@cv-express/templates/fixtures";

/**
 * Fumaça contra a IMAGEM do worker no ar — Tectonic de verdade, cache
 * embutido, sandbox do docker-compose.
 *
 * Tudo o que o `pnpm test` e o E2E cobrem roda com o Tectonic de fora da
 * imagem ou com um falso. A imagem em si — o binário conferido por SHA-256, o
 * cache montado no build, o `--only-cached` sem rede, o usuário sem
 * privilégio, o disco só de leitura — só se prova compilando dentro dela.
 * Como subir e rodar: `playwright.imagem.config.ts`.
 */

const base = process.env["WORKER_URL"]!.replace(/\/$/, "");
const TOKEN = process.env["WORKER_TOKEN"]!;

async function compilar(cv: CvData, token: string | null = TOKEN) {
  return fetch(`${base}/compilar`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { "x-worker-token": token } : {}),
    },
    body: JSON.stringify({ cv }),
  });
}

async function compilarComSucesso(cv: CvData): Promise<CompilarResposta> {
  const r = await compilar(cv);
  const corpo: unknown = await r.json();
  // O corpo do erro diz o código e o requestId: é com ele que se acha o log
  // do LaTeX no `docker logs`, já que o cliente nunca recebe o log.
  expect(r.status, JSON.stringify(corpo)).toBe(200);
  return compilarRespostaSchema.parse(corpo);
}

/**
 * O texto do PDF, do jeito que um leitor de tela ou um sistema de triagem
 * de currículos o extrairia. Normaliza o que o LaTeX muda de propósito: o
 * apóstrofo reto vira tipográfico (`d'Ávila` sai `d’Ávila`) e a quebra de
 * linha vira espaço.
 */
async function textoDoPdf(pdfBase64: string) {
  const doc = await getDocument({ data: new Uint8Array(Buffer.from(pdfBase64, "base64")) })
    .promise;
  const partes: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const conteudo = await (await doc.getPage(n)).getTextContent();
    for (const item of conteudo.items) if ("str" in item) partes.push(item.str);
  }
  const texto = partes
    .join(" ")
    .normalize("NFC")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ");
  return { texto, paginas: doc.numPages };
}

test.describe("imagem do worker", () => {
  test("responde no /saude sem token", async () => {
    const r = await fetch(`${base}/saude`);
    expect(r.status).toBe(200);
  });

  test("recusa /compilar sem token — a imagem sobe em produção, onde o token é obrigatório", async () => {
    const r = await compilar(cvCompleto(), null);
    expect(r.status).toBe(401);
  });

  test.describe("o currículo completo", () => {
    const cv = cvCompleto();
    let resposta: CompilarResposta;
    let texto: string;
    let paginas: number;

    test.beforeAll(async () => {
      resposta = await compilarComSucesso(cv);
      ({ texto, paginas } = await textoDoPdf(resposta.pdf));
    });

    test("sai como PDF, com a contagem de páginas batendo com o arquivo", () => {
      expect(Buffer.from(resposta.pdf, "base64").subarray(0, 5).toString()).toBe("%PDF-");
      expect(resposta.pageCount).toBe(paginas);
    });

    test("imprime os acentos e os caracteres que o LaTeX reserva", () => {
      // Acentuação é o que template importado costuma quebrar (planejamento
      // §3.7), e `& % $` são os caracteres que o escape precisa transformar
      // em texto. Cada um aqui chegou ao PDF como o que a pessoa digitou.
      expect(texto).toContain(cv.pessoal.nome); // João Conceição d'Ávila
      expect(texto).toContain(cv.experiencias[0]!.empresa); // Acme & Cia
      expect(texto).toContain("100%");
      expect(texto).toContain("R$ 50 mil");
    });

    test("devolve as âncoras do .aux, com o nome na margem esquerda da página 1", () => {
      // Sem âncoras, o preview cai para o painel de seções sem avisar
      // ninguém (aux.ts). A margem é a da classe: 1,8 cm = 51 bp.
      const nome = resposta.posicoes.find((p) => p.fieldId === "pessoal.nome");
      expect(nome, "pessoal.nome ausente do mapa de posições").toBeDefined();
      expect(nome!.pagina).toBe(1);
      expect(nome!.x).toBeGreaterThan(50);
      expect(nome!.x).toBeLessThan(52);
    });

    test("serve a segunda compilação igual do cache", async () => {
      const deNovo = await compilarComSucesso(cv);
      expect(deNovo.doCache).toBe(true);
      expect(deNovo.contentHash).toBe(resposta.contentHash);
    });
  });

  test("compila o currículo hostil como texto: nada de \\input, nada de \\write18", async () => {
    // As mesmas cargas da suíte de ataques, agora num Tectonic de verdade:
    // um escape que falhasse aqui leria um arquivo do container ou
    // derrubaria a compilação. O caminho impresso como TEXTO é a prova de que
    // o `\input` não rodou — rodando, sairia o conteúdo do arquivo ou um erro.
    // Os trechos evitam contrabarra e chaves de propósito: o que se mede é a
    // segurança, não como o PDF.js extrai cada glifo.
    const resposta = await compilarComSucesso(cvExtremo());
    const { texto } = await textoDoPdf(resposta.pdf);
    expect(texto).toContain("/etc/passwd");
    expect(texto).toContain("write18");
    expect(texto).toContain("rm -rf /");
    expect(texto).not.toContain("root:");
  });
});
