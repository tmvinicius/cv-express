"use client";

export type EstadoSugestao =
  | { fase: "ocioso" }
  | { fase: "pensando" }
  | { fase: "pronta"; bullets: string[] }
  | { fase: "erro"; mensagem: string };

export interface AprovacaoIaProps {
  original: string;
  estado: EstadoSugestao;
  aoPedir: () => void;
  aoUsar: (bullets: string[]) => void;
  aoManterOriginal: () => void;
}

/**
 * Comparação Original × Sugerido, com aprovação humana obrigatória.
 *
 * Este componente é onde o produto cumpre — ou quebra — a promessa central:
 * a IA organiza o que a pessoa escreveu e nada é aplicado sem ela ver.
 *
 * Três decisões que o planejamento exige e que estão codificadas aqui:
 *
 * 1. NADA é aplicado sozinho. Não existe caminho em que a sugestão entre no
 *    currículo sem um clique explícito. É por isso que `aoUsar` só é chamado
 *    pelo botão, e não por efeito ao receber a resposta.
 *
 * 2. O texto original fica visível o tempo todo, lado a lado. A pessoa
 *    precisa conseguir comparar; esconder o original transformaria a escolha
 *    em fé.
 *
 * 3. Falha da IA não bloqueia nada. O erro aparece como aviso, e o texto
 *    original segue valendo — a pessoa continua e gera o currículo.
 */
export function AprovacaoIa({
  original,
  estado,
  aoPedir,
  aoUsar,
  aoManterOriginal,
}: AprovacaoIaProps) {
  const temTexto = original.trim() !== "";

  if (estado.fase === "ocioso") {
    return (
      <div className="ia">
        <button
          type="button"
          onClick={aoPedir}
          disabled={!temTexto}
          className="ia__pedir"
        >
          Organizar com ajuda da IA
        </button>
        <p className="ia__explicacao">
          A IA reescreve o que você digitou em tópicos. Ela não inventa nada —
          e você decide se usa.
        </p>
      </div>
    );
  }

  if (estado.fase === "pensando") {
    return (
      <p className="ia ia--pensando" role="status" aria-live="polite">
        Organizando o que você escreveu…
      </p>
    );
  }

  if (estado.fase === "erro") {
    return (
      <div className="ia ia--erro" role="status" aria-live="polite">
        <p>{estado.mensagem}</p>
        {/* O texto original continua valendo: ninguém fica preso. */}
        <button type="button" onClick={aoPedir} className="ia__pedir">
          Tentar de novo
        </button>
      </div>
    );
  }

  return (
    <section className="ia ia--comparacao" aria-label="Comparar sua descrição com a sugestão">
      <div className="ia__lado">
        <h3 className="ia__titulo">O que você escreveu</h3>
        <p className="ia__original">{original}</p>
      </div>

      <div className="ia__lado">
        <h3 className="ia__titulo">Sugestão</h3>
        <ul className="ia__bullets">
          {estado.bullets.map((b, i) => (
            <li key={`${i}-${b.slice(0, 12)}`}>{b}</li>
          ))}
        </ul>
      </div>

      <div className="ia__acoes">
        <button type="button" onClick={() => aoUsar(estado.bullets)}>
          Usar sugestão
        </button>
        <button type="button" onClick={aoManterOriginal}>
          Manter o meu texto
        </button>
      </div>
    </section>
  );
}
