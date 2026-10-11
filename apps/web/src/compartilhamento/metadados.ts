import type { Metadata } from "next";

/**
 * O que aparece quando alguém compartilha o link do CV Express.
 *
 * Sem isto, colar o endereço no WhatsApp, no LinkedIn ou num grupo de vagas
 * mostrava só a URL crua, ou o título da aba e nada mais. Para um produto
 * que cresce de boca em boca — alguém conseguiu emprego e manda o link para
 * o amigo —, a prévia do link é a primeira tela que a maioria vê.
 *
 * A imagem é gerada em `app/opengraph-image.tsx`, com as cores da paleta.
 */

export const NOME_DO_SITE = "CV Express";
export const TITULO_DO_SITE = "CV Express — seu currículo pronto em minutos";
export const DESCRICAO_DO_SITE =
  "Preencha um formulário rápido e receba um currículo em PDF, composto com qualidade tipográfica. Sem cadastro.";

/**
 * A origem pública do app, de `APP_URL` — a mesma que monta o link do e-mail.
 *
 * As redes sociais exigem endereço ABSOLUTO na imagem da prévia; um
 * `/opengraph-image` relativo é ignorado. Sem `APP_URL` válida, devolve
 * `undefined` e o Next decide: na Vercel ele usa o domínio de produção do
 * projeto; fora dela, `localhost` com um aviso no build.
 *
 * Nunca do cabeçalho `Host`: quem faz a requisição controla esse cabeçalho,
 * e a prévia passaria a apontar para onde o atacante quisesse.
 */
export function urlPublica(env: Record<string, string | undefined> = process.env): URL | undefined {
  const bruta = env["APP_URL"]?.trim();
  if (!bruta || !/^https?:\/\//.test(bruta)) return undefined;
  try {
    return new URL(bruta);
  } catch {
    return undefined;
  }
}

/** Os metadados que toda página herda do layout raiz. */
export function metadadosDoSite(env: Record<string, string | undefined> = process.env): Metadata {
  const base = urlPublica(env);
  return {
    ...(base ? { metadataBase: base } : {}),
    title: TITULO_DO_SITE,
    description: DESCRICAO_DO_SITE,
    applicationName: NOME_DO_SITE,
    openGraph: {
      type: "website",
      locale: "pt_BR",
      siteName: NOME_DO_SITE,
      title: TITULO_DO_SITE,
      description: DESCRICAO_DO_SITE,
    },
    twitter: {
      // A imagem grande: a pequena corta o texto que está nela.
      card: "summary_large_image",
      title: TITULO_DO_SITE,
      description: DESCRICAO_DO_SITE,
    },
    // O iOS transforma qualquer sequência que pareça telefone em link. No
    // formulário isso faria o número que a pessoa está digitando no resumo
    // do currículo virar um botão de ligar.
    formatDetection: { telephone: false },
  };
}
