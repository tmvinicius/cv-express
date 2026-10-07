import {
  chaveDeLimite,
  consumirLimite,
  sessaoAtiva,
  type Banco,
  type Regra,
} from "@cv-express/db";

import type { MotivoFalhaIa } from "./ia";
import type { ResultadoCompilacao } from "./compilar";

/**
 * Quanto cada visitante pode gastar do que custa: IA, compilação e sessões.
 *
 * O produto é gratuito, então a IA é a única despesa que cresce com o uso
 * (planejamento §4.6) e o worker é a única CPU que um estranho consegue
 * ocupar (§5.2). Os dois recebiam um `sessionId` do navegador sem conferir, e
 * a cota da IA vivia na memória de cada processo — em serverless, um teto por
 * instância que um reinício zerava. Aqui tudo passa por três camadas:
 *
 *   1. a sessão precisa EXISTIR no banco (`sessaoAtiva`). Um id inventado não
 *      chega ao provider nem ao worker;
 *   2. cotas por sessão e por origem (IP), contadas no Postgres com o mesmo
 *      contador atômico do limite de e-mail (`consumirLimite`) — valem entre
 *      instâncias e sobrevivem a reinícios;
 *   3. para a IA, um teto DIÁRIO global, que é o que limita a fatura. Quando
 *      ele estoura, a ajuda vira "pausada por hoje": o currículo sai igual.
 *
 * Criar sessões novas também tem limite por origem (`LIMITE_SESSOES_POR_ORIGEM`):
 * sem ele, a camada 1 se contornaria criando uma sessão por pedido.
 *
 * Ordem das checagens: da mais barata e específica para a global. Um pedido
 * recusado pela cota da sessão não chega a gastar a cota da origem nem o teto
 * do dia — senão uma única aba em laço consumiria o teto de todo mundo.
 *
 * FALHA FECHADA. Se o banco não responde, a IA e a compilação recusam em vez
 * de seguir sem contar: gastar sem saber quanto é exatamente o defeito que
 * este arquivo existe para impedir.
 */

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

/**
 * IA. Os 15 por hora por sessão são os do planejamento (§4.6): polir cada
 * experiência e as habilidades duas ou três vezes cabe com folga. Os 100 por
 * origem cobrem uma sala de aula atrás do mesmo IP — que é o cenário real de
 * um laboratório de escola ou de um projeto de empregabilidade.
 */
export const COTAS_IA = {
  porSessao: { janelaMs: HORA, maximo: 15 },
  porOrigem: { janelaMs: HORA, maximo: 100 },
} as const satisfies Record<string, Regra>;

/**
 * Compilação. Cada mudança no conteúdo com o preview aberto recompila, e o
 * cache do worker não ajuda aqui: um pedido que cai no cache também conta,
 * porque daqui não dá para saber se vai cair. Por isso o teto é alto — 120
 * por hora é uma edição a cada 30 segundos durante uma hora inteira.
 */
export const COTAS_COMPILACAO = {
  porSessao: { janelaMs: HORA, maximo: 120 },
  porOrigem: { janelaMs: HORA, maximo: 600 },
} as const satisfies Record<string, Regra>;

/** Sessões novas por origem. Uma turma inteira começando junto cabe. */
export const LIMITE_SESSOES_POR_ORIGEM: Regra = { janelaMs: HORA, maximo: 60 };

/**
 * Chamadas à IA por dia, somando todo mundo, quando `IA_TETO_DIARIO` não diz
 * outro número.
 *
 * Conta chamadas, e não tokens, de propósito: o custo de uma chamada já é
 * limitado no serviço (`maxTokens` por resposta, uma nova tentativa no
 * máximo), então o gasto do dia fica abaixo de
 * teto × 2 × (entrada + maxTokens de saída). Contar tokens exigiria gravar o
 * uso DEPOIS da resposta, e o teto deixaria de ser checado antes de gastar.
 */
export const TETO_DIARIO_IA_PADRAO = 1_000;

/**
 * O teto diário da IA lido do ambiente.
 *
 * `0` é válido e desliga a ajuda sem tirar a chave — útil para cortar o gasto
 * na hora, sem nova implantação de código. Um valor que não é número inteiro
 * cai no padrão, com aviso: um erro de digitação não pode virar teto infinito.
 */
export function tetoDiarioIa(env: Record<string, string | undefined> = process.env): number {
  const bruto = env["IA_TETO_DIARIO"]?.trim();
  if (!bruto) return TETO_DIARIO_IA_PADRAO;

  const valor = Number(bruto);
  if (!Number.isInteger(valor) || valor < 0) {
    console.warn("[cotas] IA_TETO_DIARIO inválido, usando o padrão", {
      valor: bruto,
      padrao: TETO_DIARIO_IA_PADRAO,
    });
    return TETO_DIARIO_IA_PADRAO;
  }
  return valor;
}

