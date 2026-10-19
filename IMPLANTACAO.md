# Implantação

Como colocar o CV Express no ar: um Postgres, o worker de LaTeX num
container e o app web na Vercel. Siga na ordem — cada passo depende do
anterior.

> **O que foi verificado e o que não.** O comando de build da Vercel foi
> rodado num clone limpo, sem `dist/` nenhum, e o CI repete isso a cada push
> (job `build como na Vercel`). A imagem do worker é construída e testada com
> um currículo de verdade pelo job `imagem do worker`. Nenhuma implantação
> real foi feita ainda: os nomes de menu da Vercel e do provedor de banco
> abaixo são os de outubro de 2026 e podem mudar. Quem implantar primeiro,
> corrija este arquivo onde ele estiver errado.

---

## 1. Banco

Qualquer Postgres 16 gerenciado serve (Neon, Supabase, RDS…).

**Use a URL com pooler** para o app. Cada instância do app abre até 5
conexões (`packages/db/src/conexao.ts`), e na Vercel as instâncias se
multiplicam com o tráfego: sem pooler, algumas dezenas de instâncias
esgotam o limite de conexões do Postgres, e o primeiro a sentir é o autosave,
em silêncio. No Neon é o endereço com `-pooler` no host; no Supabase, o
"Transaction pooler". O app funciona em pooler de modo transação: não usa
prepared statement nomeado, `LISTEN`, advisory lock nem `SET` de sessão — e
o `FOR UPDATE` do "Concluir e salvar" roda dentro de uma transação, que o
pooler mantém numa conexão só.

**SSL:** use a URL que o provedor entrega, com `?sslmode=require`.

**Cópia de segurança:** ligue a recuperação pontual do provedor. Os
currículos são de passagem por definição (30 dias sem uso), mas a tabela
`uso_ia` é o histórico de custo da IA e não volta se for perdida.

## 2. Migrações

Antes de implantar o código, do seu computador:

```bash
pnpm install
DATABASE_URL='<URL DIRETA, sem pooler>' pnpm migrar
```

Use a URL **direta** para migrar — os provedores recomendam assim para
mudança de esquema. O `pnpm migrar` aplica todas as migrações, sempre, e é
seguro repetir: cada uma é idempotente (regra do projeto, com teste).

A cada atualização, a ordem é **migrar → worker → web**. Por isso uma
migração nova precisa manter funcionando o código que ainda está no ar:
acrescente primeiro, implante, e só remova o que ficou sem uso numa migração
seguinte.

## 3. Worker de LaTeX

Qualquer plataforma que rode um container a partir de um Dockerfile serve
(Fly.io, Railway, Render, um servidor com Docker).

**Build:** o contexto é a RAIZ do repositório e o Dockerfile é
`apps/latex-worker/Dockerfile` — a imagem precisa de `packages/`. O primeiro
build demora: baixa o Tectonic 0.17.0 (conferido por SHA-256) e o bundle de
LaTeX, e compila um documento de teste dentro do build; se o template não
compilar, o build falha ali, e não na primeira pessoa.

| O que configurar | Valor |
|---|---|
| Porta interna | `8080` |
| Health check | `GET /saude` (não pede token) |
| Memória | 512 MB — o mesmo limite do `docker-compose.yml` |
| CPU | 1 |
| `WORKER_TOKEN` | Gere com `openssl rand -hex 32`. Sem ele o processo não sobe |
| Endereço público | Só HTTPS: o token vai em cada pedido |

As outras variáveis (concorrência, fila, timeout, cache) estão em
[`apps/latex-worker/README.md`](./apps/latex-worker/README.md) e têm padrão.
Uma instância basta para começar: cada uma compila 2 PDFs por vez e enfileira
até 50; acima disso responde 503, e o preview pede para tentar de novo em
alguns segundos.

