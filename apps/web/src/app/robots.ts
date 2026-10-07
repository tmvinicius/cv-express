import type { MetadataRoute } from "next";

/**
 * O que os buscadores podem visitar: a página inicial e a de privacidade.
 *
 * É um pedido, não uma trava — robô mal-educado ignora. A proteção de
 * verdade é que nenhum GET cria sessão (`app/page.tsx`), e que as páginas de
 * currículo e do link levam `noindex` na própria resposta.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/cv/", "/retomar/", "/api/"] },
  };
}
