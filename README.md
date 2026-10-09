# CV Express

Gerador de currículos: o usuário preenche um formulário em etapas, uma IA
organiza o texto das experiências sem inventar nada, e o sistema devolve um PDF
bonito — composto em LaTeX, sem que o usuário jamais veja LaTeX.

> **Estado: em desenvolvimento.** O fluxo roda de ponta a ponta: formulário,
> autosave, sugestões da IA, geração do PDF, preview e download. Veja
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
Página inicial → "Começar" ...... a sessão nasce aqui, num POST — nunca ao abrir a página
   ↓
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
| Testes         | Vitest 2, Testing Library, PGlite     | 762 testes; o banco de teste é Postgres de verdade, em memória    |
| Ponta a ponta  | Playwright                            | Navegador real contra app, worker e Postgres; roda no CI          |
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
├── e2e/                    Testes de ponta a ponta (Playwright)
├── .github/workflows/      CI: verificar:completo e E2E a cada push e PR
└── AGENTS.md               Guia para quem for contribuir com IA
```

Cada pacote tem seu próprio `src/`, `package.json` e testes. Não é duplicação:
é o que permite testar, versionar e importar cada um isoladamente.

---

## Rodando localmente

### Pré-requisitos

- **Node.js 22** ou superior (`.nvmrc` no repositório)
- **pnpm 10** — `corepack enable` já resolve
- **Docker** — para subir o Postgres e o worker. Os testes não precisam dele:
  usam PGlite

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

Isso roda build, typecheck, lint e testes, nessa ordem. O esperado:

```
packages/schema        38 testes
packages/templates    116 testes
packages/ai            77 testes
packages/db            62 testes
apps/latex-worker      51 testes
apps/web              418 testes
─────────────────────────────────
total                 762 testes
```

O build vem antes porque os pacotes se importam via `dist/` — um build velho
produz falhas confusas.

Antes de entregar mudança em `apps/web`, rode também
`pnpm run verificar:completo`: ele inclui o `next build`, único passo que
checa a fronteira entre servidor e cliente como ela vai para produção.

### Testes de ponta a ponta

Um navegador percorre o produto como uma pessoa: começar, preencher, pedir
ajuda à IA, gerar, baixar o PDF, concluir e voltar pelo link do e-mail em
outro navegador. Também conferem que abrir a página inicial não grava nada,
que o "Começar" funciona sem JavaScript, os cabeçalhos de segurança e o 404
em português.

```bash
docker compose up -d postgres            # ou qualquer Postgres
pnpm run build && pnpm run build:apps    # o E2E usa o build de produção
pnpm --filter @cv-express/e2e exec playwright install chromium   # uma vez
DATABASE_URL=postgres://cvexpress:dev@localhost:5432/cvexpress pnpm run e2e
```

O próprio E2E aplica as migrações e sobe o worker e o app (portas 8100 e
3100, para não brigar com o `pnpm dev`). A IA roda no modo `mock`, o e-mail no
`console` — o link é lido do log em `e2e/resultados/web.log` — e o Tectonic é
um falso que devolve um PDF real guardado: o E2E prova o fluxo, não a
composição tipográfica. Nada é apagado do banco; as sessões criadas expiram
como qualquer outra. Com um Chromium já instalado, aponte
`E2E_CHROMIUM=/caminho/do/chrome` em vez de baixar o do Playwright.

### Integração contínua

`.github/workflows/ci.yml` roda, a cada push no `main` e a cada PR, dois jobs
em paralelo: o `verificar:completo` e o E2E, com um Postgres 16 de serviço.
Não usa segredo nenhum. Se o E2E falha, o relatório, o trace e o log do app
ficam como artefato `e2e-resultados` por 7 dias.

### Subindo o app inteiro

**1. Postgres e worker.** O `docker-compose.yml` sobe os dois, com a sandbox
do worker já configurada. Depois, aplique as migrações — é seguro rodar
sempre, inclusive a cada atualização do código:

```bash
docker compose up -d --build
DATABASE_URL=postgres://cvexpress:dev@localhost:5432/cvexpress pnpm migrar
```

A primeira construção do worker demora: ela baixa o binário do Tectonic e o
bundle de LaTeX que vai pronto no cache da imagem.

**2. Build dos pacotes.** O Next resolve os pacotes do workspace pelo `dist/`;
sem ele, falha com `Can't resolve '@cv-express/schema'`. O `verificar` já
faz isso — rode de novo só se mexer em `packages/`.

