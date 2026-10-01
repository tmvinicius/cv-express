# ==============================================================================
#  latex-worker — Tectonic em sandbox
#
#  A segunda camada de proteção. A primeira está no processo (tectonic.ts):
#  sem shell, tempo limite, diretório temporário. Esta é a do contêiner.
#  Nenhuma das duas basta sozinha — sem esta, um \write18 que escapasse teria
#  a rede inteira à disposição.
#
#  Construir:
#      docker build -f apps/latex-worker/Dockerfile -t cvexpress-worker .
#  (o contexto é a RAIZ do monorepo, não apps/latex-worker/)
# ==============================================================================

# ---------- Estágio 1: dependências e build do TypeScript ----------
FROM node:22-bookworm-slim AS build

RUN corepack enable
WORKDIR /app

# Sem TTY o pnpm pede confirmação para recriar o node_modules e aborta com
# ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY. CI=true é o remédio documentado,
# e num build de imagem é o que a situação é de fato.
ENV CI=true

# Os manifestos de TODOS os projetos do workspace, e não só os do worker.
#
# `--frozen-lockfile` valida o lockfile contra o conjunto completo de projetos
# declarado em pnpm-workspace.yaml. Faltando um manifesto, o pnpm considera o
# lockfile desatualizado e aborta.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/schema/package.json      packages/schema/
COPY packages/i18n/package.json        packages/i18n/
COPY packages/templates/package.json   packages/templates/
COPY packages/ai/package.json          packages/ai/
COPY packages/db/package.json          packages/db/
COPY apps/web/package.json             apps/web/
COPY apps/latex-worker/package.json    apps/latex-worker/

# Instala só o SUBGRAFO do worker — `...` é "este pacote e suas dependências",
# que aqui dá schema, i18n e templates.
#
# Era aqui que a imagem quebrava. A versão anterior copiava quatro manifestos,
# instalava, e depois mandava compilar TODO `packages/**` — incluindo `db`
# (drizzle-orm, pg) e `ai` (@anthropic-ai/sdk, zod), cujas dependências nunca
# tinham sido instaladas. O Dockerfile foi escrito antes desses dois pacotes
# existirem e não acompanhou.
#
# A correção é restringir o BUILD, não ampliar o install: `ai` e `db` não têm
# nada a fazer numa imagem cuja única função é compilar LaTeX. Menos código
# dentro da sandbox é menos superfície para um \write18 que escape alcançar.
RUN pnpm install --frozen-lockfile --filter "@cv-express/latex-worker..."

COPY packages/schema/    packages/schema/
COPY packages/i18n/      packages/i18n/
COPY packages/templates/ packages/templates/
COPY apps/latex-worker/  apps/latex-worker/

RUN pnpm --filter "@cv-express/latex-worker..." run build

# Reinstala só as dependências de produção — NÃO use `pnpm prune --prod` aqui.
#
# O prune apaga o `node_modules` de cada projeto do workspace e deixa apenas o
# store `node_modules/.pnpm`. A imagem constrói, sobe e morre com
# `Cannot find package 'fastify'`, porque os symlinks que resolviam os
# pacotes deixaram de existir. Um `install --prod` refaz esses links.
#
# O objetivo não é economizar disco: é não deixar compilador (typescript) e
# runner de teste (vitest) dentro do contêiner que executa LaTeX vindo de um
# formulário público.
RUN pnpm install --frozen-lockfile --filter "@cv-express/latex-worker..." --prod

# ---------- Estágio 2: Tectonic e cache de pacotes LaTeX ----------
#
# A imagem oficial `ghcr.io/tectonic-typesetting/tectonic` NÃO é puxável
# anonimamente — responde `denied` — e era o segundo motivo de a imagem não
# construir. Instalamos o binário do release do GitHub, que é público.
#
# O build musl é ESTATICAMENTE LINKADO (verificado com `file`), então o estágio
# final não precisa de libfontconfig, libfreetype, libharfbuzz, libicu nem
# fonts-lmodern — a versão anterior instalava os seis por causa do binário
# dinâmico da imagem oficial. As fontes vêm do bundle do próprio Tectonic, que
# é o que o cvexpress.cls exige ao carregar lmroman10/lmsans10 pelo arquivo.
FROM debian:bookworm-slim AS latex

