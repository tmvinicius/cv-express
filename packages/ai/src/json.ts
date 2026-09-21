/**
 * Extração tolerante de JSON.
 *
 * É aqui que trocas de provider costumam quebrar na prática, e por isso o
 * tratamento é único para todos em vez de cada adapter resolver o seu.
 *
 * Claude com `output_config` e OpenAI com `json_schema` devolvem JSON limpo.
 * Modelos abertos rodando em Ollama ou vLLM frequentemente não garantem nada:
 * devolvem o JSON dentro de cerca de markdown, precedido de "Claro! Aqui
 * está:", ou com um comentário depois do fecha-chaves.
 *
 * A alternativa seria um caminho de código por provider. Com extração
 * tolerante, um modelo mais fraco funciona no MESMO caminho, apenas com taxa
 * de nova tentativa maior.
 */

/**
 * Isola o primeiro objeto JSON completo do texto.
 *
 * Conta chaves em vez de casar por expressão regular, porque o conteúdo pode
 * ter chaves aninhadas. Ignora chaves dentro de string e respeita escape —
 * um bullet com `{` no texto quebraria a contagem ingênua.
 */
function recortarObjeto(texto: string): string | null {
  const inicio = texto.indexOf("{");
  if (inicio === -1) return null;

  let profundidade = 0;
  let dentroDeString = false;
  let escapado = false;

  for (let i = inicio; i < texto.length; i++) {
    const c = texto[i];

    if (escapado) {
      escapado = false;
      continue;
    }
    if (c === "\\") {
      escapado = true;
      continue;
    }
    if (c === '"') {
      dentroDeString = !dentroDeString;
      continue;
    }
    if (dentroDeString) continue;

    if (c === "{") profundidade++;
    else if (c === "}") {
      profundidade--;
      if (profundidade === 0) return texto.slice(inicio, i + 1);
    }
  }

  // Chegou ao fim com chaves abertas: resposta truncada por max_tokens.
  return null;
}

/**
 * Tenta obter um objeto JSON a partir da resposta bruta do modelo.
 *
 * Devolve `null` em vez de lançar: resposta fora do formato é ocorrência
 * esperada com modelo aberto, não excepcional, e quem chama já trata isso
 * com uma nova tentativa.
 */
export function extrairJson(bruto: string): unknown | null {
  const texto = bruto.trim();
  if (texto === "") return null;

  // Caminho feliz: já é JSON puro.
  try {
    return JSON.parse(texto);
  } catch {
    // Segue para as tentativas tolerantes.
  }

  // Remove cerca de markdown, com ou sem a linguagem anotada.
  const semCerca = texto
    .replace(/^\s*```(?:json|JSON)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim();

  if (semCerca !== texto) {
    try {
      return JSON.parse(semCerca);
    } catch {
      // Segue.
    }
  }

  // Último recurso: recortar o primeiro objeto completo que aparecer.
  const recorte = recortarObjeto(semCerca);
  if (recorte === null) return null;

  try {
    return JSON.parse(recorte);
  } catch {
    return null;
  }
}
