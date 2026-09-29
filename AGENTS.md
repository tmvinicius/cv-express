# AGENTS.md

Guia para assistentes de código que forem contribuir com o CV Express.

Leia isto antes de escrever a primeira linha. O projeto tem invariantes que
parecem detalhes de estilo e não são — quebrá-las abre falha de segurança ou
defeito silencioso. Cada regra aqui existe porque a alternativa custa caro, e o
motivo está junto: se você discordar com um argumento melhor, traga o
argumento em vez de seguir a regra no automático.

---

## 1. Antes de qualquer coisa

```bash
pnpm install
pnpm run verificar     # build + typecheck + lint + testes — 623 testes devem passar
```

Se isso não passar num repositório limpo, pare e diga. Não construa em cima de
uma base quebrada.

**Rode `pnpm run verificar` antes de entregar qualquer mudança.** O build vem
antes do typecheck porque os pacotes se importam via `dist/`; um build velho
gera falhas que parecem erro de tipo e não são.

**São dois portões, e o de entrega é o segundo:**

| Comando | Cobre | Quando |
|---|---|---|
| `pnpm run verificar` | build dos `packages/**`, typecheck, lint, testes | laço de desenvolvimento |
| `pnpm run verificar:completo` | tudo acima **mais** `tsc` do worker e `next build` do web | antes de entregar e no CI |

A separação existe porque `next build` leva dezenas de segundos e não paga
esse custo a cada alteração. Mas ele precisa rodar em algum momento: erro de
Server Component, import de `node:` em código de cliente e falha de prerender
**só aparecem ali** — e são a classe de erro mais cara, a que só apareceria no
deploy. O mesmo vale para o `tsc` do worker, cujos testes rodam de `src/` via
Vitest e não passam pelo build.

Para ver o app no navegador, o passo a passo está em "Rodando localmente", no
`README.md`. O caminho que funciona hoje é
`docker compose up -d` (sobe Postgres e worker), `apps/web/.env.local` com
`DATABASE_URL`, `AI_PROVIDER=mock`, `WORKER_URL` e `WORKER_TOKEN`, e
`pnpm --filter @cv-express/web dev`. O `WORKER_TOKEN` tem de ser o mesmo dos
dois lados, e o cabeçalho do worker é `x-worker-token`, não
`Authorization: Bearer`.

---

## 2. As cinco invariantes

Estas não são preferências. Uma mudança que as quebre está errada, mesmo que
os testes passem.

### 2.1 Todo dado do usuário passa por `escapeLatex`

**Por quê:** LaTeX é Turing-completo. `\input{/etc/passwd}` no campo "cargo" lê
arquivos do servidor; `\write18` executa comandos. Um `}` solto fecha o comando
que envolve o campo e o resto do template passa a ser interpretado fora de
contexto.

**Na prática:**

- O ponto único é `packages/templates/src/escape.ts`. Não crie um segundo.
- O motor de templates escapa toda interpolação. Não adicione sintaxe que
  insira texto sem escape — foi por isso que Handlebars foi descartado (o
  `{{{ }}}` dele não se desliga por configuração).
- `confiarComoLatex()` existe só para literais do próprio projeto. Se aparecer
  perto de qualquer coisa vinda de `CvData`, é defeito.
- URLs usam `escapeLatexUrl` (percent-encoding), nunca `escapeLatex`. No
  `\href` o escape por contrabarra produziria uma URL diferente da pretendida.

**Se mexer aqui,** rode `packages/templates/src/__tests__/ataques.test.ts` e
acrescente um caso para o vetor que você mudou.

### 2.2 O worker nunca aceita `.tex` de fora

Ele recebe `CvData` e gera o `.tex` internamente. Um endpoint que aceitasse
`.tex` seria um endpoint de execução remota de LaTeX: quem o alcançasse
contornaria todo o escape.

Não adicione um campo `tex` ao contrato "para facilitar o preview". O preview
gera o próprio `.tex` localmente — a geração é determinística, os dois batem.

### 2.3 A geração é determinística

O mesmo `CvData` produz o mesmo `.tex`, byte a byte. O cache de compilação
depende disso: o `contentHash` é a chave.

**O que quebra determinismo, em ordem de frequência:**

