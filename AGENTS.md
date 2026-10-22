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
pnpm run verificar            # build + typecheck + lint + testes — 799 testes
pnpm run verificar:completo   # o mesmo + build do worker e `next build`
pnpm run e2e                  # navegador de verdade; precisa de build e DATABASE_URL
```

O CI (`.github/workflows/ci.yml`) roda a cada push e PR o
`verificar:completo`, o E2E, o build do app como a Vercel o faz (clone sem
`dist/`) e a imagem Docker do worker compilando currículos de verdade. Ele
existe porque o `main` ficou quebrado duas vezes sem ninguém notar. Um job
vermelho não é ruído para contornar: é o defeito que chegaria à produção.

O `verificar` NÃO roda o `next build`, e o `next build` é o único passo que
checa a fronteira entre página de servidor e componente de cliente como ela
vai para produção. O `main` chegou a ter o `verificar` quebrado e o app
impossível de implantar ao mesmo tempo: três refatorações mudaram o contrato
do lado do servidor (resultado da IA como código, prop `capacidades`, fim de
"boas-vindas") sem atualizar quem o consumia. Antes de entregar mudança em
`apps/web`, rode o `verificar:completo`.

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

A mesma regra vale para qualquer erro do servidor: `app/error.tsx` mostra só
o `digest` (o código que liga a tela à linha do log), nunca `error.message`.

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
| Trocar de provider (roteiro e contrato contra provider real) | `packages/ai/README.md` |
| Tabelas e migração | `packages/db/src/esquema.ts`, `packages/db/migrations/` |
| Aplicar migrações (`pnpm migrar`) | `packages/db/src/cli/migrar.ts` |
| Variáveis de ambiente do web, comentadas (e o teste que as mantém completas) | `apps/web/.env.example`, `apps/web/src/__tests__/envExemplo.test.ts` |
| Privacidade, "apagar meus dados", currículo inexistente | `apps/web/src/app/privacidade/`, `componentes/ApagarMeusDados.tsx`, `app/dados-apagados/`, `app/cv/[id]/not-found.tsx` |
| Sessões, link mágico, limites de uso | `packages/db/src/` |
| Regra do "Concluir e salvar" (prazo de 5 dias, link reutilizável) | `packages/db/src/linkMagico.ts` |
| Envio de e-mail (Resend, console) e o texto do e-mail | `apps/web/src/email/` |
| Limite de envio (contador no Postgres) | `packages/db/src/limites.ts` |
| Quantos e-mails por IP e por destinatário | `apps/web/src/acoes/concluir.ts` (`LIMITE_POR_*`) |
| Cotas da IA e da compilação, teto diário da IA, sessões novas por IP, limite do autosave | `apps/web/src/acoes/cotas.ts` |
| O autosave que vem do navegador (cota + gravação) | `apps/web/src/acoes/sessao.ts` (`salvarDoNavegador`) |
| Tokens gastos pela IA, por dia: onde se anota / onde fica | `apps/web/src/acoes/ia.ts` (`anotarUso`) / `packages/db/src/usoIa.ts`, tabela `uso_ia` |
| Acessibilidade medida no navegador (axe, troca de etapa) | `e2e/testes/acessibilidade.spec.ts` |
| Título da aba em cada etapa | `apps/web/src/formulario/etapas.ts` (`tituloDaEtapa`), usado no `generateMetadata` de `app/cv/[id]/page.tsx` |
| Foco e rolagem na troca de etapa | `apps/web/src/componentes/FormularioCliente.tsx` (efeito sobre `etapaInicial`) |
| Implantação: banco, migrações, worker, Vercel | `IMPLANTACAO.md` |
| Comando de build da Vercel | `apps/web/vercel.json` (`buildCommand`), provado pelo job `vercel` do CI |
| Fumaça contra a imagem do worker no ar | `e2e/imagem/`, `e2e/playwright.imagem.config.ts` (`pnpm --filter @cv-express/e2e imagem`) |
| Título, descrição e prévia de compartilhamento (Open Graph), ícone | `apps/web/src/compartilhamento/metadados.ts`, `app/opengraph-image.tsx`, `app/icon.svg` |
| Cabeçalhos de segurança (fixos) e a CSP com nonce | `apps/web/src/seguranca/cabecalhos.ts`; aplicados em `next.config.ts` e `src/middleware.ts` |
| Página de erro e 404 genérico | `apps/web/src/app/error.tsx`, `app/not-found.tsx` |
| Testes de ponta a ponta e o Tectonic falso | `e2e/` |
| CI | `.github/workflows/ci.yml` |
| Página inicial (onde a sessão nasce) | `apps/web/src/app/page.tsx`, `componentes/Comecar.tsx`, `acoes/sessao.ts` (`comecar`) |
| Expurgo diário: o que apaga / quem chama | `packages/db/src/expurgo.ts` / `apps/web/src/app/api/tarefas/expurgo/` + `apps/web/vercel.json` |
| A ação "Concluir e salvar" e o destino do link | `apps/web/src/acoes/concluir.ts`, `apps/web/src/app/retomar/[token]/` |
| Quais etapas existem, validação e progresso | `apps/web/src/formulario/etapas.ts`, `maquina.ts` |
| Toda mudança no `CvData` feita pelo formulário | `apps/web/src/formulario/reducer.ts` |
| Quando e como o autosave dispara | `apps/web/src/formulario/useAutosave.ts` |
| O que o autosave aceita gravar (rascunho × malformado) | `apps/web/src/acoes/sessao.ts` |
| Fronteira navegador ↔ servidor (Server Actions) | `apps/web/src/acoes/servidor.ts` |
| Conexão com o Postgres (uma por processo) | `apps/web/src/acoes/banco.ts` |
| Chamada ao latex-worker | `apps/web/src/acoes/compilar.ts` |
| Telas de cada etapa | `apps/web/src/componentes/etapas/` |
| Montagem do formulário | `apps/web/src/componentes/FormularioCliente.tsx` |
| Telas "gerando" e preview (compilação, download, painel) | `apps/web/src/componentes/etapas/Resultado.tsx` |
| Preview, painel de seções, aviso de páginas | `apps/web/src/componentes/`, `apps/web/src/preview/` |
| O desenho das páginas do PDF (PDF.js) | `apps/web/src/preview/PaginasPdf.tsx` |
| Versões forçadas de dependências indiretas, e por quê | `pnpm-workspace.yaml` (`overrides`) |
| Limite do corpo das Server Actions | `apps/web/next.config.ts` (`CORPO_MAXIMO_BYTES`) |

**Regra prática:** se a mudança é de aparência, ela pertence ao `.cls` — o
arquivo que não contém dado de usuário nem lógica. Se é de formatação de
valor, pertence a `formatadores.ts`. Nunca ao template.

**Na IA:** o resto do projeto usa só o `CvAiService`. O único ponto fora de
`packages/ai` que monta o provider é a composição em
`apps/web/src/acoes/servicoIa.ts`, via `criarProviderDoAmbiente()`. Nenhum outro
arquivo menciona modelo, prompt ou provider, e é isso que permite trocar de
provider sem refatorar. Os guardrails ficam em código, nunca só no prompt:
apontar `AI_PROVIDER` para um modelo menor não pode enfraquecer a regra de não
inventar.

**No web:** segredo não atravessa para o navegador. `DATABASE_URL`,
`WORKER_TOKEN` e a chave da IA são lidos só em Server Actions e páginas de
servidor. A lógica fica em `acoes/sessao.ts` e `acoes/compilar.ts`, que rodam
sem o Next e têm testes; `servidor.ts` só resolve configuração e aplica o
`"use server"`. Mantenha essa divisão: lógica dentro de uma Server Action
deixa de ser testável sem subir o Next.

Falha de IA e worker fora do ar nunca derrubam o formulário. A pessoa segue com
o próprio texto e o currículo continua salvo. Não troque esses retornos de
erro tratados por exceções que cheguem à tela.

**Banco no web:** página e Server Action pegam a conexão em `obterBanco()`
(`acoes/banco.ts`). Nunca chame `criarConexao` por requisição: cada chamada
é um `Pool` novo, e as páginas re-renderizam a cada troca de etapa. Medido:
180 carregamentos derrubaram o Postgres com `too many clients already`; com o
pool compartilhado, o mesmo teste fica em 3 conexões.

**Prazo da sessão concluída:** depois de "Concluir e salvar", a sessão expira
em `concluidoEm` + 5 dias e NADA renova esse prazo — nem ler, nem salvar, nem
resgatar o link, nem concluir de novo. `buscarSessao` e `salvarCv` respeitam
isso; uma função nova que mexa em `expiraEm` precisa respeitar também, senão
o prazo que a pessoa leu no e-mail deixa de ser verdade. E `concluirSessao`
usa `FOR UPDATE`: o teste dele no PGlite passa mesmo sem a trava (uma conexão
só), então não a remova por isso — sem ela, medido em Postgres real, 10
cliques simultâneos dispararam 5 e-mails.

**Limite de envio:** o limite é aplicado DENTRO de `concluirSessao`, pelo
`permitirEnvio`, e só quando um e-mail novo vai sair. Não o mova para antes
(um "já enviado" gastaria cota) nem para depois (um envio bloqueado já teria
disparado o prazo de 5 dias). O IP vem do `x-forwarded-for`, que na Vercel é
escrito pela plataforma; atrás de outro proxy, confirme que ele SOBRESCREVE
o cabeçalho, senão o cliente escolhe o próprio IP. E, como o `FOR UPDATE`,
a atomicidade do contador não é provada pelo PGlite — foi medida em
Postgres real (0 de 20 rodadas de 50 pedidos simultâneos passaram do teto).

**O que custa passa pela porta:** toda Server Action que chame a IA ou o
worker passa antes por `autorizarIa` ou `autorizarCompilacao`
(`acoes/cotas.ts`). O `sessionId` que chega do navegador é uma ALEGAÇÃO, não
uma identidade: sem `sessaoAtiva`, qualquer cota por sessão se contorna
inventando um id por pedido. Três regras que os testes cobram e que parecem
otimizáveis sem ser:

- a ordem é sessão → cota da sessão → cota do IP → teto global. Um pedido
  recusado mais cedo não gasta a cota seguinte; invertida, uma aba em laço
  consome o teto do dia de todo mundo;
- a falha é FECHADA: banco fora do ar recusa a IA e a compilação, em vez de
  liberar sem contar;
- `sessaoAtiva` não renova o prazo. Perguntar não é usar.

E nenhum GET cria sessão. A sessão nasce no POST do botão "Começar", com
limite por IP; uma página que crie sessão ao abrir volta a gravar uma linha
por robô e devolve ao atacante sessões de graça para rodar as cotas.

O autosave também tem porta: a Server Action de salvar chama
`salvarDoNavegador`, que confere a sessão e conta o salvamento antes de
gravar. Era a única ação pública que escrevia no banco sem contar nada. O
`salvarEtapa` continua existindo para quem já passou por outra porta (o
"Concluir e salvar", com os limites de envio) — uma Server Action nova que
grave o currículo usa o `salvarDoNavegador`, não o `salvarEtapa` direto.

**Uso da IA:** cada chamada anota os tokens na tabela `uso_ia`, somados por
dia e operação, inclusive na falha. A anotação nunca derruba a resposta: se
o banco falha, a sugestão chega e o log diz o que faltou. A tabela não tem
texto, sessão nem IP, e por isso fica fora do expurgo — não acrescente
coluna que identifique alguém sem colocá-la no expurgo e em `/privacidade`.

**Rotas e o link do e-mail:** a página do link mora em
`app/retomar/[token]/`, porque é o caminho que `concluir.ts` põe no e-mail.
Ela já foi parar em `app/cv/retomar/`, o build quebrou e todo link enviado
daria 404; há teste amarrando os dois agora. A cópia antiga em
`app/cv/retomar/` ficou no repositório por um tempo depois da mudança — se
aparecer de novo, apague.

**Migrações:** toda migração nova precisa ser IDEMPOTENTE (`IF NOT EXISTS`,
`DO $$ … IF EXISTS`) e entrar em `MIGRACOES`. O `pnpm migrar` não guarda
quais já rodaram — aplica todas, sempre —, e isso só é seguro porque
`migracoes.test.ts` aplica tudo duas vezes e reprova arquivo esquecido.

**Prazos escritos para a pessoa** (`/privacidade`, a página de currículo
inexistente) vêm das constantes do código, nunca de número digitado: uma
política que diz 30 dias enquanto o banco guarda 60 é uma promessa falsa
por escrito. Ao criar texto novo que cite prazo, importe a constante.

**Sugestão da IA pendente:** o estado da sugestão vive no
`FormularioCliente`, fora do redutor, e morre junto com o texto que a
originou. Ao acrescentar uma ação que mude `descricaoOriginal` ou
`textoOriginal`, inclua-a no `switch` de `despacharELimpar` — senão "Usar
sugestão" grava tópicos de um texto que a pessoa já reescreveu, e a promessa
da invariante 2.4 cai por um caminho que o redutor não enxerga.

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

### A CSP só funciona com página renderizada por requisição

O middleware gera um nonce por requisição, e o Next o carimba nos próprios
`<script>` — mas só quando renderiza naquela requisição. Uma página gerada
no build sai com scripts sem nonce: o navegador os bloqueia, o HTML aparece
e nada responde ao clique. Por isso o layout raiz é `force-dynamic`. Não o
remova para "ganhar desempenho" numa página estática; o teste de cabeçalhos
do E2E confere o nonce de `/dados-apagados` e do 404 justamente por isso.

Três regras da política que parecem afrouxáveis e não são, ou parecem
apertáveis e quebram:

- **Nada de `unsafe-inline` em `script-src`.** É o que a CSP inteira impede.
- **Estilo em atributo, sim; `<style>`, não.** `style-src-attr 'unsafe-inline'`
  existe pela barra de progresso. Um componente novo que precise de
  `<style>` embutido vai ser bloqueado — use o CSS de `estilos/`.
- **`Referrer-Policy` não pode ser `no-referrer`.** Com ela o navegador manda
  `Origin: null` no POST de formulário e o Next recusa a Server Action:
  medido, o "Começar" sem JavaScript passou a responder 500.

Ao mudar a política, rode o E2E: ele falha em qualquer violação de CSP
durante o fluxo, e uma violação não aparece em teste unitário nenhum — o
navegador só bloqueia e escreve no console.

### O preview não pode voltar a depender do leitor de PDF do navegador

Ele era um `<iframe>` com o PDF. No computador, funcionava; no celular, onde
está boa parte do público, não: o Chrome do Android não mostra PDF dentro da
página, e o Safari do iPhone mostra só a primeira. Hoje as páginas são
desenhadas pelo PDF.js (`PaginasPdf.tsx`), e o `<iframe>` só entra se o
PDF.js falhar. Três detalhes que parecem otimizáveis e quebram:

- **O PDF.js recebe uma CÓPIA dos bytes.** Ele transfere o buffer para o
  worker, e o original fica vazio — inclusive para o link de download.
- **O build é o `legacy`.** O moderno exige navegador recente, e o público
  inclui aparelhos antigos presos em versões velhas do iOS.
- **As páginas novas entram todas de uma vez**, depois de prontas. Trocar uma
  a uma faz a tela piscar a cada edição.

A tela "gerando" não desenha o PDF: ela sai para o preview no instante em que
ele fica pronto, e desenhar ali era desenhar duas vezes (medido).

### `opacity` em texto contorna a suíte de contraste

A suíte de `estilos/` mede as cores DECLARADAS na paleta. Um `opacity: 0.55`
no rótulo da trilha mistura o texto com o fundo e o deixou em 2,48:1 (o AA
pede 4,5:1), com a suíte verde. Para marcar estado (etapa ainda não
alcançável, item opcional), use forma — borda pontilhada, peso, ícone —, não
transparência. Há um teste que reprova `opacity:` em `componentes.css`, e o
axe do E2E mede o que o navegador desenha. Se um dia precisar de
transparência num elemento sem texto, mude o teste com o motivo ao lado.

Do mesmo jeito, cada tela de etapa tem um `<h1>` (a posição na trilha, em
`BarraProgresso.tsx`): é por ele que o leitor de tela anuncia onde a pessoa
está. Não o troque por `<span>` para "acertar o tamanho" — o CSS já o deixa
com a aparência de antes.

### Trocar de etapa é navegar no cliente — e o navegador não faz nada sozinho

Ter o `<h1>` não bastava: depois de "Continuar", o foco ficava no botão,
nada era anunciado e, no celular, a etapa nova abria rolada para baixo.
Duas peças resolvem, e as duas são necessárias:

- **o título da aba muda com a etapa** (`tituloDaEtapa`). É o que o
  anunciador do Next lê numa navegação no cliente; com título igual em duas
  etapas, a troca entre elas volta a ser muda. Há teste exigindo um título
  por etapa;
- **o `FormularioCliente` rola ao topo e foca o `<h1>`** a cada troca — não
  na primeira renderização, e não quando a navegação aponta um item da
  lista, porque ali o foco é da `ListaEditavel`. Uma navegação nova que
  precise focar outra coisa entra nessa mesma exceção, senão o efeito do
  formulário (que roda depois do dos filhos) rouba o foco dela.

O E2E confere a passagem numa tela de celular; o axe sozinho não pega isso,
porque mede cada tela parada.

### Teste com PGlite no app web roda no ambiente `node`

O `apps/web` testa no jsdom por padrão, e o PGlite 0.5 usa
`Blob.arrayBuffer`, que o jsdom não tem: todo teste de servidor que abria
um banco falhou com `r.arrayBuffer is not a function` (era o que segurava o
PR do Dependabot com o PGlite, o `pg` e o SDK da IA). Arquivo de teste novo
que use o PGlite começa com `// @vitest-environment node`, como os quatro de
`acoes/__tests__/`.

