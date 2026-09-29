# CV Express

Gerador de currículos: o usuário preenche um formulário em etapas, uma IA
organiza o texto das experiências sem inventar nada, e o sistema devolve um PDF
bonito — composto em LaTeX, sem que o usuário jamais veja LaTeX.

> **Estado: em desenvolvimento.** O fluxo roda de ponta a ponta: seis etapas,
> salvamento automático no Postgres, sugestões de IA, e o PDF gerado pelo
> worker — em contêiner, com a sandbox ligada — aparece na última etapa, com
> download. O que falta: o ancoramento vertical das coordenadas de clique e
> uma chamada real a um provider de IA. Veja
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
Formulário (6 etapas de dados)                       ✅ roda
   ↓  autosave com debounce, via Server Action        ✅ roda
CvData ......................... JSON canônico, validado por Zod, salvo no Postgres
   ↓  polimento opcional por IA, aprovado pelo usuário ✅ roda (com AI_PROVIDER=mock)
CvData enriquecido
   ↓  ViewModel + motor de templates                  ✅ roda
arquivo .tex ................... todo dado do usuário escapado
   ↓  Tectonic (latex-worker)                         ✅ roda fora do Docker; imagem ❌
PDF + nº de páginas + mapa de posições
   ↓
Preview no navegador  →  painel de seções  →  edita  →  recompila   ✅ roda
                      →  clique direto no PDF                        ❌ não existe
```

O **`CvData` é a única fonte de verdade**. O `.tex` e o `.pdf` são artefatos
derivados, descartáveis e sempre reconstruíveis. É isso que torna a edição
simples: não existe merge entre "o que o usuário editou no LaTeX" e "o que
estava no formulário", porque o usuário nunca edita LaTeX.

## Tecnologias

| Camada | Escolha | Por quê |
|---|---|---|
| Linguagem | TypeScript 5.9, modo estrito | `noUncheckedIndexedAccess` e `exactOptionalPropertyTypes` ligados |
| Runtime | Node.js 22 | Versão fixada em `.nvmrc` |
| Monorepo | pnpm workspaces 10 | Dependências estritas: um pacote só enxerga o que declarou |
| Validação | Zod 3 | Um schema só, usado no cliente, no servidor e na borda |
| Composição | LaTeX via Tectonic | Engine moderna, ~200 MB, sem instalar TeX Live inteiro |
| Servidor | Fastify 5 | |
| Interface | Next.js 15 (App Router) + React 19 | Server Actions mantêm banco, token e chave de IA no servidor |
| Estilo | CSS com tokens | Sem Tailwind — o motivo está em `apps/web/src/estilos/componentes.css` |
| Testes | Vitest 2 + Testing Library | 623 testes |
| Ids | nanoid | Ids estáveis por item de lista |
| IA | Claude API, atrás de porta própria | Também há adapter OpenAI-compatível e mock; troca por variável de ambiente |
| Banco | Postgres + Drizzle | Testado contra Postgres real via PGlite |

Sem Handlebars e sem LangChain. Cada dependência ausente foi uma
decisão, não um esquecimento — os motivos estão nos comentários do código e no
`AGENTS.md`.

## Estrutura

```
cv-express/
├── apps/
│   ├── latex-worker/       Serviço de compilação (Fastify + Tectonic)
│   └── web/                Next.js: formulário, autosave, Server Actions
│       └── src/estilos/    Design system: tokens, paleta, contraste
├── packages/
│   ├── schema/             CvData, limites, FieldId, contrato HTTP
│   ├── templates/          Escape de LaTeX, motor, template "clássico", fixtures
│   ├── ai/                 Camada de IA, agnóstica de provider
│   ├── db/                 Sessões anônimas, link mágico, jobs, migrações
│   └── i18n/               Rótulos do documento (pt-BR)
├── docker-compose.yml      Postgres (e o worker, quando a imagem construir)
└── AGENTS.md               Guia para quem for contribuir com IA
```

Cada pacote tem seu próprio `src/`, `package.json` e testes. Não é duplicação:
é o que permite testar, versionar e importar cada um isoladamente.

---

## Rodando localmente

### Pré-requisitos

- **Node.js 22** ou superior (`.nvmrc` no repositório)
- **pnpm 10** — `corepack enable` já resolve
- **Docker** — para o Postgres. Os testes não precisam dele: usam PGlite

### Passo a passo

**1. Instalar as dependências.**

```bash
git clone https://github.com/tmvinicius/cv-express.git
cd cv-express
pnpm install
```

**2. Verificar e gerar os `dist/`.**

```bash
pnpm run verificar
```

Roda build, typecheck e testes, nessa ordem. O build não é opcional: o app web
resolve os pacotes do workspace pelo `dist/` e, sem ele, falha com
`Can't resolve '@cv-express/schema'`. Rode `pnpm run build` de novo sempre que
mexer em `packages/`.

