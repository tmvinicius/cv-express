import { criarConexao, type Banco } from "@cv-express/db";

/**
 * A conexão do app com o Postgres — UMA por processo.
 *
 * Antes disto, `app/page.tsx` e `app/cv/[id]/page.tsx` chamavam
 * `criarConexao` a cada requisição, e cada chamada cria um `Pool` novo. Como
 * toda troca de etapa re-renderiza o componente de servidor, cada clique em
 * "Continuar" abria uma conexão nova que ficava ociosa por 30s antes de ser
 * fechada. Com o limite padrão do Postgres (100 conexões), algumas dezenas de
 * pessoas preenchendo ao mesmo tempo bastavam para o banco responder
 * "too many clients" — e o primeiro a sentir é o autosave, em silêncio.
 *
 * Duas decisões que valem o comentário:
 *
 * 1. Guarda-se a PROMESSA, e não o resultado. `servidor.ts` tinha um
 *    singleton que guardava o resultado depois do `await`: duas requisições
 *    simultâneas no processo recém-subido viam `null` e criavam dois pools.
 *
 * 2. A promessa mora em `globalThis`, e não numa variável de módulo. Em
 *    `next dev`, o hot reload reavalia os módulos a cada edição; uma variável
 *    de módulo seria recriada junto e cada salvamento de arquivo vazaria um
 *    pool. Em produção não faz diferença.
 *
 * Uma promessa rejeitada (URL errada, banco fora do ar na subida) não fica
 * guardada: a próxima requisição tenta de novo, em vez de o processo inteiro
 * ficar preso a uma falha de conexão que já passou.
 */

const CHAVE = Symbol.for("cv-express.banco");

type Global = typeof globalThis & { [CHAVE]?: Promise<Banco> };

export function obterBanco(): Promise<Banco> {
  const g = globalThis as Global;
  const existente = g[CHAVE];
  if (existente) return existente;

  const url = process.env["DATABASE_URL"];
  if (!url) {
    // Lança em vez de devolver resultado: sem banco não existe página a
    // mostrar, e o erro precisa aparecer no log de quem implantou.
    return Promise.reject(new Error("DATABASE_URL não configurada."));
  }

  const nova = criarConexao(url).catch((e: unknown) => {
    delete g[CHAVE];
    throw e;
  });
  g[CHAVE] = nova;
  return nova;
}