/**
 * Pode chamar a IA? `null` libera; senão, o motivo — já no vocabulário que a
 * tela sabe explicar (`mensagensIa.ts`).
 */
export async function autorizarIa(
  db: Banco,
  sessionId: string,
  origem: string,
  tetoDiario: number,
  agora: Date = new Date(),
): Promise<MotivoFalhaIa | null> {
  try {
    if (!(await sessaoAtiva(db, sessionId, agora))) return "sessao_ausente";

    if (!(await consumirLimite(db, chaveDeLimite("ia-sessao", sessionId), COTAS_IA.porSessao, agora))) {
      return "COTA_DA_SESSAO";
    }
    if (!(await consumirLimite(db, chaveDeLimite("ia-origem", origem), COTAS_IA.porOrigem, agora))) {
      return "muitos_pedidos";
    }

    // Uma chave só para todo mundo; a janela de um dia começa à meia-noite
    // UTC (21h em Brasília), porque `consumirLimite` alinha pela época.
    const teto: Regra = { janelaMs: DIA, maximo: tetoDiario };
    if (!(await consumirLimite(db, chaveDeLimite("ia-global", "dia"), teto, agora))) {
      console.warn("[cotas] teto diário da IA atingido", { teto: tetoDiario });
      return "teto_diario";
    }

    return null;
  } catch (e) {
    console.error("[cotas] falha ao conferir a cota da IA", { erro: String(e) });
    return "desconhecido";
  }
}

/** A parte de `ResultadoCompilacao` que uma recusa daqui pode devolver. */
type RecusaCompilacao = Extract<ResultadoCompilacao, { ok: false }>;

/** Pode mandar este currículo ao worker? `null` libera. */
export async function autorizarCompilacao(
  db: Banco,
  sessionId: string,
  origem: string,
  agora: Date = new Date(),
): Promise<RecusaCompilacao | null> {
  try {
    if (!(await sessaoAtiva(db, sessionId, agora))) {
      return {
        ok: false,
        codigo: "SESSAO_AUSENTE",
        mensagem:
          "Este currículo não está mais disponível — o prazo dele pode ter acabado. Recarregue a página para conferir.",
      };
    }

    const cabe =
      (await consumirLimite(
        db,
        chaveDeLimite("compilar-sessao", sessionId),
        COTAS_COMPILACAO.porSessao,
        agora,
      )) &&
      (await consumirLimite(
        db,
        chaveDeLimite("compilar-origem", origem),
        COTAS_COMPILACAO.porOrigem,
        agora,
      ));

    if (!cabe) {
      // Mesma mensagem para sessão e origem: dizer qual limite foi atingido
      // só ensinaria a contorná-lo.
      return {
        ok: false,
        codigo: "MUITOS_PEDIDOS",
        mensagem:
          // Sem "seu currículo está salvo": o Preview já diz isso logo abaixo.
          "Muitas gerações em pouco tempo. Espere alguns minutos e tente de novo.",
      };
    }

    return null;
  } catch (e) {
    console.error("[cotas] falha ao conferir a cota de compilação", { erro: String(e) });
    return {
      ok: false,
      codigo: "ERRO_INTERNO",
      mensagem: "O gerador de PDF não está disponível agora. Seu currículo está salvo.",
    };
  }
}

/**
 * Pode criar mais uma sessão a partir desta origem?
 *
 * Sem falha fechada aqui, de propósito: este contador e a sessão moram no
 * mesmo banco, então se ele não responde a sessão também não seria criada.
 */
export async function autorizarNovaSessao(
  db: Banco,
  origem: string,
  agora: Date = new Date(),
): Promise<boolean> {
  return consumirLimite(db, chaveDeLimite("sessao-origem", origem), LIMITE_SESSOES_POR_ORIGEM, agora);
}

/**
 * O IP de quem pediu, para os limites por origem.
 *
 * Na Vercel — onde o app roda em produção — o `x-forwarded-for` é escrito
 * pela própria plataforma, e o primeiro endereço é o do cliente. Atrás de
 * outro proxy, confira que ele SOBRESCREVE o cabeçalho em vez de acrescentar:
 * sem isso, quem faz a requisição escolhe o próprio IP e escapa dos limites
 * por origem (os limites por sessão, por destinatário e o teto diário
 * continuam valendo).
 *
 * Sem cabeçalho nenhum, todos caem na mesma origem "desconhecida". É o lado
 * seguro: o limite aperta, em vez de sumir.
 */
export function origemDoPedido(h: Pick<Headers, "get">): string {
  const encaminhado = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return encaminhado || h.get("x-real-ip")?.trim() || "desconhecida";
}
