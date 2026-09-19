import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import type { CvData, TemplateId } from "@cv-express/schema";
import { construirViewModel } from "./viewModel.js";
import { renderizar } from "./motor/renderizar.js";
import type { TextoLatex } from "./escape.js";

/** ESM não tem __dirname. */
const AQUI = path.dirname(fileURLToPath(import.meta.url));

/**
 * Raiz dos templates.
 *
 * Em desenvolvimento este arquivo roda de `src/`; compilado, roda de `dist/`.
 * Em ambos os casos a pasta `classico/` está um nível acima, na raiz do
 * pacote — por isso o `..` único, e por isso os templates NÃO ficam dentro de
 * `src/`: eles não são compilados pelo tsc e precisam do mesmo caminho nos
 * dois cenários.
 */
const RAIZ_TEMPLATES = path.resolve(AQUI, "..");

export interface Manifesto {
  templateId: string;
  versao: string;
  descricao: string;
  schemaMinimo: string;
  arquivoMestre: string;
  classe: string;
  secoesSuportadas: string[];
}

export interface TemplateCarregado {
  manifesto: Manifesto;
  mestre: string;
  partials: Record<string, string>;
  /** Conteúdo do .cls, que o worker grava ao lado do .tex. */
  classe: string;
}

const cache = new Map<string, TemplateCarregado>();

/**
 * Carrega um template do disco, com cache em memória.
 *
 * O cache é seguro porque os arquivos são estáticos e versionados junto com o
 * código — não há recarga em tempo de execução. Em troca, o worker não vai ao
 * disco a cada compilação, o que importa quando a fila está cheia.
 */
export function carregarTemplate(templateId: TemplateId): TemplateCarregado {
  const emCache = cache.get(templateId);
  if (emCache) return emCache;

  const base = path.join(RAIZ_TEMPLATES, templateId);
  if (!fs.existsSync(base)) {
    throw new Error(`Template "${templateId}" não encontrado em ${base}`);
  }

  const manifesto = JSON.parse(
    fs.readFileSync(path.join(base, "manifest.json"), "utf8"),
  ) as Manifesto;

  const mestre = fs.readFileSync(path.join(base, manifesto.arquivoMestre), "utf8");
  const classe = fs.readFileSync(path.join(base, manifesto.classe), "utf8");

  const dirPartials = path.join(base, "partials");
  const partials: Record<string, string> = {};
  // Ordenado: a ordem de leitura do diretório varia entre sistemas de
  // arquivos, e isso tornaria mensagens de erro não reproduzíveis.
  for (const arquivo of fs.readdirSync(dirPartials).sort()) {
    if (!arquivo.endsWith(".tex.hbs")) continue;
    const nome = arquivo.replace(/\.tex\.hbs$/, "");
    partials[nome] = fs.readFileSync(path.join(dirPartials, arquivo), "utf8");
  }

  const carregado: TemplateCarregado = { manifesto, mestre, partials, classe };
  cache.set(templateId, carregado);
  return carregado;
}

export interface TexGerado {
  /** Conteúdo do .tex, pronto para o Tectonic. */
  tex: TextoLatex;
  /** Conteúdo do .cls, gravado ao lado. */
  classe: string;
  /**
   * Hash do conteúdo. Chave do cache de compilação: se não mudou, o PDF
   * anterior continua válido e o Tectonic não precisa rodar.
   */
  contentHash: string;
  templateId: string;
  templateVersao: string;
}

/**
 * Gera o .tex a partir do CvData.
 *
 * Determinístico por construção: o ViewModel ordena tudo explicitamente, o
 * motor só lê caminhos declarados, e nada aqui consulta relógio, aleatório ou
 * ambiente. Rodar duas vezes com a mesma entrada produz bytes idênticos — o
 * teste em __tests__/gerar.test.ts verifica isso, porque é do que o
 * contentHash depende.
 */
export function gerarTex(cv: CvData): TexGerado {
  const template = carregarTemplate(cv.templateId);
  const vm = construirViewModel(cv);

  const tex = renderizar(template.mestre, vm, {
    partials: template.partials,
    nomeTemplate: template.manifesto.arquivoMestre,
  });

  // O hash cobre o .tex e a identidade do template: trocar a versão do
  // template muda o PDF mesmo com os mesmos dados, e o cache precisa saber.
  const contentHash = createHash("sha256")
    .update(tex)
    .update("\u0000")
    .update(template.manifesto.templateId)
    .update("\u0000")
    .update(template.manifesto.versao)
    .digest("hex");

  return {
    tex,
    classe: template.classe,
    contentHash,
    templateId: template.manifesto.templateId,
    templateVersao: template.manifesto.versao,
  };
}

/** Só para testes: zera o cache entre casos. */
export function limparCacheDeTemplates(): void {
  cache.clear();
}
