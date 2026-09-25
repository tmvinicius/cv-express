import type { Progresso } from "../formulario/maquina";

/**
 * Barra de progresso das etapas.
 *
 * Sem decisão visual: cor, tipografia e espaçamento vêm dos tokens do design
 * system (Parte 9). Aqui está só a estrutura e a semântica.
 *
 * A acessibilidade não é enfeite neste componente. `role="progressbar"` com
 * os valores `aria-*` é o que faz um leitor de tela anunciar "etapa 3 de 6,
 * 40 por cento" — sem isso, quem não enxerga a barra não tem como saber onde
 * está no formulário.
 */
export function BarraProgresso({ progresso }: { progresso: Progresso }) {
  const { percentual, posicaoAtual, totalDeEtapas, rotuloAtual } = progresso;

  return (
    <div className="barra-progresso">
      <div className="barra-progresso__rotulo">
        <span>{rotuloAtual}</span>
        <span>
          Etapa {posicaoAtual} de {totalDeEtapas}
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuenow={percentual}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Progresso: ${rotuloAtual}, etapa ${posicaoAtual} de ${totalDeEtapas}`}
        className="barra-progresso__trilho"
      >
        <div
          className="barra-progresso__preenchimento"
          style={{ width: `${percentual}%` }}
        />
      </div>
    </div>
  );
}