### Dependência de teste no worker vai parar dentro da imagem

O Dockerfile instala tudo para compilar e depois roda `pnpm install --prod`.
Isso tira os atalhos das dependências de desenvolvimento, mas os arquivos
ficam em `node_modules/.pnpm` e são copiados para o estágio final — medido
com o `pdfjs-dist`: 35 MB a mais dentro da sandbox. Por isso a fumaça da
imagem mora em `e2e/`, e o `apps/latex-worker` não tem `devDependencies`.
Se um dia precisar ter, troque a cópia do `node_modules` por `pnpm deploy
--prod` e meça o estágio final.

### Falha da IA também gasta token

O `Resultado` de `packages/ai` traz `uso` nos dois ramos, sucesso e falha. Uma
sugestão descartada pelo guardrail já pagou as duas tentativas, e é
justamente o caso caro. Um caminho de falha novo em `servico.ts` precisa
devolver o que já foi gasto até ali; devolver zero faria a tabela `uso_ia`
subestimar o custo exatamente quando o modelo se comporta mal.

### Versões forçadas (`overrides`) têm prazo de validade

`pnpm-workspace.yaml` força versões corrigidas de dependências INDIRETAS
(postcss do Next, shell-quote do `gel`, …), cada uma com o motivo ao lado.
Ao atualizar o pacote que as traz, rode `pnpm audit --prod` sem a linha: se
continuar limpo, apague-a. Override esquecido vira a versão velha de amanhã.