| Armadilha | Correção |
|---|---|
| `Date.now()` / `new Date()` na geração | Receba a data por parâmetro |
| `Math.random()` / `nanoid()` na geração | Ids vêm do `CvData`, já gravados |
| `Object.keys()` para iterar dados | Percorra caminhos declarados |
| `.sort()` sem desempate | Sempre desempate por um segundo critério |
| `localeCompare` sem locale fixo | Use `Intl.Collator("pt-BR")` |
| Texto não normalizado | `sanitizarTexto` aplica NFC antes do escape |

O teste que protege isso é "gera bytes idênticos em execuções repetidas", em
`gerar.test.ts`. Se ele falhar, é porque você introduziu uma das linhas acima.

### 2.4 `descricaoOriginal` e `textoOriginal` são imutáveis

A IA escreve em `bullets` e `itens`, **nunca** por cima do original. Isso
sustenta o "desfazer" e é a prova de que nada foi inventado — o produto inteiro
se apoia nessa promessa.

Não "otimize" removendo o texto original quando os bullets existem.

### 2.5 O log do LaTeX nunca chega ao cliente

Ele contém caminhos absolutos do servidor e nomes de arquivos internos. Vai
para o log estruturado, indexado pelo `requestId`; o cliente recebe só o id.

O teste "500 em falha do LaTeX, SEM vazar o log" protege isso.

---

## 3. Onde as coisas ficam

| Preciso mexer em... | Vá para |
|---|---|
| Forma do currículo, campos, validação | `packages/schema/src/cv.ts` |
| Limites de tamanho | `packages/schema/src/limites.ts` |
| Datas, períodos, ordenação | `packages/schema/src/data.ts` |
| Identificador de campo editável | `packages/schema/src/campo.ts` |
| Contrato HTTP do worker | `packages/schema/src/worker.ts` |
| Escape de LaTeX | `packages/templates/src/escape.ts` |
| Sintaxe de template | `packages/templates/src/motor/renderizar.ts` |
| Formatação (datas, níveis, agrupamentos) | `packages/templates/src/formatadores.ts` |
| O que o template enxerga | `packages/templates/src/viewModel.ts` |
| Aparência do PDF | `packages/templates/classico/cvexpress.cls` |
| Ordem e presença das seções | `packages/templates/classico/main.tex.hbs` |
| Rótulos impressos no PDF | `packages/i18n/src/pt-BR.ts` |
| Sandbox, fila, rotas | `apps/latex-worker/src/` |
| Currículos de teste (mínimo, completo, hostil) | `packages/templates/src/fixtures.ts` |
| O que a IA oferece ao resto do projeto | `packages/ai/src/servico.ts` |
| Regras contra invenção | `packages/ai/src/guardrails.ts` |
| Provider de IA e variáveis `AI_*` | `packages/ai/src/config.ts` |
| Tabelas e migrações | `packages/db/src/esquema.ts`, `packages/db/migrations/`, `migracoes.ts` |
| Cor, espaçamento, tipografia da **interface** | `apps/web/src/estilos/` |
| Etapas do formulário, validação por etapa | `apps/web/src/formulario/` |
| Critério de progresso, estado de cada etapa | `apps/web/src/formulario/maquina.ts` |
| Avisos de data incoerente (não bloqueantes) | `apps/web/src/formulario/coerencia.ts` |
| Toda mudança no `CvData` feita pelo formulário | `apps/web/src/formulario/reducer.ts` |
| Fronteira navegador ↔ servidor (Server Actions) | `apps/web/src/acoes/servidor.ts` |
| Sinal de "a IA funciona neste ambiente?" | `packages/ai/src/config.ts`, `apps/web/src/acoes/capacidades.ts` |
| Texto que a pessoa lê quando a IA falha | `apps/web/src/componentes/mensagensIa.ts` |
| O que o autosave aceita gravar; chamada ao worker | `apps/web/src/acoes/sessao.ts`, `compilar.ts` |
| Montagem do formulário na rota | `apps/web/src/componentes/FormularioCliente.tsx` |
| Quando o PDF é gerado e o que o preview mostra | `apps/web/src/preview/useCompilacao.ts` |

**Sobre a interface:** a aparência vive em `estilos/`, os componentes em
`componentes/`. Um componente traz estrutura, semântica e `aria-*`; nenhum
deles decide cor ou espaçamento — é a mesma separação que o `.cls` faz do
lado do LaTeX. Não introduza Tailwind nem estilo inline: o motivo completo
está no topo de `estilos/componentes.css`.

Ao mexer numa cor, mude nos **dois** lugares (`paleta.ts` e `tokens.css`) e
rode `pnpm --filter @cv-express/web exec vitest run src/estilos`. Há um teste
que reprova a divergência e outro que mede o contraste contra o WCAG AA.

