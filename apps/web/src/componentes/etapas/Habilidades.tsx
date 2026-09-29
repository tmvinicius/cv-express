"use client";
import { LIMITES, type CategoriaHabilidade, type CvData } from "@cv-express/schema";
import { ptBR } from "@cv-express/i18n";
import { Campo } from "../Campo";
import { IA_DESLIGADA } from "../mensagensIa";
import type { Despachar } from "../../formulario/reducer";

export type EstadoHabilidades =
  | { fase: "ocioso" }
  | { fase: "pensando" }
  | { fase: "pronta"; itens: { nome: string; categoria: CategoriaHabilidade }[] }
  /** `tentavel` é falso quando repetir não tem como dar em outra coisa. */
  | { fase: "erro"; mensagem: string; tentavel: boolean };

/**
 * Habilidades: entrada livre, normalizada pela IA.
 *
 * O campo é uma caixa de texto e não uma lista de chips por decisão
 * deliberada: pedir para a pessoa cadastrar habilidade por habilidade, com
 * categoria, seria o formulário mais chato do fluxo. Ela escreve como pensa
 * — "python, sql, trabalho em equipe" — e a IA organiza.
 *
 * A aprovação continua obrigatória, e aqui ela tem função extra: a pessoa vê
 * em que categoria cada habilidade caiu e percebe se algo saiu errado.
 */
export function Habilidades({
  cv,
  despachar,
  estado,
  iaDisponivel = true,
  aoPedirSugestao,
}: {
  cv: CvData;
  despachar: Despachar;
  estado: EstadoHabilidades;
  /** O servidor tem IA configurada? Vem de fora porque só ele sabe. */
  iaDisponivel?: boolean;
  aoPedirSugestao: () => void;
}) {
  const h = cv.habilidades;
  // Sem IA, a única coisa que muda nesta etapa é o botão: o texto livre já é
  // um currículo válido, e é ele que vai para o PDF.
  const semTexto = h.textoOriginal.trim() === "";

  return (
    <div className="etapa">
      <h2>O que você sabe fazer?</h2>

      <Campo
        rotulo="Suas habilidades"
        valor={h.textoOriginal}
        aoMudar={(v) => despachar({ tipo: "hab:texto", valor: v })}
        ajuda="Escreva separando por vírgula, do jeito que vier à cabeça. Ferramentas, idiomas de programação, habilidades de convivência — tudo vale."
        placeholder="python, sql, trabalho em equipe, excel"
        multilinha
        maxLength={LIMITES.HABILIDADES_TEXTO_MAX}
      />

      {h.itens.length > 0 ? (
        <section className="habilidades-aplicadas" aria-label="Habilidades organizadas">
          <h3>Como vão aparecer</h3>
          <ul>
            {h.itens.map((item) => (
              <li key={item.id}>
                {item.nome}{" "}
                <span className="habilidade__categoria">
                  ({ptBR.categoriasHabilidade[item.categoria]})
                </span>
                <button
                  type="button"
                  onClick={() => despachar({ tipo: "hab:remover", id: item.id })}
                  aria-label={`Remover ${item.nome}`}
                >
                  Remover
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => despachar({ tipo: "hab:recusarIa" })}>
            Voltar ao meu texto
          </button>
        </section>
      ) : (
        <div className="ia">
          {estado.fase === "pensando" && (
            <p role="status" aria-live="polite">
              Organizando suas habilidades…
            </p>
          )}

          {estado.fase === "erro" && (
            <p role="status" aria-live="polite">
              {estado.mensagem}
            </p>
          )}

          {estado.fase === "pronta" && (
            <section aria-label="Sugestão de habilidades organizadas">
              <h3>Sugestão</h3>
              <ul>
                {estado.itens.map((i) => (
                  <li key={i.nome}>
                    {i.nome} ({ptBR.categoriasHabilidade[i.categoria]})
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => despachar({ tipo: "hab:aplicarIa", itens: estado.itens })}
              >
                Usar sugestão
              </button>
              <button
                type="button"
                onClick={() => despachar({ tipo: "hab:recusarIa" })}
              >
                Manter o meu texto
              </button>
            </section>
          )}

          {!iaDisponivel && estado.fase === "ocioso" && (
            <p className="ia__explicacao">{IA_DESLIGADA}</p>
          )}

          {(estado.fase === "ocioso" ||
            (estado.fase === "erro" && estado.tentavel)) && (
            <button
              type="button"
              onClick={aoPedirSugestao}
              disabled={!iaDisponivel || semTexto}
              {...(iaDisponivel ? {} : { title: IA_DESLIGADA })}
            >
              Organizar com ajuda da IA
            </button>
          )}
        </div>
      )}
    </div>
  );
}