### O E2E não apaga nada, e por isso cada teste usa IP e e-mail novos

O banco do E2E pode ser o mesmo de ontem, com os contadores de limite de
ontem. Cada contexto de navegador manda um `x-forwarded-for` de
documentação sorteado, e o fluxo usa um e-mail com carimbo de hora (o limite
é de 3 links por dia por destinatário). Um teste novo que use IP ou e-mail
fixos passa na primeira execução e falha na quarta.

O `apps/web` não é exceção. O `transpilePackages` do `next.config.ts` faz o
Next compilar os pacotes, mas a resolução continua passando pelo `exports`,
que aponta para o `dist/`. Sem `pnpm run build`, o `next dev` e o `next build`
falham com `Can't resolve '@cv-express/schema'`. O comentário no
`next.config.ts` diz o contrário e está errado.

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

Cinco decisões deste código contrariam o documento de planejamento, todas de
propósito e todas registradas no comentário do arquivo:

1. **`FieldId` por id estável**, não por índice (`campo.ts`) — índice é
   posição, não identidade; apagar um item faria o identificador apontar para
   outro, silenciosamente.
2. **Motor próprio** em vez de Handlebars (`renderizar.ts`) — o escape do
   Handlebars é de HTML, e obter escape de LaTeX exigiria sobrescrever um
   interno da biblioteca, que poderia reverter em silêncio para o padrão
   inseguro.
