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
pnpm run verificar     # build + typecheck + testes — 273 testes devem passar
```

Se isso não passar num repositório limpo, pare e diga. Não construa em cima de
uma base quebrada.

**Rode `pnpm run verificar` antes de entregar qualquer mudança.** O build vem
antes do typecheck porque os pacotes se importam via `dist/`; um build velho
gera falhas que parecem erro de tipo e não são.

O `pnpm -r` para no primeiro pacote que falha, e os pacotes seguintes nem
rodam. Para ver o quadro inteiro de uma vez, use
`pnpm -r --no-bail run test`.

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
| Currículos de teste (mínimo, completo, hostil) | `packages/templates/src/fixtures.ts` |
| Sandbox, fila, rotas | `apps/latex-worker/src/` |
| O que a IA oferece ao resto do projeto | `packages/ai/src/servico.ts` |
| Regras contra invenção | `packages/ai/src/guardrails.ts` |
| Provider de IA e variáveis `AI_*` | `packages/ai/src/config.ts` |
| Tabelas e migração | `packages/db/src/esquema.ts`, `packages/db/migrations/` |
| Sessões, link mágico, registro de compilações | `packages/db/src/` |

**Regra prática:** se a mudança é de aparência, ela pertence ao `.cls` — o
arquivo que não contém dado de usuário nem lógica. Se é de formatação de
valor, pertence a `formatadores.ts`. Nunca ao template.

**Na IA:** o resto do projeto importa só o `CvAiService`. Nada fora de
`packages/ai` menciona modelo, prompt ou provider, e é isso que permite trocar
de provider sem refatorar. Os guardrails ficam em código, nunca só no prompt:
apontar `AI_PROVIDER` para um modelo menor não pode enfraquecer a regra de não
inventar.

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

Um pacote só enxerga de outro o que está declarado em `exports` no
`package.json` e existe no `dist/`. O build exclui `__tests__/`, então nada
dali pode ser importado de fora.

Foi o que aconteceu com as fixtures: o worker importava
`@cv-express/templates/fixtures`, mas elas moravam em `__tests__/` e o subpath
não existia. A suíte do servidor HTTP (18 testes) nunca chegou a carregar.
Por isso `fixtures.ts` fica em `src/`, com subpath próprio, e não é
reexportado pelo `index.ts`, para que código de produção não o importe.

Ao criar um subpath: declare-o em `exports`, confira que o arquivo sai no
`dist/` e rode `pnpm run verificar`.

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

- **`apps/web`** — o formulário de 9 etapas e o preview. É também quem vai
  montar `@cv-express/ai` e `@cv-express/db`: hoje nenhum app os consome.
- **Envio do e-mail do link mágico.** `packages/db` gera o token, guarda só o
  hash e faz o resgate de uso único. Nada envia o e-mail.

## 8. A dívida que você precisa saber

**Nada de LaTeX foi compilado de verdade.** O ambiente onde este código foi
escrito não tinha Docker nem Tectonic. Sem verificação:

- a construção da imagem
- a compilação `.tex → PDF`
- o `cvexpress.cls`
- a macro `\cvCampo` e o formato real do `.aux`
- a origem das coordenadas em `aux.ts`

Tudo de `CvData` até `.tex` **está** testado, assim como o contrato HTTP, a
fila, o cache e o parse do `.aux` contra arquivo sintético.

Se você for a primeira pessoa a compilar, o roteiro está em
`apps/latex-worker/README.md`. E se algo ali estiver errado, **corrija o
comentário junto com o código** — os avisos de "não verificado" devem sumir
quando deixarem de ser verdade.

**Nenhum provider de IA real é chamado nos testes.** A suíte de contrato de
`packages/ai` roda só contra o `MockAdapter`, em três modos de suporte a JSON.
Os adapters Anthropic e OpenAI-compatível não são exercitados contra uma API
de verdade. O `contrato.test.ts` diz que o roteiro para isso está no README do
pacote, mas esse README ainda não existe.

`packages/db` não tem essa dívida: os testes aplicam a migração de produção no
PGlite, que é o próprio Postgres, e exercitam o SQL real.
