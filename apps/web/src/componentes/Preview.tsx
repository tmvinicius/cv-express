"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type EstadoPreview =
  | { fase: "gerando" }
  | { fase: "pronto"; pdfBase64: string; paginas: number }
  | { fase: "erro"; mensagem: string };

/**
 * Preview do PDF.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DECISÃO: `<iframe>` com blob, e não react-pdf
 *
 * O planejamento prevê react-pdf (PDF.js) para o preview. Aqui o PDF é
 * exibido em um iframe apontando para uma blob URL.
 *
 * O motivo é escopo: react-pdf existe no plano para sustentar a sobreposição
 * de regiões clicáveis sobre o documento. Como a edição desta versão acontece
 * pelo painel lateral de seções — o "plano B" que o próprio planejamento
 * manda construir primeiro —, nada aqui precisa de acesso ao conteúdo
 * renderizado. O iframe entrega o mesmo resultado com zero dependências,
 * controles nativos de zoom e impressão, e sem o worker do PDF.js para
 * configurar.
 *
 * Quando a sobreposição entrar, react-pdf entra junto: é quando ele passa a
 * pagar o próprio custo.
 * ───────────────────────────────────────────────────────────────────────────
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
  const url = useBlobUrl(estado.fase === "pronto" ? estado.pdfBase64 : null);

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
        <p className="preview__consolo">
          Seu currículo continua salvo — nada do que você escreveu se perdeu.
        </p>
        {aoTentarDeNovo && (
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
          <iframe
            src={urlExibida}
            title="Pré-visualização do seu currículo"
            className="preview__documento"
          />
        </>
      ) : (
        // Sem PDF ainda e sem erro: só a mensagem de status acima.
        <div className="preview__vazio" aria-hidden="true" />
      )}
    </div>
  );
}

/**
 * Converte o base64 do worker em uma URL que o iframe consegue abrir.
 *
 * A URL é revogada quando o PDF muda ou o componente sai da tela. Sem isso,
 * cada recompilação deixaria um PDF inteiro preso na memória do navegador —
 * e o preview recompila a cada edição.
 */
function useBlobUrl(base64: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  // Memo pelo conteúdo: recompilar com o mesmo resultado não recria o blob.
  const chave = useMemo(() => base64, [base64]);

  useEffect(() => {
    if (chave === null) {
      setUrl(null);
      return;
    }

    let criada: string | null = null;

    try {
      const bytes = Uint8Array.from(atob(chave), (c) => c.charCodeAt(0));
      criada = URL.createObjectURL(
        new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }),
      );
      setUrl(criada);
    } catch {
      // base64 corrompido: o preview mostra o estado vazio em vez de quebrar
      // a página inteira.
      setUrl(null);
    }

    return () => {
      if (criada) URL.revokeObjectURL(criada);
    };
  }, [chave]);

  return url;
}