**Regra prática:** se a mudança é de aparência, ela pertence ao `.cls` — o
arquivo que não contém dado de usuário nem lógica. Se é de formatação de
valor, pertence a `formatadores.ts`. Nunca ao template.

**Sobre as Server Actions:** `DATABASE_URL`, `WORKER_TOKEN` e a chave da IA
só são lidos no servidor. A lógica fica em `acoes/sessao.ts` e
`acoes/compilar.ts`, que rodam sem o Next e têm testes; `servidor.ts` só
resolve configuração e aplica o `"use server"`. Lógica escrita direto numa
Server Action deixa de ser testável sem subir o Next. Falha de IA e worker
fora do ar devolvem resultado tratado, nunca exceção que derrube a página: a
pessoa não pode perder o que preencheu.

---

## 4. Armadilhas deste projeto

Coisas que já deram errado aqui, para você não repetir.

### O motor: bloco sobre lista **itera** e troca o contexto

```
{{# experiencias }}{{> experiencias }}{{/ experiencias }}   ← ERRADO
{{# tem.experiencias }}{{> experiencias }}{{/ tem.experiencias }}   ← certo
```

No primeiro caso o partial recebe um *item* como contexto e perde acesso a
`secoes` e ao resto do ViewModel. Para testar presença sem iterar, use os
booleanos de `vm.tem`.

Mesma pegadinha com bullets: testar a lista abriria um `\begin{cvBullets}` por
bullet. Use `temBullets`.

### Bloco **testa**, interpolação **exige**

`{{# telefone }}` não lança se o campo não existir. `{{ telefone }}` lança.
É deliberado: permite campos opcionais sem abrir mão da falha ruidosa. Campo
opcional sempre dentro de um bloco.

### Linha em branco no `.tex` é quebra de parágrafo

Uma tag de bloco sozinha numa linha tem a linha inteira removida pelo motor,
justamente por isso. Se você mexer no parser, não perca esse comportamento —
o sintoma é espaçamento estranho no PDF, difícil de rastrear até o template.

### `sp` não é `pt` não é `bp`

O TeX mede em *scaled points* (65536 sp = 1 pt = 1/72,27 pol); o PDF mede em
*big points* (1/72 pol). A diferença é de 0,37% — invisível no topo da página,
visível no rodapé. A conversão está em `apps/latex-worker/src/aux.ts` e é o
único lugar que traduz coordenadas.

### `exactOptionalPropertyTypes` está ligado

```ts
{ ...base, cidade: undefined }          // ERRADO: a chave existe
{ ...base, ...(cidade ? { cidade } : {}) }   // certo: a chave não existe
```

Importa porque o motor usa a ausência da chave como teste de existência.

### Testes: verifique por subtração, não por padrão

A suíte de ataques remove as sequências que o escaper tem permissão de emitir e
exige que nenhum contrabarra sobre. Procurar por "contrabarra seguido de letra"
parece equivalente, mas acusa o próprio `\textbackslash{}` **e** deixa passar
qualquer ataque cuja forma você não previu.

A primeira versão desse helper usava busca por padrão e reportou 16 falhas
falsas contra escape correto.

### Importar entre pacotes exige `exports` **e** `dist/`

Um pacote só enxerga de outro o que está declarado em `exports` e existe no
`dist/`. O build exclui `__tests__/`, então nada dali pode ser importado de
fora — por isso `fixtures.ts` fica em `src/`, com subpath próprio.

O `apps/web` não é exceção. O `transpilePackages` do `next.config.ts` faz o
Next compilar os pacotes, mas a resolução continua passando pelo `exports`,
que aponta para o `dist/`. Sem `pnpm run build`, o `next dev` falha com
`Can't resolve '@cv-express/schema'`.

### `%` em URL dentro do argumento de uma macro vira comentário

O `\href` aceita `%` cru só quando lê a URL diretamente. Aqui a URL chega
dentro de `\cvLink{...}`, que está dentro de `\cvContato{...}`: quando o LaTeX
lê esse argumento, `%` já vale como comentário, engole o resto da linha com as
chaves de fechamento, e a compilação morre com "File ended while scanning use
of \cvContato". Por isso o `escapeLatexUrl` emite `\%5F`, e não `%5F`; o link
no PDF sai com `%` normal. O teste de ataques exige que nenhum `%` saia sem
contrabarra.

