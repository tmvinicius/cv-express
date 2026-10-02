# latex-worker

Serviço de compilação LaTeX. Recebe `CvData`, devolve PDF.

O app web o chama pelo servidor (`apps/web/src/acoes/compilar.ts`), com o
token interno — o navegador nunca fala com o worker. A chamada parte das
telas "gerando" e preview do formulário.

## Rotas

| Rota | Autenticação | Resposta |
|---|---|---|
| `GET /saude` | pública | Estado, compilações ativas, fila e tamanho do cache |
| `POST /compilar` | `x-worker-token` | PDF em base64, nº de páginas, posições dos campos, `contentHash` |

Erros seguem o contrato de `packages/schema/src/worker.ts`: um `codigo`, uma
mensagem para o usuário e o `requestId`. O log do LaTeX nunca vai no corpo.

## Subir sem Docker

Para desenvolver no worker. A partir da raiz:

```bash
pnpm install
pnpm run build                                  # pacotes de packages/
pnpm --filter @cv-express/latex-worker build    # o worker

cd apps/latex-worker
PORT=8080 WORKER_TOKEN=um-token-qualquer \
TECTONIC_CACHE_DIR="$HOME/.cache/cvexpress-tectonic" \
node dist/index.js
```

Sem o binário `tectonic` no `PATH` (ou em `TECTONIC_BIN`), o worker sobe e
responde `/saude`, mas `/compilar` devolve 500 `FALHA_LATEX`. O motivo real
(`spawn tectonic ENOENT`) aparece só no log do servidor.

O `TECTONIC_CACHE_DIR` precisa ser gravável fora do contêiner: o padrão,
`/opt/tectonic-cache`, é o cache pré-aquecido da imagem. Fora dela, o Tectonic
baixa os pacotes LaTeX na primeira compilação — então este modo **não tem a
sandbox de rede** da imagem. Serve para desenvolver, não para expor.

## Subir com Docker

O jeito mais simples é o `docker-compose.yml` da raiz (`docker compose up -d
--build`), que já traz as opções abaixo. Para rodar só o worker:

```bash
docker build -f apps/latex-worker/Dockerfile -t cvexpress-worker .

docker run --rm -p 8080:8080 \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=256m \
  --memory 512m \
  --cpus 1 \
  --pids-limit 128 \
  --init \
  --security-opt no-new-privileges \
  --cap-drop ALL \
  -e WORKER_TOKEN=um-token-qualquer \
  cvexpress-worker
```

**O tmpfs é em `/tmp` inteiro, com 256m.** Este README chegou a mandar
`--tmpfs /tmp/cvexpress:...,size=64m`, e com esse comando toda compilação
falhava: a imagem usa `TMPDIR=/tmp`, o `--read-only` deixa `/tmp` sem
escrita, e o `mkdtemp` morre com `ENOENT`. O Dockerfile explica o porquê no
comentário do `ENV TMPDIR`; 64m também não comporta um PDF com fontes
embutidas.

A construção da imagem precisa de acesso a `github.com` (o binário do
Tectonic) e a `relay.fullyjustified.net` (o bundle de LaTeX que vai pronto no
cache). Na execução, nenhum dos dois: o worker compila com `--only-cached`.

As opções acima **não são enfeite** — são a segunda camada de sandbox
(a primeira está em `src/tectonic.ts`). Vale entender cada uma antes de
remover qualquer uma delas:

| Opção | Contra o quê |
|---|---|
| `--read-only` | Escrita fora do tmpfs falha |
| `--tmpfs ... noexec` | Binário gravado em /tmp não roda |
| `--memory 512m` | Bomba de expansão do TeX não derruba o host |
| `--cpus 1` | Laço infinito não trava a máquina inteira |
| `--pids-limit 128` | Bomba de fork não derruba o host |
| `--init` | Colhe os processos zumbis das compilações abortadas por SIGKILL |
| `--cap-drop ALL` | Nenhuma capability de kernel |
| `no-new-privileges` | Bloqueia escalada por setuid |

**Sobre a rede.** O ideal seria `--network none`, mas com ele o contêiner
não aceita conexão nenhuma — e o `-p` deixa de funcionar. O bloqueio de
SAÍDA fica para a plataforma (regra de egress no Fly.io/Railway, política de
rede no Kubernetes). Não é equivalente, e o `docker-compose.yml` registra o
mesmo aviso.

## Verificar

