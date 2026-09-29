# latex-worker

Serviço de compilação LaTeX. Recebe `CvData`, devolve PDF.

O app web o chama pelo servidor (`apps/web/src/acoes/compilar.ts`), com o
token interno — o navegador nunca fala com o worker. A chamada acontece nas
etapas "gerando" e "preview" do formulário.

## Rotas

| Rota | Autenticação | Resposta |
|---|---|---|
| `GET /saude` | pública | Estado, compilações ativas, fila e tamanho do cache |
| `POST /compilar` | `x-worker-token` | PDF em base64, nº de páginas, posições dos campos, `contentHash` |

Erros seguem o contrato de `packages/schema/src/worker.ts`: um `codigo`, uma
mensagem para o usuário e o `requestId`. O log do LaTeX nunca vai no corpo.

## Subir sem Docker

É o caminho que funciona hoje. A partir da raiz:

```bash
pnpm install
pnpm run build                                  # pacotes de packages/
pnpm --filter @cv-express/latex-worker build    # o worker

cd apps/latex-worker
PORT=8080 WORKER_TOKEN=um-token-qualquer \
TECTONIC_CACHE_DIR="$HOME/.cache/cvexpress-tectonic" \
node dist/index.js
```

Antes da primeira compilação, duas coisas precisam existir (o passo a passo
completo está no README da raiz, passo 4):

1. **O binário `tectonic`** no `PATH`, ou apontado por `TECTONIC_BIN`. Sem
   ele, `/compilar` devolve 500 `FALHA_LATEX`, e o motivo real
   (`spawn tectonic ENOENT`) aparece só no log do servidor.
2. **O cache aquecido** em `TECTONIC_CACHE_DIR`. O worker roda o Tectonic
   com `--only-cached` e **não baixa nada**, nem fora do contêiner. Com o
   cache vazio, toda compilação falha com
   `failed to open input file "tectonic-format-latex.tex"`. Para aquecer,
   compile uma vez, com rede, o `aquecimento.tex` junto com o
   `cvexpress.cls`, usando o mesmo `TECTONIC_CACHE_DIR` — é o que o estágio
   `latex` do Dockerfile faz.

O padrão de `TECTONIC_CACHE_DIR`, `/opt/tectonic-cache`, é o cache da imagem;
fora dela, aponte para um diretório seu. Este modo **não tem a sandbox** do
contêiner. Serve para desenvolver, não para expor.

## Subir com Docker

O caminho recomendado é o compose, que já traz todas as opções de sandbox:

```bash
docker compose up -d latex-worker
docker compose ps            # latex-worker ... Up (healthy)
curl localhost:8080/saude
```

Na mão, o equivalente — este comando foi executado e compila as três
fixtures:

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

O contexto do build é a **raiz do monorepo**, não `apps/latex-worker/` — por
isso o `-f`. A primeira construção leva alguns minutos: ela baixa o Tectonic
e compila o `aquecimento.tex` para popular o cache dentro da imagem.

**O tmpfs vai em `/tmp`, não em `/tmp/cvexpress`.** O Tectonic e o próprio
Node escrevem direto em `/tmp`, e com `--read-only` qualquer escrita fora do
tmpfs falha. A imagem define `TMPDIR=/tmp` para casar com isso; montar o
tmpfs num subdiretório faz a primeira compilação morrer com
`ENOENT ... mkdtemp`.

As opções acima **não são enfeite** — são a segunda camada de sandbox
(a primeira está em `src/tectonic.ts`). Vale entender cada uma antes de
remover qualquer uma delas:

| Opção | Contra o quê |
|---|---|
| `--read-only` | Escrita fora do tmpfs falha |
| `--tmpfs ... noexec` | Binário gravado em /tmp não roda |
| `--memory 512m` | Bomba de expansão do TeX não derruba o host |
| `--cpus 1` | Laço infinito não trava a máquina inteira |
| `--cap-drop ALL` | Nenhuma capability de kernel |
| `no-new-privileges` | Bloqueia escalada por setuid |

**Sobre a rede, com honestidade.** O ideal seria `--network none`, e a imagem
foi construída para isso: o cache do Tectonic vem pronto dentro dela
justamente para o contêiner não precisar baixar nada (`--only-cached` em
`tectonic.ts`). Mas um serviço que precisa RECEBER HTTP não pode ficar sem
rede — com `--network none` o worker sobe inalcançável.

Então a rede existe, e o bloqueio de SAÍDA fica para a plataforma: regra de
egress no Fly.io/Railway, ou NetworkPolicy no Kubernetes. Não é equivalente, e
vale registrar que não é. O que continua valendo em qualquer ambiente: sem
shell, tempo limite, filesystem somente leitura, `cap_drop ALL` e usuário
não-root.

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

## O que conferir na primeira compilação

A primeira compilação real foi feita com o Tectonic 0.15.0, fora do
contêiner. Ela quebrou em dois pontos, os dois já corrigidos: a fonte pedida
pelo nome da família (o `.cls` agora carrega pelo arquivo) e o `%` das URLs
dentro do argumento do `\cvContato` (o escape agora emite `\%`). Situação de
cada item:

1. **A imagem constrói.** ❌ Não constrói — veja o aviso acima. Depois de
   corrigida, o estágio `latex` compila `aquecimento.tex`, que é teste de
   fumaça: se o `cvexpress.cls` tiver erro, o build falha ali, e não em
   produção.

2. **Acentuação no PDF.** ✅ Conferida: `ção ã õ é ê á` saem corretos no
   aquecimento e nas três fixtures.

3. **As âncoras de posição.** ✅ Conferidas: o `.aux` real tem as três
   entradas por campo (`@x`, `@y`, `@p`), e o `aux.ts` extrai as posições
   dele (11 campos na fixture completa). O `@p` real vem como
   `\default{}\page{1}\abspage{1}`, e não só `\abspage{1}`.

4. **Calibrar as coordenadas.** ⚠️ Pendente. `src/aux.ts` assume origem no
   canto inferior esquerdo, y para cima. Gere um currículo de uma página e
   compare a posição relatada para `pessoal.nome` com a real. Se estiver
   espelhada na vertical ou deslocada por uma polegada, o ajuste é em
   `converterPosicao()` — e só ali.

Se (3) ou (4) falharem, **o produto continua de pé**: o preview cai para o
painel lateral de seções, que o planejamento já define como caminho principal.
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