# 0.17.0, e não 0.15.0: é a versão contra a qual TUDO foi medido — as
# coordenadas de aux.ts, o .aux copiado em aux.test.ts, o PDF de
# paginas.test.ts e a análise dos object streams em compilar.ts. A imagem
# fixava 0.15.0 enquanto os testes afirmavam "a mesma toolchain do worker".
#
# As duas pedem o mesmo bundle de TeX Live (default_bundle_v33), então zref e
# fontes são os mesmos; o que muda é o motor e o xdvipdfmx — justamente de
# onde saem as coordenadas e a estrutura do PDF. Medir numa versão e
# implantar outra é o tipo de divergência que só aparece em produção.
ARG TECTONIC_VERSAO=0.17.0
# Fixado por conteúdo, não só por versão: uma tag do GitHub pode ser reapontada.
# Calculado sobre o artefato oficial do release (o hash do 0.15.0, obtido do
# mesmo jeito, bateu com o que estava aqui — o que confirma a origem).
ARG TECTONIC_SHA256=8533d07f9ccbd7a65824b9e0459041bca34af1eb33daba48f59215593753a3b7

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL -o /tmp/tectonic.tar.gz \
      "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSAO}/tectonic-${TECTONIC_VERSAO}-x86_64-unknown-linux-musl.tar.gz" \
 && echo "${TECTONIC_SHA256}  /tmp/tectonic.tar.gz" | sha256sum -c - \
 && tar xzf /tmp/tectonic.tar.gz -C /usr/local/bin tectonic \
 && rm /tmp/tectonic.tar.gz \
 && tectonic --version

# O Tectonic baixa pacotes sob demanda. Como o contêiner final roda SEM REDE
# (--only-cached em tectonic.ts), o cache precisa estar pronto na imagem.
# Compilamos um documento que exercita exatamente os pacotes do cvexpress.cls.
#
# Serve também de teste de fumaça: se o aquecimento não compilar, a imagem não
# é gerada, e o erro aparece no build em vez de na primeira requisição.
ENV TECTONIC_CACHE_DIR=/opt/tectonic-cache
WORKDIR /aquecimento

COPY apps/latex-worker/aquecimento.tex ./aquecimento.tex
COPY packages/templates/classico/cvexpress.cls ./cvexpress.cls

# O mkdir não é ruído: o Tectonic NÃO cria o --outdir, ele falha com
# `output directory "/tmp/aq" does not exist`. A versão anterior deste
# Dockerfile já tinha esse defeito — só nunca chegou a ser executada, porque
# o estágio morria antes, no pull da imagem base.
RUN mkdir -p /tmp/aq \
 && tectonic --outdir /tmp/aq --keep-intermediates aquecimento.tex \
 && test -f /tmp/aq/aquecimento.pdf

# ---------- Estágio 3: imagem final ----------
FROM node:22-bookworm-slim

COPY --from=latex /usr/local/bin/tectonic /usr/local/bin/tectonic
COPY --from=latex /opt/tectonic-cache /opt/tectonic-cache

# Usuário não-root. Um \write18 que escapasse rodaria com estes privilégios.
RUN useradd --create-home --shell /usr/sbin/nologin --uid 10001 cvexpress

WORKDIR /app

# São QUATRO cópias, e a do node_modules do worker é a que sempre esquecem.
#
# O pnpm não achata dependências na raiz: cada projeto do workspace tem o seu
# `node_modules` com symlinks para `/app/node_modules/.pnpm`. O `fastify` do
# worker mora em `apps/latex-worker/node_modules`, e sem essa linha a imagem
# constrói, sobe e morre na primeira linha com
# `Cannot find package 'fastify'`. `packages/` já traz os seus pelo mesmo
# motivo — a cópia do diretório leva os symlinks junto.
COPY --from=build --chown=cvexpress:cvexpress /app/node_modules ./node_modules
COPY --from=build --chown=cvexpress:cvexpress /app/packages ./packages
COPY --from=build --chown=cvexpress:cvexpress /app/apps/latex-worker/node_modules ./apps/latex-worker/node_modules
COPY --from=build --chown=cvexpress:cvexpress /app/apps/latex-worker/dist ./apps/latex-worker/dist
COPY --from=build --chown=cvexpress:cvexpress /app/apps/latex-worker/package.json ./apps/latex-worker/

# O cache do Tectonic é somente leitura em execução: o contêiner não tem rede,
# então nada novo entra, e escrita ali seria sinal de que algo está errado.
RUN chown -R root:root /opt/tectonic-cache && chmod -R a-w /opt/tectonic-cache

USER cvexpress

# TMPDIR=/tmp, e NÃO /tmp/cvexpress.
#
# A versão anterior criava /tmp/cvexpress na imagem e apontava TMPDIR para lá.
# Em execução isso não funciona: o contêiner sobe com --read-only e um tmpfs
# montado sobre /tmp INTEIRO (é o que o docker-compose.yml faz, e o comentário
# de lá explica por quê — o Tectonic e o próprio Node escrevem direto em /tmp).
# A montagem ESCONDE o diretório criado na imagem, e a primeira compilação
# morria com:
#
#   ENOENT: no such file or directory, mkdtemp '/tmp/cvexpress/cvexpress-XXXX'
#
# O subdiretório também não comprava nada: com --read-only, /tmp já é o único
# lugar gravável, e o tmpfs é privado do contêiner. `os.tmpdir()` lê TMPDIR, e
# `tectonic.ts` cria um diretório novo por job debaixo dele.
ENV NODE_ENV=production \
    TECTONIC_CACHE_DIR=/opt/tectonic-cache \
    TMPDIR=/tmp \
    PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/saude').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/latex-worker/dist/index.js"]
