# ==============================================================================
#  latex-worker — Tectonic em sandbox
#
#  A segunda camada de proteção. A primeira está no processo (tectonic.ts):
#  sem shell, tempo limite, diretório temporário. Esta é a do contêiner.
#  Nenhuma das duas basta sozinha — sem esta, um \write18 que escapasse teria
#  a rede inteira à disposição.
# ==============================================================================

# ---------- Estágio 1: dependências e build do TypeScript ----------
FROM node:22-bookworm-slim AS build

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/schema/package.json      packages/schema/
COPY packages/i18n/package.json        packages/i18n/
COPY packages/templates/package.json   packages/templates/
COPY apps/latex-worker/package.json    apps/latex-worker/

RUN pnpm install --frozen-lockfile

COPY packages/ packages/
COPY apps/latex-worker/ apps/latex-worker/

RUN pnpm -r --filter "./packages/**" run build \
 && pnpm --filter @cv-express/latex-worker run build \
 && pnpm prune --prod

# ---------- Estágio 2: cache de pacotes LaTeX ----------
# O Tectonic baixa pacotes sob demanda. Como o contêiner final roda SEM REDE,
# o cache precisa estar pronto na imagem. Compilamos um documento que exercita
# exatamente os pacotes do cvexpress.cls, para popular o cache.
FROM ghcr.io/tectonic-typesetting/tectonic:latest AS latex

ENV TECTONIC_CACHE_DIR=/opt/tectonic-cache
WORKDIR /aquecimento

COPY apps/latex-worker/aquecimento.tex ./aquecimento.tex
COPY packages/templates/classico/cvexpress.cls ./cvexpress.cls

RUN tectonic --outdir /tmp/aq --keep-intermediates aquecimento.tex \
 && test -f /tmp/aq/aquecimento.pdf

# ---------- Estágio 3: imagem final ----------
FROM node:22-bookworm-slim

COPY --from=latex /usr/local/bin/tectonic /usr/local/bin/tectonic
COPY --from=latex /opt/tectonic-cache /opt/tectonic-cache

# O Tectonic precisa das bibliotecas de fonte do sistema.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libfontconfig1 libfreetype6 libgraphite2-3 libharfbuzz0b libicu72 libssl3 \
      fonts-lmodern ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Usuário não-root. Um \write18 que escapasse rodaria com estes privilégios.
RUN useradd --create-home --shell /usr/sbin/nologin --uid 10001 cvexpress

WORKDIR /app
COPY --from=build --chown=cvexpress:cvexpress /app/node_modules ./node_modules
COPY --from=build --chown=cvexpress:cvexpress /app/packages ./packages
COPY --from=build --chown=cvexpress:cvexpress /app/apps/latex-worker/dist ./apps/latex-worker/dist
COPY --from=build --chown=cvexpress:cvexpress /app/apps/latex-worker/package.json ./apps/latex-worker/

# O cache do Tectonic é somente leitura em execução: o contêiner não tem rede,
# então nada novo entra, e escrita ali seria sinal de que algo está errado.
RUN chown -R root:root /opt/tectonic-cache && chmod -R a-w /opt/tectonic-cache

# Único diretório gravável. O filesystem sobe com --read-only e este vem de um
# tmpfs, montado em tempo de execução (ver README).
RUN mkdir -p /tmp/cvexpress && chown cvexpress:cvexpress /tmp/cvexpress

USER cvexpress

ENV NODE_ENV=production \
    TECTONIC_CACHE_DIR=/opt/tectonic-cache \
    TMPDIR=/tmp/cvexpress \
    PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/saude').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/latex-worker/dist/index.js"]
