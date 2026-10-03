-- Limite de envio de e-mail por janela de tempo.
--
-- Um contador por (chave, início da janela). A chave já chega com HASH — o
-- banco nunca guarda IP nem e-mail em claro para este fim — e a linha vive
-- só até o expurgo diário, que apaga janelas encerradas.
--
-- Postgres, e não memória do processo: o app web roda em serverless, onde
-- cada instância teria o seu contador e o limite real seria "N vezes o número
-- de instâncias". E não Redis: seria uma dependência nova só para isto, num
-- projeto que já tem Postgres em todo lugar onde roda.
--
-- Idempotente, como as anteriores.

CREATE TABLE IF NOT EXISTS limites_envio (
  chave         TEXT        NOT NULL,
  janela_inicio TIMESTAMPTZ NOT NULL,
  contagem      INTEGER     NOT NULL,
  PRIMARY KEY (chave, janela_inicio)
);

-- O expurgo apaga por janela; sem índice, varreria a tabela inteira.
CREATE INDEX IF NOT EXISTS idx_limites_envio_janela ON limites_envio (janela_inicio);
