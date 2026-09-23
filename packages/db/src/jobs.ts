import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { compileJobs } from "./esquema.js";
import type { Banco } from "./conexao.js";

/**
 * Registro das compilações.
 *
 * Serve a dois propósitos: o cache ("esta sessão já compilou este
 * conteúdo?") e a reprodutibilidade — guardar templateId e versão permite
 * saber com que template um PDF antigo foi gerado (seção 3.6 do
 * planejamento).
 */

export interface NovoJob {
  sessionId: string;
  contentHash: string;
  templateId: string;
  templateVersao: string;
}

export async function registrarJob(
  db: Banco,
  entrada: NovoJob,
  agora: Date = new Date(),
): Promise<string> {
  const id = nanoid(16);
  await db.insert(compileJobs).values({
    id,
    ...entrada,
    status: "pendente",
    criadoEm: agora,
  });
  return id;
}

export async function concluirJob(
  db: Banco,
  id: string,
  resultado: { pdfUrl: string; pageCount: number },
): Promise<void> {
  await db
    .update(compileJobs)
    .set({ status: "concluido", ...resultado })
    .where(eq(compileJobs.id, id));
}

/**
 * Marca a falha.
 *
 * `mensagem` é o texto JÁ TRADUZIDO para o usuário. O log do LaTeX nunca
 * entra aqui: ele carrega caminhos absolutos do servidor e vazaria em
 * qualquer dump do banco.
 */
export async function falharJob(
  db: Banco,
  id: string,
  mensagem: string,
): Promise<void> {
  await db
    .update(compileJobs)
    .set({ status: "falhou", erro: mensagem })
    .where(eq(compileJobs.id, id));
}

/**
 * Procura uma compilação concluída para o mesmo conteúdo.
 *
 * A busca inclui o sessionId de propósito. Só o contentHash bastaria para
 * acertar o cache — e faria o PDF de uma pessoa ser servido para outra que
 * por acaso preencheu o currículo igual. Improvável, e catastrófico se
 * acontecer.
 */
export async function buscarJobConcluido(
  db: Banco,
  sessionId: string,
  contentHash: string,
) {
  const [linha] = await db
    .select()
    .from(compileJobs)
    .where(
      and(
        eq(compileJobs.sessionId, sessionId),
        eq(compileJobs.contentHash, contentHash),
        eq(compileJobs.status, "concluido"),
      ),
    )
    .orderBy(desc(compileJobs.criadoEm))
    .limit(1);

  return linha ?? null;
}
