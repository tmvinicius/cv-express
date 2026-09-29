import {
  ATUAL,
  compararPeriodo,
  emMeses,
  type DataMesAno,
  type Formacao,
  type Periodo,
} from "@cv-express/schema";
import { formatarMes } from "@cv-express/templates/formatadores";
import { ptBR } from "@cv-express/i18n";

/**
 * Coerência das datas, do ponto de vista de quem preenche.
 *
 * Por que existe, se `periodoSchema` já recusa período invertido: porque o
 * schema só é consultado quando alguém clica em "Continuar", e aí a pessoa
 * recebe "Experiência 2 — fim: A data de término não pode ser anterior à de
 * início." no rodapé, longe do campo. Pior: `salvarEtapa` também recusa o
 * período invertido, então o autosave PARA e a única pista é o indicador
 * dizendo que os dados continuam na tela. Um formulário que emudece é o
 * oposto de confiável.
 *
 * A divisão de trabalho:
 *
 * - `erro`   — o dado é impossível. O schema recusa, o banco recusa, o avanço
 *              fica bloqueado. Aparecer inline só antecipa o que já
 *              aconteceria, no lugar certo e em português de gente.
 * - `aviso`  — o dado é possível, mas provavelmente não é o que a pessoa
 *              quis. NUNCA bloqueia. Quem digitou 1998 em vez de 2018 quer
 *              ser avisado; quem realmente começou em 1998 tem o direito de
 *              seguir sem pedir licença.
 *
 * Nenhuma conta de data é reimplementada aqui: `compararPeriodo` e `emMeses`
 * vêm do schema, e `formatarMes` vem do mesmo formatador que escreve o PDF —
 * a data citada na mensagem é, caractere por caractere, a que vai sair
 * impressa.
 */

export type Severidade = "erro" | "aviso";

/**
 * Código do diagnóstico.
 *
 * Existe para que uma tela possa DESCARTAR uma regra específica sem casar
 * pedaço de texto: formação precisa deixar passar data futura, porque lá ela é
 * previsão de formatura. Filtrar por mensagem quebraria na primeira vez que
 * alguém melhorasse a redação.
 */
export type CodigoDiagnostico =
  | "fim_antes_do_inicio"
  | "inicio_no_futuro"
  | "fim_no_futuro"
  | "periodo_implausivel"
  | "formacao_sem_termino"
  | "concluida_com_termino_futuro"
  | "em_andamento_vencida";

export interface Diagnostico {
  codigo: CodigoDiagnostico;
  severidade: Severidade;
  /** O que está incoerente, em uma frase, sem jargão. */
  mensagem: string;
  /**
   * O que fazer a respeito.
   *
   * Obrigatória de propósito: a mesma regra do aviso de páginas — aviso sem
   * caminho de ação vira culpa, não ajuda.
   */
  sugestao: string;
}

/** Quantos anos de período ainda parecem plausíveis numa carreira. */
const ANOS_PLAUSIVEIS = 50;

function mes(d: DataMesAno): string {
  return formatarMes(d, ptBR);
}

/**
 * Data de hoje reduzida a { ano, mes }.
 *
 * Recebida por parâmetro em todo lugar abaixo, e não lida de `new Date()` lá
 * dentro: é o que torna estes diagnósticos testáveis sem congelar o relógio.
 *
 * UTC, e não fuso local, porque é o que `mesAtual` das fábricas do schema usa
 * ao criar uma experiência nova. Com as duas em fusos diferentes, um item
 * recém-adicionado na virada do mês nasceria com o aviso "o início está no
 * futuro" — um aviso sobre uma data que a pessoa nem escolheu.
 */
export function mesCorrente(agora: Date = new Date()): DataMesAno {
  return { ano: agora.getUTCFullYear(), mes: agora.getUTCMonth() + 1 };
}

/**
 * Diagnóstico de um período isolado.
 *
 * Serve para experiência e para formação — as duas têm a mesma forma de
 * período e os mesmos jeitos de sair errado.
 */
