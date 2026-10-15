import {
  AiError,
  type Resultado,
  type CodigoAiError,
  type CvAiService,
  type HabilidadeSugerida,
} from "@cv-express/ai";
import type { CvData } from "@cv-express/schema";
import type { OperacaoIa, RegistroUsoIa } from "@cv-express/db";

/**
 * A fronteira da IA vista pelo navegador.
 *
 * Por que resultado e não exceção: a versão anterior lançava `new
 * Error(r.erro.message)` da Server Action e o cliente mostrava sempre a mesma
 * frase genérica. Não era descuido — é limitação real: em produção o Next
 * troca a mensagem de erro de Server Action por um digest, justamente para não
 * vazar detalhe de servidor. Então mensagem de erro NÃO atravessa essa
 * fronteira; código atravessa.
 *
 * O que vai para o cliente é só o código. `AiError.detalhe` carrega resposta
 * crua do provider e fica no log do servidor, pela mesma razão que o log do
 * LaTeX nunca chega ao cliente.
 */

/**
 * Motivo da falha, como CÓDIGO.
 *
 * Reaproveita a taxonomia de `@cv-express/ai` em vez de declarar uma lista
 * paralela: um código novo lá vira erro de compilação no mapa de mensagens
 * daqui, que é exatamente onde alguém precisa decidir o que a pessoa vai ler.
 */
export type MotivoFalhaIa =
  | CodigoAiError
  /** Não há IA configurada neste ambiente. */
  | "sem_configuracao"
  /** A sessão não existe ou venceu — o id veio do navegador (ver `cotas.ts`). */
  | "sessao_ausente"
  /** A cota por origem (IP) estourou. Passa sozinho dentro da hora. */
  | "muitos_pedidos"
  /** O teto diário de gasto, somando todo mundo. Volta no dia seguinte. */
  | "teto_diario"
  /** Qualquer outra falha — rede, bug nosso, o inesperado. */
  | "desconhecido";

export type ResultadoIa<T> =
  | { ok: true; dados: T }
  | { ok: false; motivo: MotivoFalhaIa };

/**
 * Para onde vai o uso de tokens de cada chamada (no app, `registrarUsoIa` do
 * pacote db). Opcional para os testes que não tratam de uso.
 */
export type RegistrarUsoIa = (registro: RegistroUsoIa) => Promise<void>;

export async function polirExperiencia(
  servico: CvAiService,
  cv: CvData,
  experienciaId: string,
  sessionId: string,
  registrar?: RegistrarUsoIa,
): Promise<ResultadoIa<string[]>> {
  const experiencia = cv.experiencias.find((e) => e.id === experienciaId);
  // Item removido enquanto o pedido ia e voltava. Não é falha da IA.
  if (!experiencia) return { ok: true, dados: [] };

  return await tentar(async () => {
    const r = await servico.polirExperiencia(
      { cargo: experiencia.cargo, descricao: experiencia.descricaoOriginal },
      sessionId,
    );
    await anotarUso(registrar, "experiencia", r);
    return r.ok ? { ok: true, dados: r.dados.bullets } : falha(r.erro);
  });
}

export async function normalizarHabilidades(
  servico: CvAiService,
  cv: CvData,
  sessionId: string,
  registrar?: RegistrarUsoIa,
): Promise<ResultadoIa<HabilidadeSugerida[]>> {
  return await tentar(async () => {
    const r = await servico.normalizarHabilidades(
      { texto: cv.habilidades.textoOriginal },
      sessionId,
    );
    await anotarUso(registrar, "habilidades", r);
    return r.ok ? { ok: true, dados: r.dados.itens } : falha(r.erro);
  });
}

/**
 * Anota os tokens de uma chamada: uma linha no log e o agregado do dia.
 *
 * O serviço sempre calculou os tokens, e este módulo os jogava fora — o
 * `IA_TETO_DIARIO` era um palpite sem eles. A falha também é anotada: um
 * guardrail que descarta a sugestão já gastou os tokens das tentativas.
 *
 * Nunca derruba a resposta: se o banco não anotar, a pessoa recebe a
 * sugestão do mesmo jeito, e o log registra o que faltou. Nada do texto da
 * pessoa vai para cá — só operação, resultado e números.
 */
async function anotarUso(
  registrar: RegistrarUsoIa | undefined,
  operacao: OperacaoIa,
  r: Resultado<unknown>,
): Promise<void> {
  const { entrada, saida } = r.uso;
  // Sucesso sem token nenhum: o modelo nem foi chamado (texto vazio).
  if (r.ok && entrada + saida === 0) return;

  console.info("[ia] uso", {
    operacao,
    ok: r.ok,
    ...(r.ok ? {} : { motivo: r.erro.codigo }),
    tokensEntrada: entrada,
    tokensSaida: saida,
  });

  if (!registrar) return;
  try {
    await registrar({ operacao, ok: r.ok, tokensEntrada: entrada, tokensSaida: saida });
  } catch (e) {
    console.error("[ia] o uso não foi anotado no banco", { operacao, erro: String(e) });
  }
}

/**
 * Rede de segurança.
 *
 * O serviço promete não lançar, mas quem chama uma Server Action não pode
 * depender dessa promessa: uma falha de rede antes do adapter, ou um defeito
 * nosso, cairiam como exceção e a pessoa veria a tela de erro do Next depois
 * de ter preenchido o currículo inteiro.
 */
async function tentar<T>(
  operacao: () => Promise<ResultadoIa<T>>,
): Promise<ResultadoIa<T>> {
  try {
    return await operacao();
  } catch (e) {
    return falha(e);
  }
}

/** Traduz o erro para código, e manda o detalhe para o log do servidor. */
function falha(erro: unknown): { ok: false; motivo: MotivoFalhaIa } {
  const motivo: MotivoFalhaIa = erro instanceof AiError ? erro.codigo : "desconhecido";

  // O detalhe fica aqui, indexado pelo motivo. O cliente recebe só o motivo.
  console.error("[ia] falha", {
    motivo,
    detalhe: erro instanceof AiError ? erro.detalhe : String(erro),
  });

  return { ok: false, motivo };
}