3. **Worker recebe `CvData`**, não `.tex` (`worker.ts`) — ver invariante 2.2.
4. **Link mágico reutilizável por 5 dias**, não de uso único por 7
   (`linkMagico.ts`) — regra do mantenedor: o mesmo link serve quantas vezes
   a pessoa quiser até o prazo. O custo (um e-mail encaminhado é uma chave até
   o prazo) e o que o limita estão no comentário do arquivo.
5. **Sem tabela `compile_jobs`** (`migrations/0003_remover_compile_jobs.sql`)
   — o planejamento a previa para cache de PDF e para reproduzir um PDF
   antigo. Nenhum PDF é guardado, e a sessão só tem o CvData mais recente, então
   a tabela não servia a nenhum dos dois; nada jamais gravou nela. Se um dia
   houver armazenamento de PDF, ela volta numa migração nova, desenhada para
   o que existir então.

O padrão a seguir: divergir quando houver motivo forte, **registrar a
divergência no código, no ponto onde ela vive**, e dizer ao mantenedor. O que
não vale é divergir em silêncio.

---

## 7. O que ainda não existe

Não invente que existe:

O fluxo inteiro existe e roda na rota `/cv/[id]`: as 6 etapas de dados, a
trilha de etapas, o autosave, as sugestões de IA, "gerando" (compila e segue
sozinha) e o preview com download, aviso de páginas e painel de seções que
leva direto ao item. O que ainda falta:

