import type { NextConfig } from "next";

const config: NextConfig = {
  // Os pacotes do workspace são compilados pelo Next em vez de consumidos de
  // dist/: evita ter de rodar build de cada um a cada alteração durante o
  // desenvolvimento.
  transpilePackages: [
    "@cv-express/schema",
    "@cv-express/templates",
    "@cv-express/ai",
    "@cv-express/db",
    "@cv-express/i18n",
  ],
  experimental: {
    // O worker devolve o PDF em base64; o corpo passa de 1MB com facilidade.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default config;