```bash
pnpm run build
```

**3. O app.** As credenciais batem com as do compose:

```bash
cd apps/web
DATABASE_URL=postgres://cvexpress:dev@localhost:5432/cvexpress \
WORKER_URL=http://localhost:8080 \
WORKER_TOKEN=token-local-nao-use-em-producao \
AI_PROVIDER=mock \
EMAIL_PROVIDER=console \
pnpm run dev
```

Abra `http://localhost:3000`. A página inicial cria uma sessão anônima e
redireciona para `/cv/<id>`, onde começa o formulário. Depois de habilidades,
"Gerar meu currículo" compila o PDF e abre o preview com o download.

`AI_PROVIDER=mock` faz os botões de sugestão funcionarem sem chave de API, e
`EMAIL_PROVIDER=console` escreve no terminal o e-mail do "Concluir e salvar",
com o link — abra-o no navegador para testar a volta ao currículo.
Para usar a IA de verdade, veja as variáveis abaixo.

**Sem Docker**, qualquer Postgres 16 serve: aponte a `DATABASE_URL` para ele
e rode `pnpm migrar`.
O worker roda direto no Node — o passo a passo está em
[`apps/latex-worker/README.md`](./apps/latex-worker/README.md). Sem worker, o
formulário funciona inteiro e o preview avisa que o gerador de PDF está
indisponível, com "tentar de novo" — sem perder nada do que foi preenchido.

### Variáveis de ambiente do app web

Estas são todas as que o código lê. O
[`apps/web/.env.example`](./apps/web/.env.example) traz a mesma lista,
comentada e com valores que batem com o compose: copie para
`apps/web/.env.local` e o `pnpm dev` já sobe configurado.

| Variável            | Obrigatória | Para quê                                                        |
| ------------------- | ----------- | --------------------------------------------------------------- |
| `DATABASE_URL`      | sim         | Conexão com o Postgres. Sem ela, nenhuma página abre            |
| `AI_PROVIDER`       | não         | `anthropic` (padrão), `openai-compativel` ou `mock`             |
| `ANTHROPIC_API_KEY` | com `anthropic` | Lida pelo SDK quando `AI_API_KEY` não é informada           |
| `AI_MODEL`          | com `openai-compativel` | Id do modelo. Com `anthropic`, o padrão é `claude-opus-5` |
| `AI_BASE_URL`       | com `openai-compativel` | Ex.: `http://localhost:11434/v1` (Ollama)           |
| `AI_API_KEY`        | não         | Chave explícita; opcional em modelo local                       |
| `AI_SUPORTE_JSON`   | não         | `nativo` (padrão), `modo_json` ou `nenhum` — só `openai-compativel` |
| `IA_TETO_DIARIO`    | não         | Pedidos à IA por dia, somando todo mundo. Padrão `1000`; `0` desliga a ajuda sem tirar a chave |
| `WORKER_URL`        | para gerar o PDF | Endereço do latex-worker                                   |
| `WORKER_TOKEN`      | para gerar o PDF | Token compartilhado com o worker; o mesmo `WORKER_TOKEN` dele |
| `EMAIL_PROVIDER`    | para "Concluir e salvar" | `resend` ou `console` (só fora de produção: escreve o e-mail no log) |
| `RESEND_API_KEY`    | com `resend` | Chave da API do Resend                                      |
| `EMAIL_REMETENTE`   | com `resend` | Ex.: `CV Express <nao-responda@seudominio.com.br>`, de domínio verificado no Resend |
| `APP_URL`           | em produção | Endereço público do app; base do link do e-mail. Em desenvolvimento, `http://localhost:3000` |
| `CRON_SECRET`       | em produção | Segredo do expurgo diário. Sem ele, a rota de expurgo recusa (503) e nada é apagado |
| `PRIVACIDADE_CONTATO` | em produção | Canal de contato do responsável pelos dados, mostrado em `/privacidade`. A LGPD exige um |

Sem e-mail configurado, o botão "Concluir e salvar" aparece desligado, com o
motivo escrito; o resto do fluxo, inclusive o download, funciona normalmente.
O link do e-mail é montado sempre a partir de `APP_URL`, nunca do cabeçalho
`Host` da requisição, que quem faz a requisição controla.

O "Concluir e salvar" tem três limites de envio, contados no próprio
Postgres: 5 links por currículo, 10 e-mails por hora por IP e 3 por dia para
o mesmo destinatário. "Já enviado" não conta. Quem esbarra no limite lê que o
currículo está salvo e que pode tentar daqui a pouco.