- **Nada do escopo da V1 no planejamento.** O que falta é de operação, não de
  código — ver a seção 8: o contato de privacidade, revisão jurídica do
  texto de `/privacidade`, o primeiro envio real pelo Resend, a imagem do
  worker construída com o Tectonic 0.17.0 e o cron da Vercel rodando de fato.
- **A sobreposição de regiões clicáveis no PDF** continua fora da V1, como o
  planejamento previu: a edição acontece pelo painel de seções.

## 8. A dívida que você precisa saber

**Antes de abrir ao público** — nada disto se resolve com código:

1. `PRIVACIDADE_CONTATO` definido. Sem ele, `/privacidade` diz que o canal
   não está configurado, e a LGPD exige um.
2. O texto de `/privacidade` revisado por quem responde juridicamente. Ele
   descreve o que o código faz, conferido linha a linha, mas não substitui
   revisão.
3. `CRON_SECRET` definido na Vercel, e a primeira execução do expurgo
   conferida no log (`[expurgo] concluído`).
4. Conta no Resend com o domínio do remetente verificado, e um envio real
   testado — nenhum saiu até hoje.
5. O job `imagem` do CI verde — a imagem construída com o Tectonic 0.17.0 e
   PDFs de verdade gerados por ela —, e a mesma fumaça contra o worker de
   produção.
