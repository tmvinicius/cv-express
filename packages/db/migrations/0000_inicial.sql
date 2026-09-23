-- Migração inicial do CV Express.
--
-- SQL escrito à mão, e não gerado pelo drizzle-kit, por um motivo: esta
-- migração é aplicada em dois lugares — no Postgres de produção e no PGlite
-- dos testes. Um arquivo .sql simples funciona nos dois; o formato de
-- journal do drizzle-kit exigiria a ferramenta também no caminho de teste.

CREATE TABLE IF NOT EXISTS cv_sessions (
  id            TEXT PRIMARY KEY,
  data          JSONB       NOT NULL,
  email         TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em     TIMESTAMPTZ NOT NULL
);

-- O expurgo diário varre por validade; sem índice, vira varredura completa
-- assim que a tabela crescer.
CREATE INDEX IF NOT EXISTS idx_cv_sessions_expira_em ON cv_sessions (expira_em);

CREATE TABLE IF NOT EXISTS magic_links (
  token_hash TEXT PRIMARY KEY,
  session_id TEXT        NOT NULL REFERENCES cv_sessions(id) ON DELETE CASCADE,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em  TIMESTAMPTZ NOT NULL,
  usado_em   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_magic_links_session   ON magic_links (session_id);
CREATE INDEX IF NOT EXISTS idx_magic_links_expira_em ON magic_links (expira_em);

CREATE TABLE IF NOT EXISTS compile_jobs (
  id              TEXT PRIMARY KEY,
  session_id      TEXT        NOT NULL REFERENCES cv_sessions(id) ON DELETE CASCADE,
  status          TEXT        NOT NULL CHECK (status IN ('pendente','concluido','falhou')),
  content_hash    TEXT        NOT NULL,
  template_id     TEXT        NOT NULL,
  template_versao TEXT        NOT NULL,
  pdf_url         TEXT,
  page_count      INTEGER,
  erro            TEXT,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A consulta real é sempre "esta sessão já compilou este conteúdo?".
CREATE INDEX IF NOT EXISTS idx_compile_jobs_sessao_hash
  ON compile_jobs (session_id, content_hash);
