import type { NextConfig } from "next";

import { CABECALHOS_FIXOS } from "./src/seguranca/cabecalhos";

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
  // Não anunciar "X-Powered-By: Next.js": é informação de graça para quem
  // procura uma versão com falha conhecida.
  poweredByHeader: false,
  // Os cabeçalhos iguais em toda resposta. A CSP, que muda a cada requisição,
  // está no middleware — ver `src/seguranca/cabecalhos.ts`.
  async headers() {
    return [{ source: "/:path*", headers: [...CABECALHOS_FIXOS] }];
  },
  experimental: {
    // O worker devolve o PDF em base64; o corpo passa de 1MB com facilidade.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default config;
