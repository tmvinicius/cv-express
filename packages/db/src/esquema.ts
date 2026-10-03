import {
  pgTable,
  text,
  jsonb,
  timestamp,
  integer,
  index,
} from "drizzle-orm/pg-core";
import type { CvData } from "@cv-express/schema";

/**
 * As três tabelas do planejamento (seção 2).
 *
 * O produto é anônimo: não há usuário, senha nem conta. O que existe é uma
 * SESSÃO, identificada por um id opaco, que o link mágico permite retomar.
 * Guardar o mínimo é decisão de produto e também de LGPD — o único dado
 * pessoal fora do currículo é o e-mail, e ele só existe se a pessoa pedir o
 * link.
 */

export const cvSessions = pgTable(
  "cv_sessions",
  {
    id: text("id").primaryKey(),

    /**
     * O CvData inteiro, como JSONB.
     *
     * Documento, e não tabelas normalizadas, porque ele é sempre lido e
     * gravado por inteiro: o formulário salva a cada etapa e a compilação lê
     * tudo. Normalizar em seis tabelas custaria join a cada autosave sem
     * resolver nenhuma consulta que o produto faça — ninguém vai perguntar
     * "quantas pessoas sabem Python" na V1.
     */
    data: jsonb("data").$type<CvData>().notNull(),

    /** Só existe se a pessoa pediu o link mágico. */
    email: text("email"),

    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .notNull()
      .defaultNow(),

    /**
     * Retenção, com duas regras:
     *
     * - RASCUNHO (`concluidoEm` nulo): 30 dias SEM ACESSO, renovados a cada
     *   leitura e gravação. Apagar o trabalho de alguém que está usando o
     *   produto seria um defeito grave.
     * - CONCLUÍDO: fixo em `concluidoEm` + 5 dias. Não renova com acesso nem
     *   com edição — é o prazo que a pessoa leu no e-mail.
     */
    expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),

    /**
     * Quando a pessoa clicou "Concluir e salvar" pela PRIMEIRA vez.
     *
     * Nunca é sobrescrito: é a âncora do prazo de 5 dias. Concluir de novo,
     * depois de editar pelo link, salva o conteúdo sem mexer no prazo.
     */
    concluidoEm: timestamp("concluido_em", { withTimezone: true }),
  },
  (t) => [index("idx_cv_sessions_expira_em").on(t.expiraEm)],
);

export const magicLinks = pgTable(
  "magic_links",
  {
    /**
     * SHA-256 do token, nunca o token.
     *
     * Quem ler o banco — backup vazado, dump de suporte, SQL injection em
     * outro ponto — não consegue entrar em sessão nenhuma. É a mesma razão
     * pela qual senha não se guarda em claro.
     *
     * Chave primária porque a consulta é sempre por hash: recebemos o token,
     * calculamos o hash e procuramos. O token bruto nunca toca o banco.
     */
    tokenHash: text("token_hash").primaryKey(),

    sessionId: text("session_id")
      .notNull()
      // Apagar a sessão apaga os links: um link órfão é um link que aponta
      // para nada e ainda ocupa espaço no índice.
      .references(() => cvSessions.id, { onDelete: "cascade" }),

    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),

    /**
     * O link vale até aqui — o MESMO instante do prazo da sessão concluída.
     * Ele não tem validade própria: link e currículo terminam juntos.
     */
    expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),

    /** Último resgate. Só registro; o link é reutilizável até `expiraEm`. */
    ultimoUsoEm: timestamp("ultimo_uso_em", { withTimezone: true }),

    /**
     * Deixou de valer antes do prazo: um link novo foi para outro e-mail, ou
     * o envio deste falhou. Link revogado não volta a valer.
     */
    revogadoEm: timestamp("revogado_em", { withTimezone: true }),
  },
  (t) => [
    index("idx_magic_links_session").on(t.sessionId),
    index("idx_magic_links_expira_em").on(t.expiraEm),
  ],
);

export const compileJobs = pgTable(
  "compile_jobs",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => cvSessions.id, { onDelete: "cascade" }),

    status: text("status", {
      enum: ["pendente", "concluido", "falhou"],
    }).notNull(),

    /**
     * Chave do cache de compilação.
     *
     * Indexado junto com a sessão: a consulta real é sempre "esta sessão já
     * compilou este conteúdo?", nunca só por hash.
     */
    contentHash: text("content_hash").notNull(),

    templateId: text("template_id").notNull(),
    templateVersao: text("template_versao").notNull(),

    pdfUrl: text("pdf_url"),
    pageCount: integer("page_count"),

    /**
     * Mensagem de erro JÁ TRADUZIDA, nunca o log do LaTeX.
     *
     * O log carrega caminhos absolutos do servidor. Ele fica no log
     * estruturado do worker, indexado pelo requestId — e não no banco, de
     * onde vazaria em qualquer dump.
     */
    erro: text("erro"),

    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_compile_jobs_sessao_hash").on(t.sessionId, t.contentHash)],
);

export const esquema = { cvSessions, magicLinks, compileJobs };
