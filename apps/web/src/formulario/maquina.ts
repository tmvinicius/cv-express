import type { CvData } from "@cv-express/schema";
import { ETAPAS, etapaPorId, indiceDa, type Etapa, type IdEtapa } from "./etapas";

/**
 * Navegação entre etapas e cálculo de progresso.
 *
 * Funções puras sobre (etapa atual, CvData). Nenhum estado próprio, nenhum
 * efeito — a etapa atual mora na URL e o currículo, no servidor. Isso é o que
 * faz recarregar a página não perder nada, e é testável sem renderizar nada.
 */

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  O CRITÉRIO ÚNICO DE PROGRESSO                                           ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Uma etapa está RESOLVIDA quando não há mais nada a fazer nela:
 *
 *   concluida — foi preenchida e o que está lá é válido;
 *   pulada    — é opcional, está vazia, e a pessoa já passou dela. Pular é
 *               uma decisão, não uma pendência: quem está no primeiro emprego
 *               não tem experiência para contar, e uma barra que a cobra para
 *               sempre transforma o produto num boletim.
 *
 * `percentual` = resolvidas ÷ contáveis. Nada mais.
 *
 * Isto existe porque a versão anterior tinha DOIS critérios ao mesmo tempo: a
 * barra media etapas preenchidas e o texto "Etapa 1 de 6" media a posição na
 * fila. Os dois apareciam lado a lado no cabeçalho dizendo coisas
 * contraditórias — 0% em "Etapa 1 de 6" —, e a pessoa não tinha como saber
 * qual dos dois estava mentindo.
 *
 * A saída daqui é o ÚNICO insumo da barra, do contador e da trilha de etapas.
 * Se um indicador novo precisar de outro número, o lugar de acrescentá-lo é
 * este, nunca o componente.
 */
export type EstadoEtapa = "concluida" | "pulada" | "pendente";

export interface EtapaNaTrilha {
  id: IdEtapa;
  rotulo: string;
  opcional: boolean;
  estado: EstadoEtapa;
  /** É onde a pessoa está agora. Independente de estar resolvida ou não. */
  atual: boolean;
  /** Dá para ir direto para ela a partir de onde a pessoa está? */
  acessivel: boolean;
  /** Posição visível, 1 a 6. */
  posicao: number;
}

export interface Progresso {
  /** 0 a 100, para a barra. Deriva de `resolvidas`. */
  percentual: number;
  /** Concluídas + puladas. É o que a barra mede. */
  resolvidas: number;
  /** Só as preenchidas e válidas. Menor ou igual a `resolvidas`. */
  etapasConcluidas: number;
  totalDeEtapas: number;
  rotuloAtual: string;
  /** Posição visível ao usuário, contando só as etapas de preenchimento. */
  posicaoAtual: number;
  /**
   * A etapa atual é uma das seis de preenchimento?
   *
   * Falso em boas-vindas, "gerando" e preview. Sem isto o cabeçalho anunciava
   * "Etapa 1 de 6" na tela de boas-vindas, onde não se preenche nada.
   */
  naTrilha: boolean;
  /** As seis etapas contáveis, em ordem, com o estado de cada uma. */
  etapas: EtapaNaTrilha[];
}

export function calcularProgresso(atual: IdEtapa, cv: CvData): Progresso {
  const contaveis = ETAPAS.filter((e) => e.contaNoProgresso);
  const indiceAtual = indiceDa(atual);

  const etapas: EtapaNaTrilha[] = contaveis.map((e, i) => ({
    id: e.id,
    rotulo: e.rotulo,
    opcional: e.opcional,
    estado: estadoDa(e, cv, indiceAtual),
    atual: e.id === atual,
    acessivel: podeIrPara(e.id, atual, cv),
    posicao: i + 1,
  }));

  const concluidas = etapas.filter((e) => e.estado === "concluida").length;
  const resolvidas = etapas.filter((e) => e.estado !== "pendente").length;

  const posicao = contaveis.findIndex((e) => indiceDa(e.id) >= indiceAtual) + 1;

  return {
    percentual: Math.round((resolvidas / contaveis.length) * 100),
    resolvidas,
    etapasConcluidas: concluidas,
    totalDeEtapas: contaveis.length,
    rotuloAtual: etapaPorId(atual).rotulo,
    // Depois da última etapa contável (gerando/preview), a posição é o total.
    posicaoAtual: posicao === 0 ? contaveis.length : posicao,
    naTrilha: etapaPorId(atual).contaNoProgresso,
    etapas,
  };
}

function estadoDa(etapa: Etapa, cv: CvData, indiceAtual: number): EstadoEtapa {
  if (etapa.preenchida(cv)) {
    // Preenchida com erro não é concluída: contá-la faria a barra andar por
    // causa de um dado que o banco vai recusar.
    return etapa.validar(cv).length === 0 ? "concluida" : "pendente";
  }
  const jaPassou = indiceDa(etapa.id) < indiceAtual;
  return etapa.opcional && jaPassou ? "pulada" : "pendente";
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
  // "gerando" é passagem, não destino: ela compila e avança sozinha para o
  // preview. Voltar do preview para ela devolveria a pessoa ao preview no
  // instante seguinte — um botão Voltar que não sai do lugar. O anterior de
  // quem está depois dela é a última etapa de preenchimento.
  let i = indiceDa(atual) - 1;
  while (i >= 0 && ETAPAS[i]?.id === "gerando") i--;
  return ETAPAS[i]?.id ?? null;
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
