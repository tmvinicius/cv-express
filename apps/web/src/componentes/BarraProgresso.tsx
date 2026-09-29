import type { Progresso } from "../formulario/maquina";

/**
 * Barra de progresso das etapas.
 *
 * Sem decisão visual: cor, tipografia e espaçamento vêm dos tokens do design
 * system (Parte 9). Aqui está só a estrutura e a semântica.
 *
 * Todo número exibido aqui vem de `calcularProgresso`, inclusive o "Etapa X de
 * 6". Nada é recontado neste arquivo — foi assim que a versão anterior passou
 * a se contradizer: a barra media etapas preenchidas e o contador media
 * posição na fila, e o resultado era "0%" ao lado de "Etapa 1 de 6".
 *
 * A acessibilidade não é enfeite neste componente. `role="progressbar"` com os
 * valores `aria-*` é o que faz um leitor de tela anunciar onde a pessoa está —
 * sem isso, quem não enxerga a barra não tem como saber. E `aria-valuetext`
 * substitui o "40 por cento" seco por "2 de 6 etapas prontas", que é a
 * informação que a pessoa quer.
 */
export function BarraProgresso({ progresso }: { progresso: Progresso }) {
  const { percentual, posicaoAtual, totalDeEtapas, rotuloAtual, resolvidas, naTrilha } =
    progresso;

  // "Prontas" inclui as opcionais puladas de propósito. É o mesmo critério da
  // barra porque é o mesmo número.
  const contagem = `${resolvidas} de ${totalDeEtapas} etapas prontas`;

  return (
    <div className="barra-progresso">
      <div className="barra-progresso__rotulo">
        {/* Fora das seis etapas de preenchimento (gerando,
            preview) não existe "Etapa X de 6" para mostrar — anunciar uma
            posição ali era parte da contradição. */}
        <span>
          {naTrilha ? `Etapa ${posicaoAtual} de ${totalDeEtapas}: ${rotuloAtual}` : rotuloAtual}
        </span>
        <span>{contagem}</span>
      </div>

      <div
        role="progressbar"
        aria-valuenow={percentual}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={contagem}
        aria-label="Progresso do preenchimento"
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
