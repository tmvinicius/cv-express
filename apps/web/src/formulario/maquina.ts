import type { CvData } from "@cv-express/schema";
import { ETAPAS, etapaPorId, indiceDa, type Etapa, type IdEtapa } from "./etapas";

/**
 * Navegação entre etapas e cálculo de progresso.
 *
 * Funções puras sobre (etapa atual, CvData). Nenhum estado próprio, nenhum
 * efeito — a etapa atual mora na URL e o currículo, no servidor. Isso é o que
 * faz recarregar a página não perder nada, e é testável sem renderizar nada.
 */

export interface Progresso {
  /** 0 a 100, para a barra. */
  percentual: number;
  etapasConcluidas: number;
  totalDeEtapas: number;
  rotuloAtual: string;
  /** Posição visível ao usuário, contando só as etapas de preenchimento. */
  posicaoAtual: number;
}

export function calcularProgresso(atual: IdEtapa, cv: CvData): Progresso {
  const contaveis = ETAPAS.filter((e) => e.contaNoProgresso);
  const concluidas = contaveis.filter((e) => e.preenchida(cv)).length;

  const indiceAtual = indiceDa(atual);
  const posicao = contaveis.findIndex((e) => indiceDa(e.id) >= indiceAtual) + 1;

  return {
    percentual: Math.round((concluidas / contaveis.length) * 100),
    etapasConcluidas: concluidas,
    totalDeEtapas: contaveis.length,
    rotuloAtual: etapaPorId(atual).rotulo,
    // Depois da última etapa contável (gerando/preview), a posição é o total.
    posicaoAtual: posicao === 0 ? contaveis.length : posicao,
  };
}

export type ResultadoAvanco =
  | { ok: true; proxima: IdEtapa }
  | { ok: false; erros: string[] };

/**
 * Tenta avançar.
 *
 * Etapa obrigatória precisa estar válida. Etapa opcional avança mesmo vazia —
 * mas se a pessoa preencheu, o que ela preencheu precisa estar correto: uma
 * experiência com período invertido não pode passar só porque a etapa era
 * pulável.
 */
export function avancar(atual: IdEtapa, cv: CvData): ResultadoAvanco {
  const etapa = etapaPorId(atual);
  const erros = etapa.validar(cv);

  // Opcional e intocada: segue.
  if (erros.length > 0 && !(etapa.opcional && !etapa.preenchida(cv))) {
    return { ok: false, erros };
  }

  const proxima = ETAPAS[indiceDa(atual) + 1];
  if (!proxima) return { ok: false, erros: ["Esta é a última etapa."] };

  return { ok: true, proxima: proxima.id };
}

/**
 * Volta uma etapa.
 *
 * SEMPRE permitido, e sem validar nada. O planejamento é explícito: voltar não
 * pode perder o que foi preenchido adiante, e exigir que a etapa atual esteja
 * válida para poder voltar prenderia a pessoa num campo que ela quer revisar
 * depois de conferir o anterior.
 *
 * Os dados adiante não são tocados porque esta função não os toca — o CvData
 * é imutável aqui e a navegação só muda qual etapa aparece.
 */
export function voltar(atual: IdEtapa): IdEtapa | null {
  const anterior = ETAPAS[indiceDa(atual) - 1];
  return anterior?.id ?? null;
}

/**
 * A pessoa pode pular direto para uma etapa?
 *
 * Pode, desde que já tenha passado por ela ou seja a próxima na fila. Pular
 * para o fim sem preencher o obrigatório geraria um currículo sem nome.
 *
 * Usado pelos rótulos clicáveis da barra de progresso: quem já preencheu tudo
 * consegue voltar direto a uma etapa específica para corrigir uma coisa só.
 */
export function podeIrPara(destino: IdEtapa, atual: IdEtapa, cv: CvData): boolean {
  const iDestino = indiceDa(destino);
  const iAtual = indiceDa(atual);

  if (iDestino <= iAtual) return true;

  // Para frente: todas as etapas entre a atual e o destino precisam estar ok.
  for (let i = iAtual; i < iDestino; i++) {
    const etapa = ETAPAS[i] as Etapa;
    const erros = etapa.validar(cv);
    if (erros.length > 0 && !(etapa.opcional && !etapa.preenchida(cv))) {
      return false;
    }
  }
  return true;
}

/**
 * O currículo está pronto para compilar?
 *
 * Todas as etapas obrigatórias válidas. É a condição para sair de "gerando"
 * com um PDF em vez de um erro.
 */
export function prontoParaGerar(cv: CvData): { pronto: boolean; pendencias: string[] } {
  const pendencias = ETAPAS.filter((e) => !e.opcional && e.contaNoProgresso).flatMap(
    (e) => e.validar(cv),
  );
  return { pronto: pendencias.length === 0, pendencias };
}