```bash
curl localhost:8080/saude

curl -X POST localhost:8080/compilar \
  -H 'content-type: application/json' \
  -H 'x-worker-token: um-token-qualquer' \
  -d '{"cv": { ... } }' | jq -r .pdf | base64 -d > cv.pdf
```

Para um `CvData` válido sem escrever à mão, use as fixtures de
`@cv-express/templates/fixtures` (`cvMinimo`, `cvCompleto`, `cvExtremo`).

## O que já foi conferido em compilação real

Com **Tectonic 0.17.0** e a fixture `completa`:

- o `cvexpress.cls` compila, com as fontes carregadas pelo nome do arquivo;
- a macro `\cvCampo` grava as três entradas por campo (`@x`, `@y`, `@p`) no
  `.aux`, com espaços em volta do fieldId que `aux.ts` corta;
- as coordenadas de `aux.ts` foram calibradas contra essa compilação;
- a contagem de páginas vem do `.aux` (`\@abspage@last`), porque o PDF que o
  xdvipdfmx emite guarda as páginas num object stream comprimido, onde a
  busca por `/Type /Page` não acha nada.

**Ainda por conferir:** a imagem construída com o 0.17.0. Ela fixava 0.15.0
até esta correção, e a troca foi feita num ambiente sem Docker. Ao construir,
o estágio `latex` compila `aquecimento.tex` como teste de fumaça — se o
`.cls` não compilar com a versão da imagem, o build falha ali, e não em
produção. Confira também a acentuação (`ção ã õ é ê á`) no PDF gerado pela
imagem.

Se as posições falharem, **o produto continua de pé**: o preview usa o
painel lateral de seções, que o planejamento define como caminho principal.
A edição por clique é aprimoramento, não requisito.

## Alterando a aparência do PDF

Toda a aparência do currículo mora num arquivo só:
**`packages/templates/classico/cvexpress.cls`**. Ele não contém dado de usuário
nem lógica — mudar o visual nunca exige tocar no template (`main.tex.hbs`), no
escape ou no worker.

| Quero mudar... | Onde, no `.cls` | Dificuldade |
|---|---|---|
| Cores | Bloco `Cores` (`\definecolor`) | Trivial |
| Margens e tamanho do papel | Bloco `Geometria` (`geometry`) | Trivial |
| Tamanho do nome e dos títulos | `\cvNome`, `\cvSecao` (`\fontsize`) | Trivial |
| Espaçamento entre itens | `\vspace` dentro de cada macro | Trivial |
| Estilo dos bullets | Ambiente `cvBullets` (`label`, `leftmargin`) | Fácil |
| Fonte | `\setmainfont` / `\setsansfont` | Exige reconstruir a imagem |

### Cores

Quatro cores nomeadas, usadas pelo resto do arquivo:

```latex
\definecolor{cvTexto}{HTML}{1A1A1A}     % texto corrido
\definecolor{cvSuave}{HTML}{5A5A5A}     % contatos, empresa, datas
\definecolor{cvDestaque}{HTML}{1F4E5F}  % nome, títulos de seção, links
\definecolor{cvLinha}{HTML}{D4D4D4}     % reservada para filetes
```

Troque o hex e pronto. Para mudar a cor de **um elemento só**, edite a macro
dele — o nome, por exemplo, usa `\color{cvDestaque}` dentro de `\cvNome`.

Atenção: o filete abaixo dos títulos (`\hrule` em `\cvSecao`) hoje herda
`cvTexto`, e não usa `cvLinha`. Para um filete mais claro, envolva-o:
`{\color{cvLinha}\hrule height 0.6pt width \textwidth}`.

Lembre que currículo costuma ser impresso em preto e branco e lido por
sistemas de triagem: mantenha o texto escuro sobre fundo branco.

### Tamanhos, margens e espaçamento

```latex
% Margens (bloco Geometria)
top=1.6cm, bottom=1.6cm, left=1.8cm, right=1.8cm

% Nome: 22pt, entrelinha 26pt (em \cvNome)
\fontsize{22}{26}\selectfont

% Títulos de seção: 12pt (em \cvSecao)
\fontsize{12}{14}\selectfont
```

O texto corrido usa `\small` nas macros `\cvItem`, `\cvParagrafo`,
`\cvBullets`, `\cvHabilidades` e `\cvIdioma`. Trocar por `\normalsize` aumenta
a letra — e, junto, a chance de passar de uma página.

