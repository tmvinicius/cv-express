import { validarCv, type CvData } from "@cv-express/schema";
import {
  buscarSessao,
  salvarCv,
  criarSessao,
  apagarSessao,
  type Banco,
} from "@cv-express/db";

/**
 * Operações de sessão do formulário.
 *
 * Funções puras de efeito, recebendo o banco por parâmetro. As Server Actions
 * do Next.js (acoesServidor.ts) são invólucros finos em volta destas — o que
 * permite testá-las contra Postgres de verdade sem subir o Next.
 */

export type ResultadoSalvar =
  | { ok: true; salvoEm: string }
  | { ok: false; motivo: "sessao_ausente" | "dados_invalidos"; detalhe?: string };

/**
 * Autosave de uma etapa.
 *
 * Duas decisões que valem o comentário:
 *
 * 1. Valida com o schema COMPLETO, mas só recusa erro de FORMA, nunca de
 *    completude. Um rascunho sem nome precisa poder ser salvo — é o estado
 *    normal entre a etapa 1 e a 2. O que não pode entrar no banco é dado
 *    malformado: período invertido, texto acima do teto, e-mail impossível.
 *
 * 2. Sessão ausente devolve resultado, não exceção. O autosave roda em
 *    segundo plano e uma aba esquecida aberta por semanas é cenário esperado.
 */
export async function salvarEtapa(
  db: Banco,
  sessionId: string,
  cv: CvData,
  agora: Date = new Date(),
): Promise<ResultadoSalvar> {
  const validacao = validarCv(cv);

  if (!validacao.success) {
    /**
     * Separa "incompleto" de "malformado".
     *
     * A distinção NÃO pode ser só pelo caminho do campo. A primeira versão
     * disto dispensava qualquer erro em `pessoal.email`, e com isso aceitava
     * tanto o e-mail vazio (rascunho legítimo) quanto "isso não é e-mail"
     * (lixo que ia parar no banco e só apareceria na hora de compilar).
     *
     * A regra correta tem duas partes: o campo precisa estar na lista de
     * quem pode faltar num rascunho, E o valor precisa estar de fato vazio.
     */
    const problemasReais = validacao.error.issues.filter(
      (i) => !ehApenasIncompleto(cv, i.path.map(String)),
    );

    if (problemasReais.length > 0) {
      const primeiro = problemasReais[0]!;
      return {
        ok: false,
        motivo: "dados_invalidos",
        detalhe: `${primeiro.path.join(".")}: ${primeiro.message}`,
      };
    }
  }

  const gravou = await salvarCv(db, sessionId, cv, agora);
  if (!gravou) return { ok: false, motivo: "sessao_ausente" };

  return { ok: true, salvoEm: agora.toISOString() };
}

/**
 * Campos que podem estar vazios num rascunho.
 *
 * Lista explícita, e não heurística: acrescentar um campo obrigatório ao
 * schema sem lembrar desta lista faz o autosave recusar o rascunho, que é a
 * falha ruidosa correta — melhor do que uma regra esperta que aceite
 * silenciosamente algo malformado.
 */
const VAZIO_PERMITIDO_EM_RASCUNHO = new Set([
  "pessoal.nome",
  "pessoal.cidade",
  "pessoal.email",
]);

/** Lê o valor apontado por um caminho de issue do Zod. */
function valorEm(cv: CvData, caminho: readonly string[]): unknown {
  let atual: unknown = cv;
  for (const parte of caminho) {
    if (atual === null || typeof atual !== "object") return undefined;
    atual = (atual as Record<string, unknown>)[parte];
  }
  return atual;
}

function ehApenasIncompleto(cv: CvData, caminho: readonly string[]): boolean {
  if (!VAZIO_PERMITIDO_EM_RASCUNHO.has(caminho.join("."))) return false;

  // Vazio é rascunho; preenchido e inválido é defeito.
  const valor = valorEm(cv, caminho);
  return (
    valor === undefined ||
    valor === null ||
    (typeof valor === "string" && valor.trim() === "")
  );
}

export async function iniciarSessao(db: Banco, agora?: Date) {
  return criarSessao(db, agora);
}

export async function carregarSessao(db: Banco, id: string, agora?: Date) {
  return buscarSessao(db, id, agora);
}

/** Botão "apagar meus dados agora" (LGPD). */
export async function apagarTudo(db: Banco, id: string): Promise<boolean> {
  return apagarSessao(db, id);
}