### Cotas: o que impede alguém de esgotar o produto

O produto é gratuito, então a IA é a única despesa que cresce com o uso e o
worker é a única CPU que um estranho consegue ocupar. As duas operações exigem
uma sessão que **existe no banco** — um id inventado não chega ao provider
nem ao worker — e contam o uso no Postgres, com o mesmo contador do limite de
e-mail (vale entre instâncias e sobrevive a reinícios):

| O quê                | Por sessão     | Por IP         | Global                            |
| -------------------- | -------------- | -------------- | --------------------------------- |
| Pedido à IA          | 15 por hora    | 100 por hora   | `IA_TETO_DIARIO` por dia (UTC)    |
| Geração do PDF       | 120 por hora   | 600 por hora   | —                                 |
| Começar um currículo | —              | 60 por hora    | —                                 |

Ao atingir o teto do dia, a ajuda da IA aparece como **pausada até amanhã**,
não como erro: o currículo sai igual sem ela. O teto conta pedidos, não
tokens — cada pedido já é limitado no serviço (resposta de no máximo 2.000
tokens, uma nova tentativa no máximo) —, então o gasto diário fica abaixo de
`IA_TETO_DIARIO × 2 × (entrada + 2.000 tokens de saída)`. Ajuste o número ao
orçamento.

Se o banco não responde, a IA e a geração recusam em vez de seguir sem
contar. E nenhum GET cria sessão: robôs de busca e pré-visualizações de link
abrem a página inicial sem gravar nada.

### Expurgo diário

Currículos vencidos (rascunho sem uso há 30 dias, ou concluído há mais de 5)
e contadores de limite antigos são apagados por
`GET /api/tarefas/expurgo`, com `Authorization: Bearer <CRON_SECRET>`.

**Na Vercel**, o agendamento já está em `apps/web/vercel.json` (todo dia às
06:00 UTC, 03:00 em Brasília): basta definir `CRON_SECRET` no projeto, e a
Vercel envia o cabeçalho sozinha.