### Fonte pelo nome do arquivo, nunca pelo nome da família

`\setmainfont{Latin Modern Roman}` pede a fonte ao fontconfig do sistema:
falha onde ela não está instalada e faz o Tectonic varrer as fontes da
máquina, o que torna o PDF dependente do ambiente. O `cvexpress.cls` carrega
`lmroman10`/`lmsans10` pelo arquivo `.otf`, que vem no bundle do Tectonic. Se
trocar de fonte, faça o mesmo — e reaqueça o cache (ver README).

### `.env` do app web mora em `apps/web/`

O Next só lê `.env*` do diretório do próprio app. Um `.env` na raiz do
monorepo é ignorado em silêncio, e o sintoma é
`DATABASE_URL não configurada.` com o arquivo "claramente ali".

---

## 5. Convenções

**Idioma.** Nomes de domínio e comentários em português; palavras-chave da
linguagem em inglês. `cargo`, `experiencias`, `escapeLatex`. Mensagens de
commit em inglês.

**Comentários explicam o porquê, não o quê.** `// incrementa o contador` não
ajuda ninguém. `// SIGKILL porque TeX em laço de expansão ignora sinal
capturável` ajuda. Quando uma decisão tem alternativa defensável, registre a
alternativa e o motivo da escolha — quem ler daqui a seis meses vai querer
reabrir a discussão sem contexto.

**Testes provam comportamento, não cobertura.** Um teste que só confirma que a
função foi chamada não paga o próprio custo. Prefira: entrada real, saída
esperada, e um comentário dizendo qual defeito ele impede.

**Commits.** Conventional Commits em inglês, granulares. O mantenedor commita —
**não crie commits**, a menos que ele peça explicitamente. Entregue os arquivos
e, junto, a lista de commits sugeridos (arquivos → mensagem).

---

## 6. Divergir do planejamento é permitido

Três decisões deste código contrariam o documento de planejamento, todas de
propósito e todas registradas no comentário do arquivo:

1. **`FieldId` por id estável**, não por índice (`campo.ts`) — índice é
   posição, não identidade; apagar um item faria o identificador apontar para
   outro, silenciosamente.
2. **Motor próprio** em vez de Handlebars (`renderizar.ts`) — o escape do
   Handlebars é de HTML, e obter escape de LaTeX exigiria sobrescrever um
   interno da biblioteca, que poderia reverter em silêncio para o padrão
   inseguro.
3. **Worker recebe `CvData`**, não `.tex` (`worker.ts`) — ver invariante 2.2.

O padrão a seguir: divergir quando houver motivo forte, **registrar a
divergência no código, no ponto onde ela vive**, e dizer ao mantenedor. O que
não vale é divergir em silêncio.

---

## 7. O que ainda não existe

Não invente que existe:

`packages/ai`, `packages/db` e `apps/web` **existem**. A rota `/cv/[id]` desenha
as 6 etapas de dados (pessoal, objetivo, experiências, formação, idiomas,
habilidades), com autosave e sugestões de IA. Depois delas, "gerando" chama o
worker pela `acaoCompilar` e segue sozinha para "preview", que mostra o PDF, o
download, o aviso de páginas e o painel de seções. A orquestração está em
`FormularioCliente.tsx` e `preview/useCompilacao.ts`. O que ainda não existe:

- **Envio do link mágico por e-mail.** `packages/db` tem toda a lógica —
  token, hash, uso único, validade. Falta o disparo via Resend, a rota de
  resgate e a tela que ofereça o link. É o único caminho de recuperação de
  sessão que existe no plano, e hoje a URL é a única chave: quem fecha o
  navegador ou troca de aparelho perde o currículo.
- **Execução da retenção de 30 dias.** `expurgarExpiradas` existe e só roda em
  teste; nada a agenda. `buscarSessao` apenas ignora linhas vencidas, não as
  apaga.
- **`compile_jobs` ligada.** A tabela e `packages/db/src/jobs.ts` estão
  prontos e produção não os chama; `concluirJob` exige um `pdfUrl` que o fluxo
  atual (PDF em base64 no corpo) não tem como preencher.
- **Sobreposição de regiões clicáveis no PDF.** A origem das coordenadas já
  foi calibrada (seção 8); o que falta é o ancoramento vertical — o `.aux` dá
  um ponto, e desenhar uma região exige uma altura. O plano B, o painel
  lateral de seções, está na rota e é o caminho de edição.
