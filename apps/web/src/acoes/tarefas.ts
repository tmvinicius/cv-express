import { createHash, timingSafeEqual } from "node:crypto";
import { expurgoDiario, type Banco, type ResultadoExpurgo } from "@cv-express/db";

/**
 * A tarefa diária de expurgo, vista de fora.
 *
 * POR QUE UMA ROTA AGENDADA, e não `pg_cron` nem um processo próprio:
 *
 * - O app web roda na Vercel, que tem agendamento nativo (Vercel Cron) e
 *   chama uma rota do próprio app. Zero infraestrutura nova.
 * - `pg_cron` não existe em todo Postgres gerenciado, e amarraria a retenção
 *   ao provedor do banco.
 * - Um processo agendado à parte seria mais uma coisa para implantar e
 *   monitorar, só para chamar uma função.
 *
 * Fora da Vercel, qualquer agendador serve — é um GET com um cabeçalho (ver
 * README). A lógica fica aqui, testável sem o Next; a rota só a expõe.
 */

export type RespostaTarefa =
  | { status: 200; corpo: ResultadoExpurgo }
  | { status: 401 | 503; corpo: { erro: string } };

/**
 * Executa o expurgo se o pedido trouxer o segredo.
 *
 * A rota é pública por natureza — o agendador chama pela internet —, e apagar
 * dados é a operação mais destrutiva do produto. Sem segredo configurado, ela
 * RECUSA: uma rota destrutiva aberta por esquecimento de variável é pior do
 * que um expurgo que não roda (e que aparece no log como 503).
 */
export async function executarExpurgo(
  db: () => Promise<Banco>,
  autorizacao: string | null,
  segredo: string | undefined,
  agora: Date = new Date(),
): Promise<RespostaTarefa> {
  if (!segredo) {
    console.error("[expurgo] CRON_SECRET não configurado; tarefa recusada");
    return { status: 503, corpo: { erro: "indisponivel" } };
  }

  if (!mesmoSegredo(autorizacao ?? "", `Bearer ${segredo}`)) {
    return { status: 401, corpo: { erro: "nao_autorizado" } };
  }

  const resultado = await expurgoDiario(await db(), agora);
  // O número no log é o alarme: uma queda brusca ou um valor absurdo é sinal
  // de que algo mudou na renovação das sessões.
  console.info("[expurgo] concluído", resultado);
  return { status: 200, corpo: resultado };
}

/**
 * Comparação em tempo constante.
 *
 * O hash antes do `timingSafeEqual` iguala os tamanhos — a função lança com
 * tamanhos diferentes, e comparar o tamanho antes vazaria o tamanho do
 * segredo.
 */
function mesmoSegredo(recebido: string, esperado: string): boolean {
  const a = createHash("sha256").update(recebido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}