**A sandbox.** O escape de LaTeX, o Tectonic sem `shell-escape` e o SIGKILL
por tempo valem em qualquer plataforma. As proteções do container — disco
só de leitura, `/tmp` sem execução, nenhuma capability, limite de processos,
`no-new-privileges` — estão no `docker-compose.yml` e o CI testa a imagem com
elas. Reproduza o que a plataforma permitir, e **bloqueie a saída de rede**
do worker, que não precisa de internet para compilar (`--only-cached`). O
que a plataforma não permitir, anote aqui: é uma camada de defesa a menos, e
a decisão precisa ser consciente.

**Conferir:** a mesma fumaça do CI roda contra o worker em produção. Ela
compila três currículos (o completo duas vezes, para o cache, e o hostil):

```bash
pnpm install && pnpm run build
WORKER_URL=https://<seu-worker> WORKER_TOKEN=<token> pnpm --filter @cv-express/e2e imagem
```

## 4. App web na Vercel

1. **Novo projeto** a partir do repositório, com **Root Directory
   `apps/web`**. O framework (Next.js) e o pnpm são detectados.
2. **Build:** deixe o comando do painel em branco. Ele vem de
   `apps/web/vercel.json`:

   ```
   pnpm --filter "@cv-express/web^..." run build && pnpm run build
   ```

   Primeiro os pacotes de que o web depende, depois o `next build`. Sem a
   primeira parte o build falha — o `next.config.ts` importa
   `@cv-express/schema`, que só existe depois do build dos pacotes. Confira
   que está ligada a opção que inclui no build os arquivos de fora do Root
   Directory: `packages/` mora fora de `apps/web`.
3. **Node.js 22**, o mesmo do `.nvmrc` (Settings → Build and Deployment).
4. **Variáveis de ambiente**, no ambiente Production. A lista completa,
   comentada, está em [`apps/web/.env.example`](./apps/web/.env.example):
   - `DATABASE_URL` — a URL **com pooler** do passo 1;
   - `WORKER_URL` e `WORKER_TOKEN` — do passo 3;
   - `APP_URL` — o domínio público, com `https://`. É a base do link do
     e-mail;
   - `AI_PROVIDER`, a chave da IA e `IA_TETO_DIARIO` — o teto conforme o
     orçamento (consulta de custo no README);
   - `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` e `EMAIL_REMETENTE`, de um
     domínio verificado no Resend. O modo `console` é recusado em produção;
   - `CRON_SECRET` — `openssl rand -hex 32`. A Vercel o envia sozinha ao
     expurgo agendado em `vercel.json`;
   - `PRIVACIDADE_CONTATO` — a LGPD exige um canal.

   **Prévias (Preview) não podem usar o banco de produção.** Cada PR gera uma
   implantação de prévia; com a mesma `DATABASE_URL`, um teste numa prévia
   grava currículos de verdade. Dê às prévias outro banco, ou nenhuma
   variável de banco.

5. Variável nova ou alterada só vale numa implantação nova: depois de
   preencher, implante de novo.

## 5. Conferir depois de implantar

- [ ] `/privacidade` mostra o canal de contato, e não o aviso de "não
      configurado".
- [ ] Um currículo do começo ao fim: preencher, pedir ajuda à IA, gerar,
      baixar o PDF. Conferir os acentos no PDF.
- [ ] "Concluir e salvar": o e-mail chega, e o link abre o currículo em outro
      navegador.
- [ ] A fumaça do worker em produção (passo 3) passa.
- [ ] No dia seguinte: `[expurgo] concluído` no log da Vercel (o agendamento
      roda às 06:00 UTC, só na implantação de produção).
- [ ] A tabela `uso_ia` com as linhas do dia, e o gasto batendo com o painel
      do provedor de IA.

## Voltar atrás

A Vercel volta para a implantação anterior com um clique (Instant Rollback),
e o worker volta para a imagem anterior na plataforma dele. O banco não volta
— é por isso que as migrações só acrescentam até o código novo estar firme
(passo 2).