export function diagnosticarPeriodo(
  periodo: Periodo,
  agora: Date = new Date(),
): Diagnostico[] {
  const diagnosticos: Diagnostico[] = [];
  const hoje = mesCorrente(agora);
  const { inicio, fim } = periodo;

  // O único erro duro: o tempo não anda para trás.
  if (fim !== ATUAL && compararPeriodo(fim, inicio) < 0) {
    diagnosticos.push({
      codigo: "fim_antes_do_inicio",
      severidade: "erro",
      mensagem: `O término (${mes(fim)}) é anterior ao início (${mes(inicio)}).`,
      sugestao: "Confira se as duas datas não ficaram trocadas.",
    });
  }

  if (emMeses(inicio) > emMeses(hoje)) {
    diagnosticos.push({
      codigo: "inicio_no_futuro",
      severidade: "aviso",
      mensagem: `O início (${mes(inicio)}) está no futuro.`,
      sugestao:
        "Se já é um combinado firmado, pode deixar assim. Se foi engano no ano, corrija o início.",
    });
  }

  if (fim !== ATUAL && emMeses(fim) > emMeses(hoje)) {
    diagnosticos.push({
      codigo: "fim_no_futuro",
      severidade: "aviso",
      mensagem: `O término (${mes(fim)}) ainda não chegou.`,
      sugestao:
        "Para período em aberto, marque a caixa em vez de escolher uma data futura.",
    });
  }

  /**
   * Período absurdamente longo quase sempre é ano digitado errado.
   *
   * É aviso e não erro porque 50 anos de carreira existem — e quem os tem
   * merece menos atrito, não mais.
   */
  const fimEfetivo = fim === ATUAL ? hoje : fim;
  const anos = (emMeses(fimEfetivo) - emMeses(inicio)) / 12;
  if (anos >= ANOS_PLAUSIVEIS) {
    diagnosticos.push({
      codigo: "periodo_implausivel",
      severidade: "aviso",
      mensagem: `Esse período tem ${Math.floor(anos)} anos.`,
      sugestao: "Se foi um erro de digitação, o ano de início é o suspeito.",
    });
  }

  return diagnosticos;
}

/**
 * Situação declarada × período preenchido, na formação.
 *
 * Em formação, DATA NO FUTURO É ESPERADA: o término é a previsão de formatura,
 * e "2022 – dez/2027" é a informação que o recrutador quer. Por isso os avisos
 * de data futura de `diagnosticarPeriodo` são descartados aqui — eles existem
 * para experiência, onde emprego futuro se declara pelo checkbox de período em
 * aberto. É também o motivo de a formação não ter esse checkbox: quem ainda
 * cursa diz isso pela Situação, que já sai impressa no PDF.
 *
 * O que sobra é a contradição entre a Situação e a data, que o `periodoSchema`
 * não tem como pegar: cada campo é válido sozinho, e só a combinação não faz
 * sentido. É a incoerência que mais chega ao PDF, porque o `.tex` imprime os
 * dois lados — "Concluído" ao lado de "2022 – dez/2027" faz o currículo
 * parecer descuidado justamente onde ele precisa parecer cuidadoso.
 *
 * Fica no app web, e não no schema, porque é aviso e não regra: trancar uma
 * matrícula com data de término registrada é situação real. Se um dia virar
 * regra, o lugar dela é `packages/schema/src/cv.ts`.
 */
export function diagnosticarFormacao(
  formacao: Formacao,
  agora: Date = new Date(),
): Diagnostico[] {
  const { status, periodo } = formacao;
  const hoje = mesCorrente(agora);

  const diagnosticos = diagnosticarPeriodo(periodo, agora).filter(
    (d) => d.codigo !== "fim_no_futuro" && d.codigo !== "inicio_no_futuro",
  );

  /**
   * Período em aberto só chega aqui de currículo gravado antes de a formação
   * perder o checkbox. A tela mostra o início no lugar do término, então pedir
   * a data é mais honesto do que gravar uma previsão que a pessoa não escolheu.
   */
  if (periodo.fim === ATUAL) {
    diagnosticos.push({
      codigo: "formacao_sem_termino",
      severidade: "aviso",
      mensagem: "Falta a data de conclusão desta formação.",
      sugestao:
        "Informe o mês e o ano — se ainda está cursando, vale a previsão de formatura.",
    });
  }

  if (
    status === "concluido" &&
    periodo.fim !== ATUAL &&
    emMeses(periodo.fim) > emMeses(hoje)
  ) {
    // A data futura não é o problema: é ela combinada com "Concluído". Sem
    // este aviso o PDF sai com "Concluído · fev/2022 – dez/2027", e "Concluído"
    // é o valor inicial do campo — ou seja, o erro fácil de cometer sem notar.
    diagnosticos.push({
      codigo: "concluida_com_termino_futuro",
      severidade: "aviso",
      mensagem: `Você marcou "Concluído", mas ${mes(periodo.fim)} ainda não chegou.`,
      sugestao:
        'Se é previsão de formatura, troque a situação para "Em andamento".',
    });
  }

  if (
    status === "em_andamento" &&
    periodo.fim !== ATUAL &&
    emMeses(periodo.fim) < emMeses(hoje)
  ) {
    diagnosticos.push({
      codigo: "em_andamento_vencida",
      severidade: "aviso",
      mensagem: `Você marcou "Em andamento", mas o término (${mes(periodo.fim)}) já passou.`,
      sugestao:
        'Atualize a previsão de formatura ou troque a situação para "Concluído".',
    });
  }

  return diagnosticos;
}

/** Há erro duro entre os diagnósticos? Usado para marcar o campo inválido. */
export function temErro(diagnosticos: readonly Diagnostico[]): boolean {
  return diagnosticos.some((d) => d.severidade === "erro");
}
