import {
  compilarRespostaSchema,
  erroCompilacaoSchema,
  type CodigoErroCompilacao,
  type CompilarResposta,
  type CvData,
} from "@cv-express/schema";

/**
 * Chamada ao latex-worker.
 *
 * Roda no servidor: o token interno nunca chega ao navegador, e o worker não
 * precisa ficar exposto na internet.
 *
 * O que vai no corpo é o CvData, nunca um .tex — ver a justificativa em
 * packages/schema/src/worker.ts. Um endpoint que aceitasse .tex seria um
 * endpoint de execução remota de LaTeX.
 */

export type ResultadoCompilacao =
  | { ok: true; resposta: CompilarResposta }
  | { ok: false; codigo: CodigoErroCompilacao; mensagem: string; requestId?: string };

export interface OpcoesCompilar {
  urlWorker: string;
  token: string;
  /** Injetável para teste; em produção é o fetch global. */
  buscar?: typeof fetch;
  timeoutMs?: number;
}

export async function compilarCv(
  cv: CvData,
  opcoes: OpcoesCompilar,
): Promise<ResultadoCompilacao> {
  const { urlWorker, token, buscar = fetch, timeoutMs = 30_000 } = opcoes;

  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), timeoutMs);

  let resposta: Response;
  try {
    resposta = await buscar(`${urlWorker.replace(/\/+$/, "")}/compilar`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-worker-token": token,
      },
      body: JSON.stringify({ cv }),
      signal: controle.signal,
    });
  } catch (e) {
    /**
     * O worker fora do ar não pode derrubar a página.
     *
     * A pessoa acabou de preencher o currículo inteiro. Uma tela de erro do
     * Next, com o trabalho ainda no banco mas sem caminho de volta, seria a
     * pior forma de perder alguém no último passo.
     */
    return {
      ok: false,
      codigo: controle.signal.aborted ? "TEMPO_ESGOTADO" : "ERRO_INTERNO",
      mensagem: controle.signal.aborted
        ? "A geração está demorando mais que o normal. Tente de novo em instantes."
        : "Não conseguimos falar com o gerador de PDF agora. Seu currículo está salvo.",
    };
  } finally {
    clearTimeout(relogio);
  }

  const corpo: unknown = await resposta.json().catch(() => null);

  if (!resposta.ok) {
    // O worker devolve erro no formato do contrato; se vier outra coisa, é
    // defeito nosso e a mensagem genérica protege o usuário de detalhe
    // interno.
    const erro = erroCompilacaoSchema.safeParse(corpo);
    if (erro.success) {
      return {
        ok: false,
        codigo: erro.data.codigo,
        mensagem: erro.data.mensagem,
        requestId: erro.data.requestId,
      };
    }
    return {
      ok: false,
      codigo: "ERRO_INTERNO",
      mensagem: "Algo deu errado ao gerar o PDF. Seu currículo está salvo.",
    };
  }

  const validada = compilarRespostaSchema.safeParse(corpo);
  if (!validada.success) {
    // Contrato quebrado entre web e worker: normalmente versões diferentes
    // em produção. Falha explícita é melhor que renderizar lixo.
    return {
      ok: false,
      codigo: "ERRO_INTERNO",
      mensagem: "Recebemos uma resposta inesperada do gerador de PDF.",
    };
  }

  return { ok: true, resposta: validada.data };
}
