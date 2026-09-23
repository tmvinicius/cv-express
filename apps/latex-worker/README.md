# latex-worker

Serviço de compilação LaTeX. Recebe `CvData`, devolve PDF.

## Subir localmente

```bash
docker build -f apps/latex-worker/Dockerfile -t cvexpress-worker .

docker run --rm -p 8080:8080 \
  --read-only \
  --network none \
  --tmpfs /tmp/cvexpress:rw,noexec,nosuid,size=64m \
  --memory 512m \
  --cpus 1 \
  --security-opt no-new-privileges \
  --cap-drop ALL \
  -e WORKER_TOKEN=um-token-qualquer \
  cvexpress-worker
```

As opções acima **não são enfeite** — são a segunda camada de sandbox
(a primeira está em `src/tectonic.ts`). Vale entender cada uma antes de
remover qualquer uma delas:

| Opção | Contra o quê |
|---|---|
| `--network none` | `\write18` que escapasse não alcança nada |
| `--read-only` | Escrita fora do tmpfs falha |
| `--tmpfs ... noexec` | Binário gravado em /tmp não roda |
| `--memory 512m` | Bomba de expansão do TeX não derruba o host |
| `--cpus 1` | Laço infinito não trava a máquina inteira |
| `--cap-drop ALL` | Nenhuma capability de kernel |
| `no-new-privileges` | Bloqueia escalada por setuid |

`--network none` merece um aviso: com ele o contêiner **não aceita conexões
de fora**. Para testar de verdade, troque por uma rede interna sem saída, ou
suba com `-p` e aceite que a saída para a internet continua bloqueada pelas
demais opções.

## Verificar

```bash
curl localhost:8080/saude

curl -X POST localhost:8080/compilar \
  -H 'content-type: application/json' \
  -H 'x-worker-token: um-token-qualquer' \
  -d '{"cv": { ... } }' | jq -r .pdf | base64 -d > cv.pdf
```

## O que conferir na primeira compilação

Esta é a parte do projeto que **não pôde ser verificada** no ambiente em que
foi escrita — não havia Docker nem Tectonic. Na ordem:

1. **A imagem constrói.** O estágio `latex` compila `aquecimento.tex`, que é
   teste de fumaça: se o `cvexpress.cls` tiver erro, o build falha ali, e não
   em produção.

2. **Acentuação no PDF.** Abra o PDF de aquecimento e confira `ção ã õ é ê á`.
   É onde template LaTeX importado costuma quebrar.

3. **As âncoras de posição.** No `.aux`, devem existir três entradas por campo
   (`@x`, `@y`, `@p`). A macro `\cvCampo` é a única do pacote sem teste
   automatizado.

4. **Calibrar as coordenadas.** `src/aux.ts` assume origem no canto inferior
   esquerdo, y para cima. Gere um currículo de uma página e compare a posição
   relatada para `pessoal.nome` com a real. Se estiver espelhada na vertical ou
   deslocada por uma polegada, o ajuste é em `converterPosicao()` — e só ali.

Se (3) ou (4) falharem, **o produto continua de pé**: o preview cai para o
painel lateral de seções, que o planejamento já define como caminho principal.
A edição por clique é aprimoramento, não requisito.

## Configuração

| Variável | Padrão | Para quê |
|---|---|---|
| `PORT` | 8080 | |
| `WORKER_TOKEN` | — | Obrigatório em produção; o processo não sobe sem ele |
| `CONCORRENCIA` | 2 | Compilações simultâneas |
| `FILA_MAXIMA` | 50 | Acima disso, responde 503 |
| `TIMEOUT_COMPILACAO_MS` | 10000 | SIGKILL no Tectonic |
| `CORPO_MAXIMO_BYTES` | 524288 | Teto do corpo da requisição |
| `CACHE_MAXIMO` | 100 | PDFs guardados em memória |
| `CACHE_TTL_MS` | 1800000 | Validade da entrada de cache |

## Por que o worker não aceita `.tex`

Ele recebe `CvData` e gera o `.tex` ele mesmo. Um endpoint que aceitasse
`.tex` arbitrário seria, por definição, um endpoint de execução remota de
LaTeX: quem o alcançasse — um SSRF no app web, um contêiner comprometido, uma
regra de rede frouxa — mandaria `\input{/etc/passwd}` direto, contornando todo
o escape do `packages/templates`.

Recebendo `CvData`, não existe caminho até o Tectonic que pule o escape.
