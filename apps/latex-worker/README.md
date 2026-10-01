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