Para títulos de seção sem caixa alta, tire o `\MakeUppercase` de `\cvSecao`.
Para outro marcador de bullet, troque `label=\textbullet` em `cvBullets` (por
exemplo, `label=--`).

### Fonte

A fonte é carregada **pelo nome do arquivo**, não pelo nome da família, e vem
do bundle do próprio Tectonic. Isso é obrigatório: o worker roda sem rede e
sem fontes do sistema, então só enxerga o que está no cache da imagem. Pedir
pelo nome da família (`\setmainfont{Times New Roman}`) falha no contêiner.

**Times New Roman é proprietária e não está no bundle.** O equivalente livre é
a **TeX Gyre Termes**:

```latex
\setmainfont{texgyretermes}[
  Extension      = .otf,
  UprightFont    = *-regular,
  BoldFont       = *-bold,
  ItalicFont     = *-italic,
  BoldItalicFont = *-bolditalic,
]
```

Outras opções do bundle, no mesmo formato: `texgyrepagella` (estilo Palatino),
`texgyreheros` (estilo Helvetica — boa como `\setsansfont`) e `texgyreschola`
(estilo Century Schoolbook).

`\setmainfont` vale para o texto corrido; `\setsansfont` vale para o nome e
os títulos de seção (que usam `\sffamily`). Mude um, o outro ou os dois.

### Depois de qualquer mudança

1. **Suba a `versao` em `packages/templates/classico/manifest.json`**
   (ex.: `1.0.0` → `1.1.0`). O `contentHash` — a chave do cache de PDFs do
   worker — cobre o `.tex`, o `templateId` e essa versão, mas **não** o
   `.cls`. Sem subir a versão, um currículo já compilado continua saindo do
   cache com a aparência antiga, e parece que a mudança não funcionou. A
   versão também fica registrada em cada compilação, para reproduzir um PDF
   antigo.
2. **Rode `pnpm run verificar`.** Os snapshots de `packages/templates` testam
   só o `.tex`, então mudança de aparência não deve alterá-los; se algum
   mudar, algo além do visual foi mexido.
3. **Reconstrua a imagem:** `docker compose build latex-worker`. Para cor,
   tamanho e margem isso só atualiza o arquivo; para **fonte nova** é
   indispensável, porque o estágio de aquecimento compila o próprio `.cls` e é
   ali que a fonte entra no cache.
4. **Se a fonte não existir no bundle, o build falha** no teste de fumaça, com
   o erro do LaTeX no log — e não na primeira requisição em produção.
5. **Gere um currículo pela interface** e confira o PDF: acentos
   (`ção ã õ é ê á`), quebra de página e o aviso de páginas, que muda se a
   letra ficar maior.

As coordenadas do `.aux` (edição por clique) são calculadas pelo próprio TeX
em cada compilação, então mudar fonte, tamanho ou margem não exige recalibrar
`aux.ts`.

## Configuração

| Variável | Padrão | Para quê |
|---|---|---|
| `PORT` | 8080 | |
| `HOST` | 0.0.0.0 | Interface em que o servidor escuta |
| `WORKER_TOKEN` | — | Obrigatório em produção; o processo não sobe sem ele |
| `CONCORRENCIA` | 2 | Compilações simultâneas |
| `FILA_MAXIMA` | 50 | Acima disso, responde 503 |
| `TIMEOUT_COMPILACAO_MS` | 10000 | SIGKILL no Tectonic |
| `CORPO_MAXIMO_BYTES` | 524288 | Teto do corpo da requisição |
| `CACHE_MAXIMO` | 100 | PDFs guardados em memória |
| `CACHE_TTL_MS` | 1800000 | Validade da entrada de cache |
| `LOG_LEVEL` | info | Nível do log do Fastify |
| `TECTONIC_BIN` | tectonic | Caminho do binário do Tectonic |
| `TECTONIC_CACHE_DIR` | /opt/tectonic-cache | Cache de pacotes LaTeX; fora do contêiner, aponte para um diretório gravável |

## Por que o worker não aceita `.tex`

Ele recebe `CvData` e gera o `.tex` ele mesmo. Um endpoint que aceitasse
`.tex` arbitrário seria, por definição, um endpoint de execução remota de
LaTeX: quem o alcançasse — um SSRF no app web, um contêiner comprometido, uma
regra de rede frouxa — mandaria `\input{/etc/passwd}` direto, contornando todo
o escape do `packages/templates`.

Recebendo `CvData`, não existe caminho até o Tectonic que pule o escape.
