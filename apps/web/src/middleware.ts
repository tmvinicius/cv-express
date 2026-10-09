import { NextResponse, type NextRequest } from "next/server";

import { gerarNonce, politicaDeConteudo } from "./seguranca/cabecalhos";

/**
 * A Content-Security-Policy, com um nonce novo por requisição.
 *
 * O cabeçalho vai em dois lugares:
 *
 *   - na resposta, para o navegador aplicar a política;
 *   - na requisição, para o Next ler o nonce enquanto renderiza e carimbá-lo
 *     nos próprios `<script>`. É o contrato documentado do Next. Medido na
 *     15.5: ele também acha o nonce só pelo cabeçalho da resposta — mas isso
 *     não está documentado, e uma atualização que o mude bloquearia todos os
 *     scripts. O teste de cabeçalhos do E2E pega isso.
 *
 * Isso só funciona com renderização por requisição: uma página gerada no
 * build não tem como conhecer o nonce de hoje. Por isso o layout raiz é
 * `force-dynamic` (ver `app/layout.tsx`).
 */
export function middleware(request: NextRequest) {
  const nonce = gerarNonce();
  const politica = politicaDeConteudo(nonce, {
    desenvolvimento: process.env.NODE_ENV === "development",
  });

  const cabecalhos = new Headers(request.headers);
  cabecalhos.set("content-security-policy", politica);

  const resposta = NextResponse.next({ request: { headers: cabecalhos } });
  resposta.headers.set("content-security-policy", politica);
  return resposta;
}

export const config = {
  matcher: [
    {
      // Arquivos estáticos e a rota de expurgo não são HTML: CSP neles não
      // protege nada e só custa uma execução do middleware.
      source: "/((?!api/|_next/static|_next/image|favicon.ico|robots.txt).*)",
      // Pré-carregamentos do roteador: a resposta é reaproveitada depois, e
      // um nonce gerado agora não seria o da página que vai usá-la.
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
