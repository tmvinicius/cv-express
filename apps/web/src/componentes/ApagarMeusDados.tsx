"use client";

import { useState } from "react";

/**
 * "Apagar meus dados" — obrigação de LGPD, não recurso.
 *
 * A ação (`acaoApagarTudo`) existia, apagava em cascata e tinha teste desde o
 * começo; faltava quem a chamasse. Enquanto faltou, o produto prometia no
 * README um direito que não tinha como ser exercido.
 *
 * POR QUE A CONFIRMAÇÃO EM DOIS PASSOS, e não `window.confirm`:
 *
 * O apagamento é `DELETE`, sem soft delete e sem desfazer — é o único botão do
 * produto cujo erro não tem correção. Um `confirm()` nativo não é estilizável,
 * alguns navegadores móveis o suprimem em certos contextos, e ele não é
 * testável sem dublê. Dois passos no próprio DOM deixam a consequência
 * escrita na tela, onde a pessoa está olhando.
 *
 * O segundo passo nasce com o foco no botão de cancelar, não no de confirmar:
 * quem chegou aqui sem querer sai apertando Enter.
 */
export function ApagarMeusDados({
  aoApagar,
}: {
  /** Apaga tudo e leva a pessoa embora. Devolve false se não deu. */
  aoApagar: () => Promise<boolean>;
}) {
  const [fase, setFase] = useState<"ocioso" | "confirmando" | "apagando" | "erro">(
    "ocioso",
  );

  if (fase === "ocioso") {
    return (
      <div className="apagar">
        <button type="button" className="apagar__abrir" onClick={() => setFase("confirmando")}>
          Apagar meus dados
        </button>
      </div>
    );
  }

  return (
    <div className="apagar apagar--aberto">
      {/* role="alertdialog" e não "dialog": o leitor de tela anuncia o texto
          junto com a abertura, em vez de esperar a pessoa navegar até ele. */}
      <div role="alertdialog" aria-labelledby="apagar-titulo" aria-describedby="apagar-texto">
        <p id="apagar-titulo" className="apagar__titulo">
          Apagar o currículo e a sessão?
        </p>
        <p id="apagar-texto" className="apagar__texto">
          Isso remove tudo o que você preencheu, agora e para sempre. Não dá
          para desfazer, e o endereço desta página deixa de funcionar.
          {" "}
          <strong>Se ainda não baixou o PDF, baixe antes.</strong>
        </p>

        {fase === "erro" && (
          <p className="apagar__erro" role="alert">
            Não conseguimos apagar agora. Seus dados continuam aqui — tente de
            novo em instantes.
          </p>
        )}

        <div className="apagar__acoes">
          {/* Cancelar vem primeiro e recebe o foco: quem abriu sem querer sai
              no Enter. */}
          <button
            type="button"
            autoFocus
            onClick={() => setFase("ocioso")}
            disabled={fase === "apagando"}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="apagar__confirmar"
            disabled={fase === "apagando"}
            onClick={() => {
              setFase("apagando");
              void aoApagar().then((ok) => {
                // Em sucesso não se volta ao estado "ocioso": quem chamou
                // redireciona, e mexer no estado de um componente que está
                // saindo da tela só produziria um piscar.
                if (!ok) setFase("erro");
              });
            }}
          >
            {fase === "apagando" ? "Apagando…" : "Sim, apagar tudo"}
          </button>
        </div>
      </div>
    </div>
  );
}
