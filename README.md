# CV Express

Gerador de currículos: o usuário preenche um formulário em etapas, uma IA
organiza o texto das experiências sem inventar nada, e o sistema devolve um PDF
bonito — composto em LaTeX, sem que o usuário jamais veja LaTeX.

> **Estado: em desenvolvimento.** O formulário web já roda, salva sozinho e
> pede sugestões à IA. O PDF ainda não aparece na interface: o preview existe
> como componente, mas nenhuma rota o exibe. Veja
> [Situação atual](#situação-atual).

## O problema

Escrever currículo trava a maioria das pessoas, por dois motivos: a folha em
branco — não saber como descrever a própria experiência — e o resultado feio,
em Word mal formatado. LaTeX resolve o segundo com elegância, mas exige
conhecimento técnico que o público-alvo não tem.

A proposta é ficar com a qualidade tipográfica do LaTeX e jogar fora a
exigência técnica.

## Como funciona

```
Formulário (6 etapas de dados)
   ↓  autosave com debounce, via Server Action
CvData ......................... JSON canônico, validado por Zod, salvo no Postgres
   ↓  polimento opcional por IA (experiências e habilidades), aprovado pelo usuário
CvData enriquecido
   ↓  ViewModel + motor de templates
arquivo .tex ................... todo dado do usuário escapado
   ↓  Tectonic, em contêiner isolado (latex-worker)
PDF + nº de páginas + mapa de posições
   ↓
Preview no navegador  →  clique numa seção  →  edita  →  recompila
```

Da primeira linha até o `CvData` enriquecido, o fluxo está ligado e roda. Do
`.tex` para baixo, as peças existem e têm testes, mas a interface ainda não
chama o worker.

O **`CvData` é a única fonte de verdade**. O `.tex` e o `.pdf` são artefatos
derivados, descartáveis e sempre reconstruíveis. É isso que torna a edição
simples: não existe merge entre "o que o usuário editou no LaTeX" e "o que
estava no formulário", porque o usuário nunca edita LaTeX.

## Tecnologias

| Camada         | Escolha                               | Por quê                                                           |
| -------------- | ------------------------------------- | ----------------------------------------------------------------- |
| Linguagem      | TypeScript 5.9, modo estrito          | `noUncheckedIndexedAccess` e `exactOptionalPropertyTypes` ligados |
| Runtime        | Node.js 22                            | Versão fixada em `.nvmrc`                                         |
| Monorepo       | pnpm workspaces 10                    | Dependências estritas: um pacote só enxerga o que declarou        |
| Validação      | Zod 3                                 | Um schema só, usado no cliente, no servidor e na borda            |
| Web            | Next.js 15 (App Router) + React 19    | Server Actions mantêm banco, token e chave de IA no servidor      |
| Banco          | Postgres + Drizzle ORM 0.38           | Migração em SQL escrito à mão, aplicada igual em produção e teste |
| Composição     | LaTeX via Tectonic                    | Engine moderna, ~200 MB, sem instalar TeX Live inteiro            |
| Worker         | Fastify 5                             |                                                                   |
| IA             | SDK da Anthropic + adapter OpenAI-compatível + mock | Provider trocável por variável de ambiente          |
| Testes         | Vitest 2, Testing Library, PGlite     | 401 testes; o banco de teste é Postgres de verdade, em memória    |
| Ids            | nanoid                                | Ids estáveis por item de lista                                    |

Sem Handlebars, sem LangChain. Cada dependência ausente foi uma decisão, não um
esquecimento — os motivos estão nos comentários do código e no `AGENTS.md`.

## Estrutura

```
cv-express/
├── apps/
│   ├── web/                Formulário, autosave, Server Actions (Next.js)
│   └── latex-worker/       Serviço de compilação (Fastify + Tectonic)
├── packages/
│   ├── schema/             CvData, limites, FieldId, contrato HTTP
│   ├── templates/          Escape de LaTeX, motor, template "clássico", fixtures
│   ├── i18n/               Rótulos (pt-BR)
│   ├── ai/                 Camada de IA agnóstica de provider, com guardrails
│   └── db/                 Sessões, link mágico, registro de compilações
└── AGENTS.md               Guia para quem for contribuir com IA
```

Cada pacote tem seu próprio `src/`, `package.json` e testes. Não é duplicação:
é o que permite testar, versionar e importar cada um isoladamente.

---

## Rodando localmente

### Pré-requisitos

- **Node.js 22** ou superior (`.nvmrc` no repositório)
- **pnpm 10** — `corepack enable` já resolve
- **Docker** — para subir o Postgres. Os testes não precisam dele: usam PGlite

### Instalação

```bash
git clone https://github.com/tmvinicius/cv-express.git
cd cv-express
pnpm install
```

### Verificando que está tudo de pé

```bash
pnpm run verificar
```

Isso roda build, typecheck e testes, nessa ordem. O esperado:

```
packages/schema        38 testes
packages/templates     95 testes
packages/ai            64 testes
packages/db            35 testes
apps/latex-worker      41 testes
apps/web              128 testes
─────────────────────────────────
total                 401 testes
```

O build vem antes porque os pacotes se importam via `dist/` — um build velho
produz falhas confusas.

### Subindo o app web

**1. Postgres.** Qualquer Postgres serve; o jeito mais curto é um contêiner
descartável:

```bash
docker run -d --name cvexpress-pg -p 5432:5432 \
  -e POSTGRES_USER=cvexpress \
  -e POSTGRES_PASSWORD=cvexpress \
  -e POSTGRES_DB=cvexpress \
  postgres:16
```

**2. Migração.** Não há script: o arquivo é SQL puro e se aplica direto.

```bash
docker exec -i cvexpress-pg psql -U cvexpress -d cvexpress \
  < packages/db/migrations/0000_inicial.sql
```

**3. Build dos pacotes.** O Next resolve os pacotes do workspace pelo `dist/`;
sem ele, falha com `Can't resolve '@cv-express/schema'`. O `verificar` já
faz isso — rode de novo só se mexer em `packages/`.

```bash
pnpm run build
```

**4. O app.**

```bash
cd apps/web
DATABASE_URL=postgres://cvexpress:cvexpress@localhost:5432/cvexpress \
AI_PROVIDER=mock \
pnpm run dev
```

Abra `http://localhost:3000`. A página inicial cria uma sessão anônima e
redireciona para `/cv/<id>`, onde começa o formulário.

`AI_PROVIDER=mock` faz os botões de sugestão funcionarem sem chave de API.
Para usar a IA de verdade, veja as variáveis abaixo.

### Variáveis de ambiente do app web

Não há `.env.example`; estas são todas as que o código lê.

| Variável            | Obrigatória | Para quê                                                        |
| ------------------- | ----------- | --------------------------------------------------------------- |
| `DATABASE_URL`      | sim         | Conexão com o Postgres. Sem ela, nenhuma página abre            |
| `AI_PROVIDER`       | não         | `anthropic` (padrão), `openai-compativel` ou `mock`             |
| `ANTHROPIC_API_KEY` | com `anthropic` | Lida pelo SDK quando `AI_API_KEY` não é informada           |
| `AI_MODEL`          | com `openai-compativel` | Id do modelo. Com `anthropic`, o padrão é `claude-opus-5` |
| `AI_BASE_URL`       | com `openai-compativel` | Ex.: `http://localhost:11434/v1` (Ollama)           |
| `AI_API_KEY`        | não         | Chave explícita; opcional em modelo local                       |
| `AI_SUPORTE_JSON`   | não         | `nativo` (padrão), `modo_json` ou `nenhum` — só `openai-compativel` |
| `WORKER_URL`        | não         | Endereço do latex-worker. Ainda sem efeito: a interface não compila |
| `WORKER_TOKEN`      | não         | Token compartilhado com o worker. Idem                          |

Sem chave configurada, pedir sugestão à IA falha — e o formulário segue com o
texto que a pessoa escreveu. É o comportamento pretendido: a IA nunca bloqueia
o fluxo.

### Comandos

| Comando                                          | O que faz                                                |
| ------------------------------------------------ | -------------------------------------------------------- |
| `pnpm run verificar`                             | Build + typecheck + testes. É o portão antes de commitar |
| `pnpm run build`                                 | Compila os pacotes de `packages/`                        |
| `pnpm run test`                                  | Só os testes (para no primeiro pacote que falhar)        |
| `pnpm -r --no-bail run test`                     | Todos os testes, mesmo com falha no meio                 |
| `pnpm run typecheck`                             | Só a checagem de tipos (inclui os arquivos de teste)     |
| `pnpm --filter @cv-express/web dev`              | App web em modo desenvolvimento                          |
| `pnpm --filter @cv-express/templates test`       | Testes de um pacote só                                   |
| `pnpm --filter @cv-express/templates test:watch` | Modo watch                                               |

### Compilando um PDF de verdade

> ⚠️ **A imagem Docker do worker não constrói hoje.** O `Dockerfile` foi
> escrito antes de `packages/ai` e `packages/db` existirem, e tem dois
> defeitos conhecidos: a imagem base `ghcr.io/tectonic-typesetting/tectonic`
> não é baixável anonimamente (403), e o estágio de build compila
> `packages/db` sem instalar as dependências dele. Detalhes e o roteiro de
> conferência estão em [`apps/latex-worker/README.md`](./apps/latex-worker/README.md).

Enquanto isso, o worker roda direto no Node. Ele sobe e responde `/saude`;
para compilar PDF precisa do binário `tectonic` no `PATH` (ou em
`TECTONIC_BIN`):

```bash
cd apps/latex-worker
pnpm run build
PORT=8080 WORKER_TOKEN=token-local node dist/index.js
curl localhost:8080/saude
```

Sem Tectonic, `/compilar` responde 500 `FALHA_LATEX` — e o log do LaTeX fica
no servidor, como deve.

> ⚠️ **Nunca verificado.** A compilação `.tex → PDF` ainda não foi exercitada
> de verdade. Isso inclui o `cvexpress.cls`, a macro `\cvCampo` e a origem das
> coordenadas em `aux.ts`. Se você for a primeira pessoa a rodar, siga o
> roteiro no README do worker — e conte o que deu.

---

## Situação atual

| Parte                                                     | Estado                              |
| --------------------------------------------------------- | ----------------------------------- |
| Fundação do monorepo                                      | ✅                                   |
| `packages/schema` — CvData, limites, FieldId, contrato    | ✅ 38 testes                         |
| `packages/templates` — escape, motor, template, fixtures  | ✅ 95 testes                         |
| `packages/i18n` — rótulos pt-BR                           | ✅                                   |
| `packages/ai` — serviço, adapters, guardrails             | ✅ 64 testes, só contra o mock       |
| `packages/db` — sessões, link mágico, compilações         | ✅ 35 testes, contra Postgres real   |
| `apps/latex-worker` — API, fila, cache, sandbox           | ✅ 41 testes                         |
| `apps/web` — 6 etapas, autosave, sugestões de IA          | ✅ 128 testes, roda localmente       |
| `apps/web` — preview do PDF, painel de seções, aviso de páginas | ⚠️ componentes prontos, fora da rota |
| `apps/web` — telas de boas-vindas e "gerando"             | ❌ etapas existem, sem conteúdo      |
| Botão "apagar meus dados" (LGPD)                          | ⚠️ ação pronta, sem botão            |
| Envio do e-mail do link mágico                            | ❌ não começou                       |
| Imagem Docker do worker                                   | ❌ não constrói                      |
| Compilação real `.tex → PDF`                              | ⚠️ nunca executada                  |

## Decisões que valem saber de antemão

**LaTeX é uma linguagem de programação, não uma marcação.** Um
`\input{/etc/passwd}` no campo "cargo" lê arquivos do servidor. Por isso existe
um único ponto de escape (`packages/templates/src/escape.ts`), uma suíte de 26
testes de ataque, e um motor de templates próprio — sem sintaxe capaz de
inserir LaTeX cru a partir dos dados.

**O worker não aceita `.tex`.** Ele recebe `CvData` e gera o `.tex` ele mesmo.
Um endpoint que aceitasse `.tex` arbitrário seria um endpoint de execução
remota de LaTeX, e contornaria todo o escape.

**Tudo é determinístico.** O mesmo `CvData` gera o mesmo `.tex`, byte a byte.
Datas são `{ano, mes}`, listas têm ordenação com desempate, acentos são
normalizados em NFC. Sem isso o cache de compilação por `contentHash` nunca
acertaria.

**A IA organiza, não escreve.** O texto original fica intacto e a sugestão só
entra se o usuário aprovar. As regras contra invenção — teto de expansão,
número inventado, habilidade que não estava no texto — são verificadas em
código, não confiadas ao prompt: trocar para um modelo menor não afrouxa
nenhuma delas.

**Sem conta, sem senha.** A sessão é anônima; o link mágico é o único jeito de
retomá-la. O banco guarda só o hash do token, que é de uso único e vale 7 dias.

**A idade é coletada e nunca impressa.** Decisão de produto da V1, aplicada
estruturalmente: a idade nem entra no ViewModel, então não chega ao PDF nem por
engano de template.

## Planejamento

O documento de arquitetura e produto (decisões de negócio da V1, fases,
segurança, o que ficou fora do escopo) é a referência de qualquer mudança
grande. Ele não está versionado ainda — peça ao mantenedor.

## Contribuindo com IA

Se você é — ou está usando — um assistente de código neste repositório, leia
o [`AGENTS.md`](./AGENTS.md) antes de escrever qualquer linha. Ele registra as
invariantes que não podem ser quebradas e as armadilhas específicas deste
projeto.

## Licença

A definir.
