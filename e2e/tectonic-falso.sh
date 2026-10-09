#!/bin/sh
# Tectonic de mentira, para os testes de ponta a ponta.
#
# Devolve sempre o MESMO PDF: a saída de uma compilação real com o Tectonic
# 0.17.0, de duas páginas, que os testes do worker já usam como fixture. O E2E
# prova o fluxo — formulário, fila, cache, preview, download, aviso de páginas,
# link do e-mail —, não a composição tipográfica. Essa é coberta pela
# compilação real descrita em apps/latex-worker/README.md.
#
# O .aux traz só a contagem de páginas, que é o que o worker lê para o aviso
# de "passou de 1 página".
set -eu
SAIDA=""
while [ $# -gt 0 ]; do
  case "$1" in
    --outdir) SAIDA="$2"; shift 2 ;;
    *) shift ;;
  esac
done
AQUI="$(cd "$(dirname "$0")" && pwd)"
cp "$AQUI/../apps/latex-worker/src/__tests__/fixtures/duas-paginas.pdf" "$SAIDA/cv.pdf"
printf '\\relax\n\\gdef \\@abspage@last{2}\n' > "$SAIDA/cv.aux"