- **`.env.example` e script de migração.** As variáveis estão na tabela do
  `README.md`; a migração roda pelo `initdb` do compose ou por
  `aplicarMigracoes()` de `@cv-express/db`.
- **Segundo template.** Só existe o `classico`.

## 8. A dívida que você precisa saber

**A imagem Docker do worker constrói e roda.** `docker compose up -d` sobe
Postgres e worker, os dois `healthy`, e o worker compila as três fixtures —
inclusive a hostil — sob `read_only`, `cap_drop: ALL`, `no-new-privileges`,
`pids_limit` e teto de memória.

Ela já não construiu, e vale saber quais eram os cinco defeitos, porque três
deles são armadilhas que voltam sozinhas se alguém mexer no `Dockerfile`:

1. **Imagem base impossível de puxar.** `ghcr.io/tectonic-typesetting/tectonic`
   responde `denied` ao pull anônimo. Hoje o Tectonic vem do tarball de
   release do GitHub, fixado por `sha256` — e o build musl é estaticamente
   linkado, o que dispensou seis pacotes `apt` de libs de fonte na imagem
   final.
2. **Install e build discordando.** O estágio copiava quatro `package.json` e
   mandava compilar todo `packages/**`, incluindo `ai` e `db`, cujas
   dependências nunca eram instaladas. Hoje o build é restrito ao subgrafo do
   worker (`--filter "@cv-express/latex-worker..."`), que é schema, i18n e
   templates. **Não amplie o install para consertar isso** — `ai` e `db` não
   têm o que fazer numa imagem que só compila LaTeX.
3. **`node_modules` do worker não copiado.** O pnpm não achata dependências na
   raiz: cada projeto tem o seu `node_modules` com symlinks. Sem copiar
   `apps/latex-worker/node_modules`, a imagem constrói, sobe e morre com
   `Cannot find package 'fastify'`.
4. **`pnpm prune --prod` destrói os links.** Ele apaga o `node_modules` de
   cada projeto e deixa só o store `.pnpm`, com o mesmo sintoma do item 3. Use
   `pnpm install --prod`, que refaz os links. E exporte `CI=true`, senão o
   pnpm aborta pedindo confirmação de TTY.
5. **`TMPDIR` debaixo do tmpfs.** A imagem criava `/tmp/cvexpress` e apontava
   `TMPDIR` para lá, mas o contêiner monta um tmpfs sobre `/tmp` inteiro, que
   esconde o diretório da imagem — `ENOENT ... mkdtemp`. Hoje `TMPDIR=/tmp`.

Faltou também um `.dockerignore`: sem ele, `COPY packages/` levava o
`node_modules` do host por cima da instalação do contêiner — uma floresta de
symlinks apontando para caminhos da máquina de origem.

**O LaTeX já foi compilado de verdade**, com o Tectonic 0.15.0, dentro e fora
do contêiner. Ficaram verificados:

- a compilação `.tex → PDF` das três fixtures, inclusive a hostil, cujo
  conteúdo sai impresso como texto;
- o `cvexpress.cls`, que precisou de duas correções para compilar (seção 4);
- a macro `\cvCampo` e o formato real do `.aux`: três entradas por campo, e o
  `aux.ts` extrai as posições do arquivo real.

A **origem das coordenadas** em `aux.ts` foi calibrada (Tectonic 0.17.0,
fixture `completa`): a posição relatada para `pessoal.nome` cai exatamente
sobre as margens declaradas pela classe — x = 51,024 bp = 1,8 cm e
841,89 − y = 45,355 bp = 1,6 cm. Origem no canto inferior esquerdo, y para
cima, conversão sp→bp correta.

Continua em aberto o **ancoramento vertical**: o y gravado é o ponto de
referência corrente, não o topo nem a base do texto, então desenhar um
retângulo clicável ainda exige uma altura que o `.aux` não fornece. Só importa
quando o clique direto no PDF existir; o roteiro está em
`apps/latex-worker/README.md`.

Se algo ali estiver errado, **corrija o comentário junto com o código** — os
avisos de "não verificado" devem sumir quando deixarem de ser verdade.

**Nenhum provider de IA real foi chamado.** A suíte de contrato de
`packages/ai` roda só contra o `MockAdapter`. Os adapters Anthropic e
OpenAI-compatível nunca falaram com uma API de verdade.

`packages/db` não tem essa dívida: os testes aplicam a migração de produção no
PGlite, que é o próprio Postgres, e o Postgres do compose já subiu com ela.
