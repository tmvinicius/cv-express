import type { MotivoFalhaIa } from "../acoes/ia";

/**
 * O que a pessoa lê quando a IA não ajuda.
 *
 * Fica separado dos componentes porque duas telas precisam do mesmo texto
 * (experiências e habilidades), e separado de `acoes/ia.ts` porque aquele
 * módulo roda no servidor — daqui só sai `string`.
 *
 * Três regras de redação, e elas não são enfeite: este texto aparece para
 * alguém que está montando currículo, muitas vezes desempregado, e que acabou
 * de clicar num botão que não entregou o prometido.
 *
 * 1. Nunca culpar quem está lendo. O problema é nosso.
 * 2. Sempre dizer que o texto dela continua valendo. É verdade — o currículo
 *    sai igual sem a IA —, e é o que impede a falha de virar desistência.
 * 3. Nenhum detalhe técnico. "TEMPO_ESGOTADO", nome de provider e resposta
 *    crua da API ficam no log do servidor.
 */

/** O texto do botão desligado. Curto: cabe em `title` e ao lado do botão. */
export const IA_DESLIGADA =
  "A ajuda da IA está desligada neste ambiente. Escreva do seu jeito — o currículo sai igual.";

/**
 * Mensagem por motivo de falha.
 *
 * `Record` completo de propósito: um código novo em `@cv-express/ai` quebra a
 * compilação aqui, e é aqui que alguém precisa decidir o que a pessoa lê. A
 * alternativa — `?? mensagem genérica` — nunca quebraria, e por isso mesmo
 * deixaria códigos novos caindo em silêncio no texto vago.
 */
const MENSAGENS: Record<MotivoFalhaIa, string> = {
  LIMITE_EXCEDIDO:
    "A ajuda da IA atingiu o limite de uso por agora. Tente de novo em alguns minutos — seu texto continua valendo.",
  TEMPO_ESGOTADO:
    "A IA está demorando mais que o normal. Seu texto continua valendo; pode tentar de novo.",
  SAIDA_INVALIDA:
    "A sugestão veio de um jeito que não deu para usar. Seu texto continua valendo.",
  INDISPONIVEL:
    "Não conseguimos falar com a IA agora. Seu texto continua valendo.",
  NAO_AUTORIZADO:
    "A ajuda da IA não está liberada neste ambiente. Seu texto continua valendo.",
  // Este caso merece explicação em vez de desculpa: o guardrail funcionando é
  // a promessa central do produto — nada entra no currículo que você não
  // escreveu.
  GUARDRAIL:
    "A sugestão trouxe informação que você não escreveu, então descartamos. Seu texto continua valendo.",
  COTA_DA_SESSAO:
    "Você já usou bastante a ajuda da IA nesta sessão. Daqui a alguns minutos dá para pedir de novo.",
  sem_configuracao: IA_DESLIGADA,
  desconhecido: "Não conseguimos organizar agora. Seu texto continua valendo.",
};

export function mensagemDeFalhaIa(motivo: MotivoFalhaIa): string {
  return MENSAGENS[motivo];
}

/**
 * Vale oferecer "tentar de novo"?
 *
 * Um botão de repetir diante de "não está configurada" é o mesmo defeito que
 * este trabalho veio corrigir, uma tela depois.
 */
export function podeTentarDeNovo(motivo: MotivoFalhaIa): boolean {
  return motivo !== "sem_configuracao" && motivo !== "NAO_AUTORIZADO";
}
