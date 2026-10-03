import { obterBanco } from "../../../../acoes/banco";
import { executarExpurgo } from "../../../../acoes/tarefas";

/**
 * Expurgo diário: GET com `Authorization: Bearer <CRON_SECRET>`.
 *
 * GET porque é o que o Vercel Cron faz — ele chama o caminho declarado em
 * `vercel.json` e envia o CRON_SECRET nesse cabeçalho sozinho. A lógica e os
 * testes estão em `acoes/tarefas.ts`.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  const r = await executarExpurgo(
    obterBanco,
    req.headers.get("authorization"),
    process.env["CRON_SECRET"],
  );
  return Response.json(r.corpo, { status: r.status });
}