6. `IA_TETO_DIARIO` ajustado ao orçamento da IA. O padrão (1000 pedidos por
   dia) é um número de partida, não uma medida de custo. A medida passa a
   existir com o primeiro dia de uso real, na tabela `uso_ia` (consulta no
   README).
7. O `main` protegido para exigir o CI antes do merge. O CI já roda verde no
   GitHub; os jobs `vercel` e `imagem` são os mais novos.

O passo a passo de implantação está em `IMPLANTACAO.md`. Ele foi escrito sem
nenhuma implantação real: quem implantar primeiro, corrija o que estiver
errado ali.

**O que JÁ foi verificado em compilação real, com Tectonic 0.17.0:** o
`cvexpress.cls` (fontes carregadas pelo nome do arquivo), a macro `\cvCampo`
e o formato do `.aux`, a origem e a escala das coordenadas em `aux.ts`, e a
contagem de páginas lida do `.aux`. Os detalhes estão nos comentários de cada
arquivo e nos testes que usam o `.aux` e o PDF reais como fixture.

**A imagem Docker agora fixa o Tectonic 0.17.0** — a mesma versão das
medições. Ela fixava 0.15.0 enquanto `paginas.test.ts` afirmava "a mesma
toolchain do worker". O SHA-256 do 0.17.0 foi calculado sobre o artefato
oficial do release. **A imagem inteira ainda não foi construída fora do
CI.** Em 17/10, com Docker mas sem acesso a `github.com` nem ao host do
bundle (`relay.fullyjustified.net`), o estágio `build` construiu, e o estágio
final subiu com toda a sandbox do compose usando um Tectonic falso. O
estágio `latex` e a compilação real dentro da imagem são o job `imagem` do
CI. Quando ele passar pela primeira vez, apague este parágrafo.

