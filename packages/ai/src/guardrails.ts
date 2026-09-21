import type { Habilidade } from "@cv-express/schema";

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  GUARDRAILS — VALIDADOS EM CÓDIGO, NUNCA CONFIADOS AO PROMPT             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Estas verificações vivem ACIMA do adapter, na camada de domínio. Isso não é
 * organização: é o que garante que trocar de provider não enfraqueça nenhuma
 * regra.
 *
 * Um prompt dizendo "não invente nada" funciona razoavelmente bem com um
 * modelo de fronteira e bem menos com um modelo aberto de 7B. Se a proteção
 * morasse no prompt, apontar AI_PROVIDER para o Ollama silenciosamente
 * rebaixaria a promessa central do produto — a de que a IA organiza o que o
 * usuário escreveu e não acrescenta nada.
 *
 * Em código, a checagem é a mesma para todos.
 */

export interface Violacao {
  regra: "expansao" | "numero_inventado" | "habilidade_inventada" | "vazio";
  mensagem: string;
}

/**
 * Teto de expansão.
 *
 * Organizar um texto de 30 palavras não produz 150. Quando produz, o modelo
 * deixou de organizar e passou a escrever — que é a forma mais comum de
 * invenção, e a mais difícil de detectar olhando.
 *
 * O fator é generoso (1,5x) porque transformar texto corrido em bullets
 * legitimamente acrescenta verbos de ação e pontuação.
 */
export const FATOR_EXPANSAO_MAX = 1.5;

/** Piso para textos curtos, onde a proporção sozinha seria severa demais. */
const PISO_CARACTERES = 200;

export function verificarExpansao(
  original: string,
  produzido: string,
  fator: number = FATOR_EXPANSAO_MAX,
): Violacao | null {
  const teto = Math.max(original.length * fator, PISO_CARACTERES);
  if (produzido.length <= teto) return null;

  return {
    regra: "expansao",
    mensagem:
      `A sugestão tem ${produzido.length} caracteres para um original de ` +
      `${original.length} — acima do teto de ${Math.round(teto)}.`,
  };
}

/**
 * Números que aparecem na saída mas não na entrada.
 *
 * Esta é a invenção que mais machuca. "Aumentei as vendas em 40%" num
 * currículo onde o usuário escreveu apenas "trabalhei com vendas" é uma
 * mentira que ele vai ter de sustentar numa entrevista — e que ele nem sabe
 * que está lá, porque não escreveu.
 *
 * A comparação é por dígitos, ignorando pontuação: "1.500", "1500" e "1,500"
 * contam como o mesmo número. Sem isso, a formatação do modelo geraria falso
 * positivo constante.
 */
export function verificarNumerosInventados(
  original: string,
  produzido: string,
): Violacao | null {
  const digitos = (s: string): Set<string> => {
    const achados = s.match(/\d[\d.,]*/g) ?? [];
    return new Set(achados.map((n) => n.replace(/[.,]/g, "")));
  };

  const naEntrada = digitos(original);
  const inventados = [...digitos(produzido)].filter((n) => !naEntrada.has(n));

  if (inventados.length === 0) return null;

  return {
    regra: "numero_inventado",
    mensagem: `A sugestão traz números que não estavam no original: ${inventados.join(", ")}.`,
  };
}

/**
 * Normaliza para comparar nomes de habilidade.
 *
 * Remove acento e caixa, porque a normalização legítima da IA é exatamente
 * mudar isso: "javascript" vira "JavaScript", "analise de dados" vira
 * "Análise de Dados". Comparar sem normalizar acusaria todo acerto como
 * invenção.
 */
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Habilidades que não têm origem no texto do usuário.
 *
 * O trabalho legítimo da IA aqui é normalizar, deduplicar e categorizar o que
 * foi escrito. Acrescentar "Docker" porque o usuário mencionou "Kubernetes"
 * seria inferência plausível — e mentira.
 *
 * O critério é conservador: cada palavra do nome produzido precisa aparecer
 * no texto original. Isso aceita "trabalho em equipe" -> "Trabalho em Equipe"
 * e recusa qualquer nome com termo novo. Palavras de ligação são ignoradas,
 * porque a IA pode reescrever "sql e python" como "SQL" e "Python".
 */
const LIGACAO = new Set(["e", "de", "da", "do", "em", "com", "para", "a", "o"]);

export function verificarHabilidadesInventadas(
  textoOriginal: string,
  itens: readonly Pick<Habilidade, "nome">[],
): Violacao | null {
  const entrada = normalizar(textoOriginal);
  const palavrasDaEntrada = new Set(entrada.split(" ").filter(Boolean));

  const inventadas = itens
    .map((i) => i.nome)
    .filter((nome) => {
      const palavras = normalizar(nome)
        .split(" ")
        .filter((p) => p.length > 0 && !LIGACAO.has(p));

      if (palavras.length === 0) return false;
      return !palavras.every((p) => palavrasDaEntrada.has(p));
    });

  if (inventadas.length === 0) return null;

  return {
    regra: "habilidade_inventada",
    mensagem: `A sugestão traz habilidades que não estavam no texto: ${inventadas.join(", ")}.`,
  };
}

/** Roda todas as verificações de uma experiência. */
export function verificarExperiencia(
  descricaoOriginal: string,
  bullets: readonly string[],
): Violacao | null {
  if (bullets.length === 0) {
    return { regra: "vazio", mensagem: "A sugestão não trouxe nenhum bullet." };
  }

  const juntos = bullets.join(" ");
  return (
    verificarExpansao(descricaoOriginal, juntos) ??
    verificarNumerosInventados(descricaoOriginal, juntos)
  );
}

/** Roda todas as verificações de habilidades. */
export function verificarHabilidades(
  textoOriginal: string,
  itens: readonly Pick<Habilidade, "nome">[],
): Violacao | null {
  return verificarHabilidadesInventadas(textoOriginal, itens);
}
