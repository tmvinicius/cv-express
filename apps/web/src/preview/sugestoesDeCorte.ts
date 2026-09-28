import { ordenarPorPeriodoDesc, type CvData } from "@cv-express/schema";

/**
 * Onde encurtar quando o currículo passa de uma página.
 *
 * O planejamento é explícito sobre isso: "aviso sem caminho de ação vira
 * culpa, não ajuda". Dizer "seu currículo passou de uma página" e parar aí
 * deixa a pessoa com um problema e nenhuma pista — e ela está preenchendo
 * currículo justamente porque já está numa situação difícil.
 *
 * Então o aviso aponta o trecho mais longo e a experiência mais antiga, que
 * são os dois cortes que quase sempre resolvem.
 */

export interface SugestaoCorte {
  /** Texto curto, pronto para exibir. */
  texto: string;
  /** Para onde levar a pessoa ao clicar. */
  fieldId?: string;
}

/** Tamanho do texto que uma experiência ocupa no PDF. */
function pesoDaExperiencia(e: {
  bullets: readonly string[];
  descricaoOriginal: string;
}): number {
  return e.bullets.length > 0
    ? e.bullets.join(" ").length
    : e.descricaoOriginal.length;
}

export function sugerirCortes(cv: CvData): SugestaoCorte[] {
  const sugestoes: SugestaoCorte[] = [];

  const experiencias = ordenarPorPeriodoDesc(cv.experiencias);

  // 1. A experiência mais LONGA — normalmente onde a pessoa se estendeu.
  const maisLonga = [...experiencias].sort(
    (a, b) => pesoDaExperiencia(b) - pesoDaExperiencia(a),
  )[0];

  if (maisLonga && pesoDaExperiencia(maisLonga) > 300) {
    sugestoes.push({
      texto: `A descrição de "${maisLonga.cargo || "uma das experiências"}" é a mais longa. Cortar um ou dois tópicos costuma resolver.`,
      fieldId: `experiencias.${maisLonga.id}.cargo`,
    });
  }

  // 2. A experiência mais ANTIGA — a que menos interessa a um recrutador.
  const maisAntiga = experiencias[experiencias.length - 1];

  if (maisAntiga && experiencias.length > 2 && maisAntiga.id !== maisLonga?.id) {
    sugestoes.push({
      texto: `"${maisAntiga.cargo || "A experiência mais antiga"}" é a mais antiga da lista. Experiências de muitos anos atrás podem ficar mais curtas.`,
      fieldId: `experiencias.${maisAntiga.id}.cargo`,
    });
  }

  // 3. Objetivo longo demais. Três linhas bastam; mais que isso vira texto
  //    que o recrutador pula.
  if (cv.objetivo.texto.length > 400) {
    sugestoes.push({
      texto: "Seu objetivo profissional está longo. Duas ou três linhas costumam funcionar melhor.",
      fieldId: "objetivo",
    });
  }

  // Sem nada específico a apontar, uma orientação geral é melhor que
  // silêncio — mas só como último recurso.
  if (sugestoes.length === 0) {
    sugestoes.push({
      texto: "Tente encurtar as descrições mais longas, ou remover a experiência menos relevante para a vaga que você quer.",
    });
  }

  return sugestoes;
}
