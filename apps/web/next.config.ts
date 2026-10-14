import type { NextConfig } from "next";

import { LIMITES } from "@cv-express/schema";

import { CABECALHOS_FIXOS } from "./src/seguranca/cabecalhos";

/**
 * O maior corpo que uma Server Action aceita: 2,5× o maior currículo válido.
 *
 * Este limite vale para o que o NAVEGADOR ENVIA — não para a resposta. A
 * versão anterior era "4mb", com o comentário "o worker devolve o PDF em
 * base64; o corpo passa de 1MB". A resposta não tem limite nenhum: medido,
 * um PDF de 2,2 MB foi gerado e baixado com o limite padrão do Next (1 MB).
 * O que os 4 MB faziam era deixar qualquer pessoa mandar, a qualquer Server
 * Action, um corpo vinte vezes maior que o maior currículo válido — e o
 * servidor o lia e decodificava inteiro antes de a validação recusá-lo.
 *
 * Por que a folga, e não exatamente `SESSAO_BYTES_MAX`: um currículo que
 * passou um pouco do limite precisa chegar à validação do worker, que é quem
 * explica o problema — o preview mostra "O currículo tem 230KB, acima do
 * limite de 200KB. Reduza as descrições mais longas." Barrado aqui, ele
 * viraria um erro genérico. Os 500 KB também cabem no limite de corpo do
 * próprio worker (512 KB, `CORPO_MAXIMO_BYTES` em latex-worker/src/config.ts).
 */
const CORPO_MAXIMO_BYTES = Math.ceil(LIMITES.SESSAO_BYTES_MAX * 2.5);

const config: NextConfig = {
  // Os pacotes do workspace passam pelo pipeline do Next (JSX/TS modernos nos
  // pacotes não quebram o bundle).
  //
  // NÃO dispensa o build. A resolução continua passando pelo campo `exports`
  // de cada package.json, que aponta para `dist/` — sem `pnpm run build` o
  // `next dev` falha com `Can't resolve '@cv-express/schema'`. Este comentário
  // já afirmou o contrário e mandava gente ao erro.
  transpilePackages: [
    "@cv-express/schema",
    "@cv-express/templates",
    "@cv-express/ai",
    "@cv-express/db",
    "@cv-express/i18n",
  ],
  eslint: {
    // O lint tem script próprio (`pnpm --filter @cv-express/web lint`) e entra
    // no `verificar` da raiz. Deixar o `next build` rodar o SEU lint em cima
    // do mesmo código faria duas configurações disputarem o mesmo arquivo — e
    // é de onde vinha o aviso "The Next.js plugin was not detected in your
    // ESLint configuration". O build continua checando tipos.
    ignoreDuringBuilds: true,
  },
  // O app não tem imagem para otimizar — a prévia de compartilhamento é
  // gerada pronta, e o resto é CSS e SVG. Desligado, o endpoint
  // `/_next/image` deixa de existir: menos uma porta que processa arquivo
  // a pedido de quem chega, e o `sharp` (com a sua cadeia de bibliotecas
  // nativas) nunca é carregado.
  images: { unoptimized: true },
  // Não anunciar "X-Powered-By: Next.js": é informação de graça para quem
  // procura uma versão com falha conhecida.
  poweredByHeader: false,
  // Os cabeçalhos iguais em toda resposta. A CSP, que muda a cada requisição,
  // está no middleware — ver `src/seguranca/cabecalhos.ts`.
  async headers() {
    return [{ source: "/:path*", headers: [...CABECALHOS_FIXOS] }];
  },
  experimental: {
    serverActions: { bodySizeLimit: CORPO_MAXIMO_BYTES },
  },
};

export default config;