**O fluxo de ponta a ponta é verificado com Tectonic FALSO** — agora por
uma suíte fixa em `e2e/`, e não mais à mão: Postgres real, worker real e
`next start`, dirigidos por um navegador, do "Começar" ao link do e-mail
aberto em outro navegador. O que o Tectonic falso não prova é a composição —
e essa é a parte que a verificação acima cobre.

Se algo em `apps/latex-worker/README.md` estiver errado, **corrija o
comentário junto com o código** — os avisos de "não verificado" devem sumir
quando deixarem de ser verdade, e os de "verificado" devem dizer com qual
versão.

**As dependências de DESENVOLVIMENTO ainda têm vulnerabilidades conhecidas**
(10 em 14/10, 3 críticas), todas do Vitest 2 e do `drizzle-kit`. Nenhuma vai
para produção — `pnpm audit --prod` está limpo — e as críticas exigem coisas
que o projeto não usa (a interface web do Vitest). A correção é subir para o
Vitest 4, uma versão major que mexe na configuração de testes dos seis
pacotes; ficou como tarefa separada.

**Nenhum modelo de IA de verdade foi chamado até hoje.** No `pnpm test` e no
CI, a suíte de contrato de `packages/ai` roda contra o `MockAdapter`, em três
modos de suporte a JSON. As mesmas asserções rodam contra um provider real
com `pnpm --filter @cv-express/ai contrato:real`, com o roteiro em
`packages/ai/README.md`. Essa execução foi verificada só contra um servidor
OpenAI-compatível FALSO, local: prova a ligação (ambiente → adapter → HTTP →
validação → guardrails), e um falso que inventa número reprovou como devia.
A primeira execução contra a Anthropic ou o Ollama é a prova que falta. Quem
fizer, registre o modelo e o resultado no README do pacote.

`packages/db` não tem essa dívida: os testes aplicam a migração de produção no
PGlite, que é o próprio Postgres, e exercitam o SQL real.