O esperado:

```
packages/schema        38 testes
packages/templates     99 testes
packages/ai            77 testes
packages/db            35 testes
apps/latex-worker      51 testes
apps/web              323 testes
─────────────────────────────────
total                 623 testes
```

**3. Subir o Postgres.**

```bash
docker compose up -d postgres
```

Ou `docker compose up -d` sem nomear serviço, que sobe o Postgres **e** o
worker do passo 4 de uma vez. Isso passou a funcionar quando a imagem do
worker voltou a construir; antes, a falha dela abortava a subida inteira e
você ficava sem nem o banco.

A migração roda sozinha na primeira subida, quando o volume está vazio: o
compose monta `packages/db/migrations/` no `docker-entrypoint-initdb.d`. Para
conferir:

```bash
docker compose exec postgres psql -U cvexpress -d cvexpress -c '\dt'
# compile_jobs, cv_sessions, magic_links
```

Se a porta 5432 já estiver ocupada por outro contêiner (um `cvexpress-pg`
criado à mão, por exemplo), remova-o antes: `docker rm -f cvexpress-pg`.

**4. Subir o worker de LaTeX.** É ele que compila o PDF.

```bash
docker compose up -d latex-worker
```

A primeira construção leva alguns minutos: ela baixa o Tectonic, compila um
documento de aquecimento e guarda o cache de pacotes LaTeX **dentro da
imagem** — o contêiner roda sem baixar nada (`--only-cached`), então o cache
precisa chegar pronto. As seguintes usam o cache do Docker e levam segundos.

Confira:

```bash
docker compose ps          # latex-worker ... Up (healthy)
curl localhost:8080/saude  # {"estado":"ok","ativas":0,"aguardando":0,"cache":0}
```

O `healthy` só aparece depois do `start_period` de 20s. Se ficar em
`starting` por mais que isso, `docker compose logs latex-worker` diz o motivo.

Este é o caminho recomendado: é o único que traz a sandbox — usuário
não-root, filesystem somente leitura, `cap_drop: ALL`, `no-new-privileges`,
limite de memória, CPU e processos. Cada opção e o que ela defende estão
comentadas no `docker-compose.yml`.

<details>
<summary><strong>Alternativa: worker direto no Node</strong> (sem sandbox — só para depurar)</summary>

Útil quando você está mexendo no código do worker e não quer reconstruir a
imagem a cada alteração. **Não use para expor o serviço:** aqui não há
nenhuma das proteções do contêiner, e LaTeX é Turing-completo.

