# CV Express

Gerador de currículos: o usuário preenche um formulário em etapas, uma IA
organiza o texto das experiências sem inventar nada, e o sistema devolve um PDF
bonito — composto em LaTeX, sem que o usuário jamais veja LaTeX.

> **Estado: em desenvolvimento.** O backend de geração está pronto e testado;
> a interface web ainda não existe. Veja [Situação atual](#situação-atual).

## O problema

Escrever currículo trava a maioria das pessoas, por dois motivos: a folha em
branco — não saber como descrever a própria experiência — e o resultado feio,
em Word mal formatado. LaTeX resolve o segundo com elegância, mas exige
conhecimento técnico que o público-alvo não tem.

A proposta é ficar com a qualidade tipográfica do LaTeX e jogar fora a
exigência técnica.

## Como funciona

```
Formulário (9 etapas)
   ↓  autosave a cada etapa
CvData ......................... JSON canônico, validado por Zod
   ↓  polimento opcional por IA (experiências e habilidades)
CvData enriquecido
   ↓  ViewModel + motor de templates
arquivo .tex ................... todo dado do usuário escapado
   ↓  Tectonic, em contêiner isolado
PDF + nº de páginas + mapa de posições
   ↓
Preview no navegador  →  clique numa seção  →  edita  →  recompila
```

O **`CvData` é a única fonte de verdade**. O `.tex` e o `.pdf` são artefatos
derivados, descartáveis e sempre reconstruíveis. É isso que torna a edição
simples: não existe merge entre "o que o usuário editou no LaTeX" e "o que
estava no formulário", porque o usuário nunca edita LaTeX.

## Tecnologias

| Camada     | Escolha                      | Por quê                                                           |
| ---------- | ---------------------------- | ----------------------------------------------------------------- |
| Linguagem  | TypeScript 5.9, modo estrito | `noUncheckedIndexedAccess` e `exactOptionalPropertyTypes` ligados |
| Runtime    | Node.js 22                   |                                                                   |
| Monorepo   | pnpm workspaces 10           | Dependências estritas: um pacote só enxerga o que declarou        |
| Validação  | Zod 3                        | Um schema só, usado no cliente, no servidor e na borda            |
| Composição | LaTeX via Tectonic           | Engine moderna, ~200 MB, sem instalar TeX Live inteiro            |
| Servidor   | Fastify 5                    |                                                                   |
| Testes     | Vitest 2                     | 174 testes                                                        |
| Ids        | nanoid                       | Ids estáveis por item de lista                                    |
| IA         | *ainda não implementada*     | Camada agnóstica de provider — ver [Planejamento](#planejamento)  |

Sem Handlebars, sem LangChain, sem ORM ainda. Cada dependência ausente foi uma
decisão, não um esquecimento — os motivos estão nos comentários do código e no
`AGENTS.md`.

## Estrutura

```
cv-express/
├── apps/
│   └── latex-worker/       Serviço de compilação (Fastify + Tectonic)
├── packages/
│   ├── schema/             CvData, limites, FieldId, contrato HTTP
│   ├── templates/          Escape de LaTeX, motor, template "clássico"
│   └── i18n/               Rótulos do documento (pt-BR)
└── AGENTS.md               Guia para quem for contribuir com IA
```

Cada pacote tem seu próprio `src/`, `package.json` e testes. Não é duplicação:
é o que permite testar, versionar e importar cada um isoladamente.

---

## Rodando localmente

### Pré-requisitos

- **Node.js 22** ou superior (`.nvmrc` no repositório)
- **pnpm 10** — `corepack enable` já resolve
- **Docker** — só para compilar PDF de verdade; os testes rodam sem ele

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
apps/latex-worker      41 testes
─────────────────────────────────
total                 174 testes
```

O build vem antes porque os pacotes se importam via `dist/` — um build velho
produz falhas confusas.

### Comandos

| Comando                                          | O que faz                                                |
| ------------------------------------------------ | -------------------------------------------------------- |
| `pnpm run verificar`                             | Build + typecheck + testes. É o portão antes de commitar |
| `pnpm run build`                                 | Compila todos os pacotes                                 |
| `pnpm run test`                                  | Só os testes                                             |
| `pnpm run typecheck`                             | Só a checagem de tipos (inclui os arquivos de teste)     |
| `pnpm --filter @cv-express/templates test`       | Testes de um pacote só                                   |
| `pnpm --filter @cv-express/templates test:watch` | Modo watch                                               |

# 

### Compilando um PDF de verdade

Precisa de Docker. A partir da raiz:

```bash
docker build -f apps/latex-worker/Dockerfile -t cvexpress-worker .

docker run --rm -p 8080:8080 \
  --read-only \
  --tmpfs /tmp/cvexpress:rw,noexec,nosuid,size=64m \
  --memory 512m --cpus 1 \
  --security-opt no-new-privileges --cap-drop ALL \
  -e WORKER_TOKEN=token-local \
  cvexpress-worker
```

Depois:

```bash
curl localhost:8080/saude
```

As opções do `docker run` **não são enfeite** — são a segunda camada de
sandbox. `apps/latex-worker/README.md` explica o que cada uma defende e traz
o roteiro de conferência da primeira compilação.

> ⚠️ **Nunca verificado.** A compilação `.tex → PDF` não pôde ser exercitada
> no ambiente em que o código foi escrito (sem Docker disponível). Isso inclui
> o `cvexpress.cls`, a macro `\cvCampo` e a origem das coordenadas em
> `aux.ts`. Se você for a primeira pessoa a rodar, siga o roteiro no README do
> worker — e conte o que deu.

---

## Situação atual

| Parte                                           | Estado             |
| ----------------------------------------------- | ------------------ |
| Fundação do monorepo                            | ✅                  |
| `packages/schema` — CvData, limites, FieldId    | ✅ 38 testes        |
| `packages/templates` — escape, motor, template  | ✅ 95 testes        |
| `packages/i18n` — rótulos pt-BR                 | ✅                  |
| `apps/latex-worker` — API, fila, cache, sandbox | ✅ 41 testes        |
| Compilação real `.tex → PDF`                    | ⚠️ nunca executada |
| `packages/ai` — camada de IA                    | ❌ não começou      |
| `apps/web` — formulário e preview               | ❌ não começou      |

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