**Fora da Vercel**, qualquer agendador serve — um `cron` do sistema, uma
tarefa agendada da plataforma:

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://SEU-APP/api/tarefas/expurgo
```

A resposta diz quantos foram apagados, e o mesmo número vai para o log.

Sem chave configurada, pedir sugestão à IA falha — e o formulário segue com o
texto que a pessoa escreveu. É o comportamento pretendido: a IA nunca bloqueia
o fluxo.

### Comandos

| Comando                                          | O que faz                                                |
| ------------------------------------------------ | -------------------------------------------------------- |
| `pnpm run verificar`                             | Build + typecheck + lint + testes. O portão antes de commitar |
| `pnpm run verificar:completo`                    | O mesmo + build do worker e `next build`                 |
| `pnpm migrar`                                    | Aplica as migrações no banco de `DATABASE_URL`. Idempotente |
| `pnpm run e2e`                                   | Testes de ponta a ponta (precisa de build e de `DATABASE_URL`) |
| `pnpm run build`                                 | Compila os pacotes de `packages/`                        |
| `pnpm run test`                                  | Só os testes (para no primeiro pacote que falhar)        |
| `pnpm -r --no-bail run test`                     | Todos os testes, mesmo com falha no meio                 |
| `pnpm run typecheck`                             | Só a checagem de tipos (inclui os arquivos de teste)     |
| `pnpm --filter @cv-express/web dev`              | App web em modo desenvolvimento                          |
| `pnpm --filter @cv-express/templates test`       | Testes de um pacote só                                   |
| `pnpm --filter @cv-express/templates test:watch` | Modo watch                                               |

### O worker de LaTeX

A compilação `.tex → PDF` foi verificada com **Tectonic 0.17.0**: o
`cvexpress.cls`, as âncoras de posição no `.aux`, a calibração das
coordenadas e a contagem de páginas. A imagem Docker fixa essa mesma versão,
com o binário conferido por SHA-256.

> ⚠️ **A imagem com o 0.17.0 ainda não foi construída.** Ela fixava 0.15.0 —
> uma versão diferente da usada em todas as medições — e a troca foi feita
> num ambiente sem Docker. Na primeira construção, o estágio `latex` compila
> `aquecimento.tex` como teste de fumaça. Detalhes em
> [`apps/latex-worker/README.md`](./apps/latex-worker/README.md).

Sem Tectonic, `/compilar` responde 500 `FALHA_LATEX` — e o log do LaTeX fica
no servidor, como deve.

---

## Situação atual

| Parte                                                     | Estado                              |
| --------------------------------------------------------- | ----------------------------------- |
| Fundação do monorepo                                      | ✅                                   |
| `packages/schema` — CvData, limites, FieldId, contrato    | ✅ 38 testes                         |
| `packages/templates` — escape, motor, template, fixtures  | ✅ 116 testes                        |
| `packages/i18n` — rótulos pt-BR                           | ✅                                   |
| `packages/ai` — serviço, adapters, guardrails             | ✅ 77 testes, só contra o mock       |
| `packages/db` — sessões, link mágico, compilações         | ✅ 62 testes, contra Postgres real   |
| `apps/latex-worker` — API, fila, cache, sandbox           | ✅ 51 testes                         |
| `apps/web` — 6 etapas, trilha, autosave, sugestões de IA  | ✅ roda localmente                   |
| `apps/web` — "gerando", preview, download, painel, aviso de páginas | ✅ 418 testes no app; fluxo verificado no navegador |
| Compilação real `.tex → PDF`                              | ✅ verificada com Tectonic 0.17.0    |
| Imagem Docker do worker com 0.17.0                        | ⚠️ nunca construída                 |
| Tela "gerando" com narração em etapas                     | ✅                                   |
| LGPD — apagar meus dados, página de privacidade           | ✅ verificado no navegador; texto sem revisão jurídica |
| Script de migração e `.env.example`                       | ✅ `pnpm migrar` verificado em Postgres real |
| "Concluir e salvar" — e-mail com link de 5 dias           | ✅ verificado no navegador, com e-mail no modo `console` |
| Limite de envio por IP e por destinatário                 | ✅ verificado no navegador e em Postgres real |
| Cotas de IA e de geração, teto diário da IA, página inicial | ✅ verificado no navegador e em Postgres real |
| Expurgo diário agendado                                   | ✅ rota verificada; agendamento da Vercel nunca executado |
| Envio real pelo Resend                                    | ⚠️ nunca executado                  |
| Cabeçalhos de segurança e CSP com nonce                   | ✅ verificados no navegador, sem violação no fluxo |
| Página de erro e 404 em português                         | ✅ verificados com o banco fora do ar |
| Testes de ponta a ponta (Playwright)                      | ✅ 6 testes, verdes localmente      |
| CI no GitHub Actions                                      | ⚠️ escrito e validado com actionlint; ainda não rodou no GitHub |

### Antes de abrir ao público

O código da V1 está completo. O que falta é configuração e conferência:

1. `PRIVACIDADE_CONTATO` definido. Sem ele, `/privacidade` diz que o canal
   não está configurado, e a LGPD exige um.
2. O texto de `/privacidade` revisado por quem responde juridicamente. Ele
   descreve o que o código faz, conferido linha a linha, mas não substitui
   revisão.
3. `CRON_SECRET` definido na Vercel, e a primeira execução do expurgo
   conferida no log (`[expurgo] concluído`).
4. Conta no Resend com o domínio do remetente verificado, e um envio real
   testado — nenhum saiu até hoje.
5. A imagem do worker construída com o Tectonic 0.17.0 e um PDF de verdade
   gerado por ela.
6. `IA_TETO_DIARIO` ajustado ao orçamento da IA (o padrão é 1000 pedidos por
   dia) e o aviso `[cotas] teto diário da IA atingido` acompanhado no log.
7. O CI verde no GitHub, e o `main` protegido para exigi-lo antes do merge
   (Settings → Branches). Sem a proteção, o CI avisa mas não impede.

## Decisões que valem saber de antemão

**LaTeX é uma linguagem de programação, não uma marcação.** Um
`\input{/etc/passwd}` no campo "cargo" lê arquivos do servidor. Por isso existe
um único ponto de escape (`packages/templates/src/escape.ts`), uma suíte de 27
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

**Sem conta, sem senha.** A sessão é anônima. Ao clicar "Concluir e salvar",
a pessoa recebe no e-mail do currículo um link para voltar e editar. O link
vale por 5 dias a partir da primeira conclusão, pode ser usado quantas vezes
ela quiser, e **o prazo não renova**: editar, voltar pelo link ou concluir de
novo não compram dias a mais. O banco guarda só o hash do token.

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
