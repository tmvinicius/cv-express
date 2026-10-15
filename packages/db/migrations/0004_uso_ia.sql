-- Uso da IA, somado por dia e por operação.
--
-- O planejamento (§4.6) pede "instrumentar tokens desde o dia 1": a IA é a
-- única despesa que cresce com o uso, e o teto diário (IA_TETO_DIARIO) conta
-- PEDIDOS — sem saber quantos tokens um pedido gasta, o teto era um palpite.
-- O serviço sempre calculou os tokens; o app os jogava fora.
--
-- Agregado, e não uma linha por chamada: o que a conta precisa é "quanto por
-- dia" e "quanto por pedido, em média". Sem sessão, sem IP, sem texto — não
-- há dado pessoal aqui, e por isso a tabela não entra no expurgo: são duas
-- linhas por dia, e o histórico é o que permite comparar meses.
--
-- O dia é o de UTC, o mesmo do teto diário (`acoes/cotas.ts`).
--
-- Idempotente, como as anteriores.

CREATE TABLE IF NOT EXISTS uso_ia (
  dia            DATE    NOT NULL,
  operacao       TEXT    NOT NULL,
  chamadas       INTEGER NOT NULL DEFAULT 0,
  falhas         INTEGER NOT NULL DEFAULT 0,
  tokens_entrada BIGINT  NOT NULL DEFAULT 0,
  tokens_saida   BIGINT  NOT NULL DEFAULT 0,
  PRIMARY KEY (dia, operacao)
);