Instale o Tectonic (Linux x86_64; para outros sistemas, pegue o binário na
[página de releases](https://github.com/tectonic-typesetting/tectonic/releases)):

```bash
mkdir -p ~/.local/bin
curl -fsSL "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%400.15.0/tectonic-0.15.0-x86_64-unknown-linux-musl.tar.gz" \
  | tar xz -C ~/.local/bin
tectonic --version          # ~/.local/bin precisa estar no PATH
```

Aqueça o cache uma vez, com rede, a partir da raiz do repositório:

```bash
export TECTONIC_CACHE_DIR="$HOME/.cache/cvexpress-tectonic"
mkdir -p /tmp/cvexpress-aquecimento
cp apps/latex-worker/aquecimento.tex packages/templates/classico/cvexpress.cls /tmp/cvexpress-aquecimento/
(cd /tmp/cvexpress-aquecimento && tectonic aquecimento.tex)
```

Sem esse passo, toda compilação falha com
`failed to open input file "tectonic-format-latex.tex"`. Refaça-o se o
`cvexpress.cls` passar a usar um pacote novo.

Depois, num terminal separado:

```bash
pnpm --filter @cv-express/latex-worker build
cd apps/latex-worker
PORT=8080 WORKER_TOKEN=token-local-nao-use-em-producao \
TECTONIC_CACHE_DIR="$HOME/.cache/cvexpress-tectonic" \
node dist/index.js
```

</details>

**5. Chamar o worker direto (opcional), para conferir antes de abrir o app.**

```bash
curl -s -X POST localhost:8080/compilar \
  -H 'content-type: application/json' \
  -H 'x-worker-token: token-local-nao-use-em-producao' \
  -d '{"templateId":"classico","cv":{ ... }}' | head -c 200
```

O cabeçalho é `x-worker-token`, **não** `Authorization: Bearer` — um `Bearer`
volta `401 Não autorizado`. Um `CvData` completo para colar está em
`apps/latex-worker/README.md`.

**6. Configurar o app web.** Crie `apps/web/.env.local`:

```bash
DATABASE_URL=postgres://cvexpress:dev@localhost:5432/cvexpress
AI_PROVIDER=mock
WORKER_URL=http://localhost:8080
WORKER_TOKEN=token-local
```

O arquivo fica em `apps/web/`, não na raiz: o Next só lê `.env*` do próprio
diretório. `AI_PROVIDER=mock` precisa estar explícito — o padrão no código é
`anthropic`, que exige chave. O `WORKER_TOKEN` tem de ser o mesmo do passo 5.

**7. Subir o app web.**

```bash
pnpm --filter @cv-express/web dev
```

Abra `http://localhost:3000`. A página inicial cria uma sessão anônima no banco
e redireciona para `/cv/<id>`, onde começa o formulário. A etapa fica na URL
(`?etapa=pessoal`, `?etapa=experiencias`...), então recarregar e voltar pelo
navegador não perdem nada.

Depois de "Habilidades", o formulário passa por "Gerando", que chama o
worker, e segue sozinho para "Seu currículo": o PDF na tela, o botão
"Baixar currículo" e o painel de seções para voltar a editar. Sem o worker
no ar, essa etapa mostra "O gerador de PDF não está disponível agora" e um
botão para tentar de novo — o currículo continua salvo.

**8. Parar.**

```bash
docker compose down        # mantém os dados no volume postgres-dados
docker compose down -v     # apaga o volume; a migração roda de novo na próxima subida
```

### Variáveis de ambiente do app web

Não há `.env.example`; estas são todas as que o app web lê.

| Variável | Obrigatória | Para quê |
|---|---|---|
| `DATABASE_URL` | sim | Conexão com o Postgres. Sem ela, nenhuma página abre |
| `AI_PROVIDER` | não | `anthropic` (padrão), `openai-compativel` ou `mock` |
| `ANTHROPIC_API_KEY` | com `anthropic` | Lida pelo SDK quando `AI_API_KEY` não é informada |
| `AI_MODEL` | com `openai-compativel` | Id do modelo. Com `anthropic`, o padrão é `claude-opus-5` |
| `AI_BASE_URL` | com `openai-compativel` | Ex.: `http://localhost:11434/v1` (Ollama) |
| `AI_API_KEY` | não | Chave explícita; opcional em modelo local |
| `AI_SUPORTE_JSON` | não | `nativo` (padrão), `modo_json` ou `nenhum` — só `openai-compativel` |
| `WORKER_URL` | para gerar o PDF | Endereço do latex-worker, ex.: `http://localhost:8080` |
| `WORKER_TOKEN` | para gerar o PDF | Token compartilhado com o worker; precisa bater com o dele |

Sem IA configurada, pedir sugestão falha e o formulário segue com o texto que
a pessoa escreveu. É o comportamento pretendido: a IA nunca bloqueia o fluxo.

### Comandos

| Comando | O que faz |
|---|---|
| `pnpm run verificar` | Build + typecheck + testes. É o portão antes de commitar |
| `pnpm run build` | Compila os pacotes de `packages/` |
| `pnpm run test` | Só os testes (para no primeiro pacote que falhar) |
| `pnpm -r --no-bail run test` | Todos os testes, mesmo com falha no meio |
| `pnpm run typecheck` | Só a checagem de tipos (inclui os arquivos de teste) |
| `pnpm --filter @cv-express/web dev` | App web em modo desenvolvimento |
| `pnpm --filter @cv-express/templates test` | Testes de um pacote só |
| `pnpm --filter @cv-express/templates test:watch` | Modo watch |

### Design system e acessibilidade

A paleta vive em `apps/web/src/estilos/paleta.ts` como **dado**, não só como
CSS, para que os testes possam lê-la:

```bash
pnpm --filter @cv-express/web exec vitest run src/estilos
```

Isso mede os 18 pares de cores em uso contra o WCAG 2.1 AA, nos dois temas, e
imprime a tabela de razões. **A build reprova se um par cair abaixo do
mínimo** — foi assim que a cor de borda original, que parecia certa, foi
pega em 2,73:1 e escurecida.

Um segundo teste compara `tokens.css` com `paleta.ts` valor a valor. A
duplicação entre os dois é intencional (o navegador precisa de variáveis, o
teste precisa de dado), e esse teste é o que impede que divirjam em
silêncio.

### Vendo o `.tex` gerado

O caminho `CvData → .tex` não precisa de LaTeX nenhum. Os snapshots em
`packages/templates/src/__tests__/__snapshots__/gerar.test.ts.snap` guardam o
`.tex` esperado para as três fixtures — mínima, completa e hostil.

A fixture hostil tem payloads de injeção em todos os campos de texto, e o
snapshot dela mostra o escape em ação: `\input{/etc/passwd}` sai como
`\textbackslash{}input\{/etc/passwd\}`.

### Compilando um PDF de verdade

O passo 4 já sobe um worker que gera PDF, **dentro do contêiner e com a
sandbox ligada**. Verificado com as três fixtures (mínima, completa e
hostil): PDF de uma página, acentuação correta, links funcionando e as
âncoras de posição no `.aux`.

A fixture hostil sai com `\input{/etc/passwd}` e `\write18{...}` impressos
como texto, e não executados. Dá para conferir você mesmo — é o melhor teste
de fumaça que existe aqui:

```bash
docker compose up -d latex-worker
# monte o payload com a fixture hostil e chame /compilar;
# o receituário está em apps/latex-worker/README.md
```

O texto sai no PDF como `\input{/etc/passwd}` literal. Nenhum arquivo do
servidor é lido: o escape verificado no LaTeX de verdade, não só em teste.

**Sobre a imagem Docker.** Ela constrói e roda. Três defeitos a impediam, e os
três estão corrigidos no `apps/latex-worker/Dockerfile`, cada um com o motivo
no comentário:

1. a imagem base `ghcr.io/tectonic-typesetting/tectonic` não é puxável
   anonimamente (responde `denied`) — hoje o Tectonic vem do tarball de
   release do GitHub, fixado por `sha256`;
2. o estágio `build` instalava as dependências de quatro pacotes e mandava
   compilar todo `packages/**`, incluindo `ai` e `db`, que não estavam
   instalados — hoje o build é restrito ao subgrafo do worker;
3. o `node_modules` de `apps/latex-worker/` não era copiado para a imagem
   final, e o contêiner subia e morria com `Cannot find package 'fastify'`.

> ⚠️ **Ancoramento vertical ainda em aberto.** A ORIGEM das coordenadas que o
> `aux.ts` extrai já foi calibrada contra um PDF real (ver `AGENTS.md` §8),
> mas o `y` gravado é um ponto, não uma caixa — desenhar uma região clicável
> exige uma altura que o `.aux` não fornece. Não afeta nada hoje: o preview
> edita pelo painel de seções, e o clique direto no PDF ainda não existe.

---

## Situação atual

| Parte | Estado |
|---|---|
| Fundação do monorepo | ✅ |
| `packages/schema` — CvData, limites, FieldId | ✅ 38 testes |
| `packages/templates` — escape, motor, template | ✅ 99 testes |
| `packages/i18n` — rótulos pt-BR | ✅ |
| `packages/ai` — camada de IA, 3 adapters | ✅ 77 testes, só contra o mock |
| `packages/db` — sessões, link mágico, jobs, migrações | ✅ 35 testes |
| `apps/latex-worker` — API, fila, cache, sandbox | ✅ 41 testes |
| `apps/web` — 6 etapas, autosave, sugestões de IA | ✅ roda localmente |
| `apps/web` — geração, preview, download, painel de seções | ✅ roda com o worker no ar |
| `apps/web` — testes | ✅ 323 testes |
| Compilação real `.tex → PDF` (Tectonic 0.15.0 e 0.17.0) | ✅ verificada fora do contêiner |
| Design system — tokens, tema escuro, contraste AA | ✅ verificado por teste |
| Postgres pelo `docker compose` | ✅ sobe e aplica a migração |
| `apps/web` — tela de boas-vindas | ➖ etapa removida por decisão (ver `formulario/etapas.ts`) |
| Botão "apagar meus dados" (LGPD) | ✅ no preview, com confirmação em dois passos |
| Envio do link mágico por e-mail | ❌ não começou |
| Clique direto no PDF para editar | ❌ não existe; origem das coordenadas calibrada, ancoramento vertical em aberto |
| Imagem Docker do worker | ✅ constrói, sobe `healthy` e compila com a sandbox ligada |
| Primeira chamada real a um provider de IA | ⚠️ nunca executada |

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

**Sem conta, sem senha.** A sessão é anônima; o link mágico é o jeito
planejado de retomá-la. O banco guarda só o hash do token, que é de uso único
e vale 7 dias.

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
