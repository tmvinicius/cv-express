import { lerMigracoes } from "../migracoes.js";

/**
 * `pnpm migrar` — aplica as migrações no banco de `DATABASE_URL`.
 *
 * Até aqui elas se aplicavam à mão, arquivo por arquivo, com `psql`; e o
 * compose só as roda na PRIMEIRA subida, com o volume vazio. Quem atualizava
 * o código num banco existente precisava lembrar de cada arquivo novo — e
 * esquecer a 0001 faz o "Concluir e salvar" falhar com "column does not
 * exist" só em produção.
 *
 * POR QUE SEM TABELA DE CONTROLE ("quais já rodaram"): toda migração deste
 * projeto é IDEMPOTENTE — `IF NOT EXISTS`, `DO $$ … IF EXISTS` —, e há teste
 * que aplica todas duas vezes seguidas. Então aplicar tudo de novo é sempre
 * seguro, e o script fica sem estado para dessincronizar. A regra, em troca,
 * é dura: migração nova que não aguente rodar duas vezes reprova o teste.
 *
 * Cada arquivo roda numa transação: se um falhar no meio, ele não fica pela
 * metade, e os seguintes não rodam.
 */
async function principal(): Promise<number> {
  const url = process.env["DATABASE_URL"];
  if (!url) {
    console.error("DATABASE_URL não definida. Ex.: DATABASE_URL=postgres://… pnpm migrar");
    return 1;
  }

  const { Client } = await import("pg");
  const cliente = new Client({ connectionString: url });
  await cliente.connect();

  try {
    for (const { nome, sql } of lerMigracoes()) {
      try {
        await cliente.query("BEGIN");
        await cliente.query(sql);
        await cliente.query("COMMIT");
        console.info(`ok      ${nome}`);
      } catch (e) {
        await cliente.query("ROLLBACK").catch(() => {});
        console.error(`FALHOU  ${nome}\n${e instanceof Error ? e.message : String(e)}`);
        return 1;
      }
    }
    return 0;
  } finally {
    await cliente.end();
  }
}

principal().then(
  (codigo) => process.exit(codigo),
  (e) => {
    // Conexão recusada, URL malformada: a mensagem do driver diz o motivo.
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  },
);
