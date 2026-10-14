"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { PaginasPdf } from "../preview/PaginasPdf";

export type EstadoPreview =
  | { fase: "gerando" }
  | { fase: "pronto"; pdfBase64: string; paginas: number }
  | {
      fase: "erro";
      mensagem: string;
      /**
       * Nem "tentar de novo" nem "continua salvo" se aplicam: a sessão
       * acabou (o prazo venceu, ou os dados foram apagados em outra aba).
       * Repetir dá o mesmo resultado, e dizer que está salvo seria falso.
       */
      definitivo?: boolean;
    };

/**
 * Preview do PDF.
 *
 * As páginas são desenhadas pelo PDF.js (`preview/PaginasPdf.tsx`), e não
 * pelo leitor de PDF do navegador num <iframe> — que era a versão anterior e
 * não funcionava no celular: o Chrome do Android não mostra PDF dentro da
 * página, e o Safari do iPhone mostra só a primeira. O motivo inteiro está
 * no comentário de `PaginasPdf`.
 *
 * O <iframe> continua aqui como PLANO B: se o PDF.js não carregar (rede
 * instável no meio do download do script, navegador sem algum recurso), o
 * computador ainda mostra o PDF pelo leitor dele. E o botão de baixar existe
 * nos dois caminhos — é ele que nunca pode faltar.
 */
export function Preview({
  estado,
  nomeArquivo,
  aoTentarDeNovo,
}: {
  estado: EstadoPreview;
  nomeArquivo: string;
  aoTentarDeNovo?: () => void;
}) {
  const bytes = usePdfDecodificado(estado.fase === "pronto" ? estado.pdfBase64 : null);
  const url = useBlobUrl(bytes);
  const [pdfJsFalhou, setPdfJsFalhou] = useState(false);

  // O último PDF bom, para o PDF.js manter as páginas na tela enquanto o
  // próximo compila — o mesmo cuidado que `ultimaUrlBoa` tem com o link.
  const ultimosBytes = useRef<Uint8Array | null>(null);
  if (bytes) ultimosBytes.current = bytes;
  const bytesExibidos = bytes ?? ultimosBytes.current;

  /**
   * O PDF anterior fica na tela enquanto o novo compila.
   *
   * Sem isso, cada edição pisca para o branco e volta — a sensação é de que
   * algo quebrou. Guardar a última URL boa custa uma ref e remove o pior
   * efeito colateral da recompilação.
   */
  const ultimaUrlBoa = useRef<string | null>(null);
  if (url) ultimaUrlBoa.current = url;
  const urlExibida = url ?? ultimaUrlBoa.current;

  if (estado.fase === "erro") {
    return (
      <div className="preview preview--erro" role="alert">
        <p>{estado.mensagem}</p>
        {!estado.definitivo && (
          <p className="preview__consolo">
            Seu currículo continua salvo — nada do que você escreveu se perdeu.
          </p>
        )}
        {aoTentarDeNovo && !estado.definitivo && (
          <button type="button" onClick={aoTentarDeNovo}>
            Tentar de novo
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="preview">
      {estado.fase === "gerando" && (
        <p className="preview__status" role="status" aria-live="polite">
          {urlExibida ? "Atualizando seu currículo…" : "Montando seu currículo…"}
        </p>
      )}

      {urlExibida ? (
        <>
          {/* O download vem ANTES do documento, na ordem do DOM e não só na
              visual. Depois de um iframe de 80vh, a ação principal da tela
              ficava fora da primeira dobra — medido: y=1003 numa tela de
              844px no celular — e quem não rolasse até o fim não achava onde
              baixar. Mudar só com CSS (`order`) deixaria a ordem de
              tabulação contrária à da tela. */}
          <a
            href={urlExibida}
            download={nomeArquivo}
            className="preview__baixar"
          >
            Baixar currículo
          </a>
          {bytesExibidos && !pdfJsFalhou ? (
            <PaginasPdf bytes={bytesExibidos} aoFalhar={() => setPdfJsFalhou(true)} />
          ) : (
            <iframe
              src={urlExibida}
              title="Pré-visualização do seu currículo"
              className="preview__documento"
            />
          )}
        </>
      ) : (
        // Sem PDF ainda e sem erro: só a mensagem de status acima.
        <div className="preview__vazio" aria-hidden="true" />
      )}
    </div>
  );
}

/**
 * O base64 do worker, decodificado UMA vez por PDF.
 *
 * As páginas (PDF.js) e o link de download usam os mesmos bytes. Base64
 * corrompido vira `null`: o preview mostra o estado vazio em vez de quebrar
 * a página inteira.
 */
function usePdfDecodificado(base64: string | null): Uint8Array | null {
  return useMemo(() => {
    if (base64 === null) return null;
    try {
      return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    } catch {
      return null;
    }
  }, [base64]);
}

/**
 * Uma URL para o link de download (e para o <iframe> do plano B).
 *
 * A URL é revogada quando o PDF muda ou o componente sai da tela. Sem isso,
 * cada recompilação deixaria um PDF inteiro preso na memória do navegador —
 * e o preview recompila a cada edição.
 */
function useBlobUrl(bytes: Uint8Array | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (bytes === null) {
      setUrl(null);
      return;
    }
    const criada = URL.createObjectURL(
      new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }),
    );
    setUrl(criada);
    return () => URL.revokeObjectURL(criada);
  }, [bytes]);

  return url;
}
