"use client";

import type { EstadoEtapa, EtapaNaTrilha, Progresso } from "../formulario/maquina";
import type { IdEtapa } from "../formulario/etapas";

/**
 * A trilha das seis etapas de preenchimento.
 *
 * O que ela resolve: antes havia só um trilho colorido e a frase "Etapa 1 de
 * 6". Quem chegava na etapa 4 não tinha como saber quais eram as outras, o
 * que já tinha ficado pronto, nem que dava para voltar e corrigir uma coisa
 * só. Formulário longo sem mapa parece armadilha.
 *
 * Três decisões que valem o comentário:
 *
 * 1. O estado de cada etapa NÃO é calculado aqui. Vem inteiro de
 *    `calcularProgresso`, a mesma função que alimenta a barra — é isso que
 *    impede a trilha e a barra de discordarem, que era o defeito relatado.
 *
 * 2. Etapa inalcançável é TEXTO, não botão desabilitado. Um botão cinza
 *    convida ao clique e não responde; e, se desabilitado de verdade, sai da
 *    ordem de tabulação sem dizer por quê. Sem afordância não há clique morto.
 *
 * 3. O estado aparece em palavras, além da cor e do ícone. Cor sozinha não
 *    comunica nada para quem tem daltonismo (WCAG 1.4.1) nem para quem usa
 *    leitor de tela — daí o sufixo em `.apenas-leitor` de cada item.
 */
export function TrilhaEtapas({
  progresso,
  aoEscolher,
}: {
  progresso: Progresso;
  aoEscolher: (etapa: IdEtapa) => void;
}) {
  return (
    <nav className="trilha" aria-label="Etapas do formulário">
      <ol className="trilha__lista">
        {progresso.etapas.map((etapa) => (
          <li
            key={etapa.id}
            className={classeDoItem(etapa)}
            // A lista inteira é uma sequência; marcar a atual aqui faz o
            // leitor de tela anunciar "etapa atual" ao percorrer.
            {...(etapa.atual ? { "aria-current": "step" as const } : {})}
          >
            <ConteudoDaEtapa etapa={etapa} aoEscolher={aoEscolher} />
          </li>
        ))}
      </ol>
    </nav>
  );
}

function ConteudoDaEtapa({
  etapa,
  aoEscolher,
}: {
  etapa: EtapaNaTrilha;
  aoEscolher: (etapa: IdEtapa) => void;
}) {
  const interior = (
    <>
      <span className="trilha__marca" aria-hidden="true">
        {marcaDe(etapa)}
      </span>
      <span className="trilha__rotulo">
        {etapa.rotulo}
        {/* O planejamento pede que "opcional" seja VISÍVEL: alguém sem segundo
            idioma não pode achar que travou. aria-hidden porque a descrição
            abaixo já diz o mesmo em voz alta. */}
        {etapa.opcional && etapa.estado !== "concluida" && (
          <span className="trilha__opcional" aria-hidden="true">
            opcional
          </span>
        )}
      </span>
      <span className="apenas-leitor">{descricaoDe(etapa)}</span>
    </>
  );

  // Já visitada ou alcançável: dá para ir, inclusive para trás, sem validar
  // nada — voltar para corrigir uma coisa só é o caso de uso principal desta
  // trilha.
  if (etapa.acessivel && !etapa.atual) {
    return (
      <button
        type="button"
        className="trilha__alvo"
        onClick={() => aoEscolher(etapa.id)}
      >
        {interior}
      </button>
    );
  }

  return <span className="trilha__alvo trilha__alvo--fixo">{interior}</span>;
}

function classeDoItem(etapa: EtapaNaTrilha): string {
  const classes = ["trilha__etapa", `trilha__etapa--${etapa.estado}`];
  if (etapa.atual) classes.push("trilha__etapa--atual");
  if (!etapa.acessivel) classes.push("trilha__etapa--inalcancavel");
  return classes.join(" ");
}

/**
 * O símbolo do marcador.
 *
 * `aria-hidden` porque é redundante com `descricaoDe` — o leitor de tela
 * anunciaria "marca de verificação" e depois "concluída".
 */
function marcaDe(etapa: EtapaNaTrilha): string {
  if (etapa.estado === "concluida") return "✓";
  if (etapa.estado === "pulada") return "–";
  return String(etapa.posicao);
}

/** O estado em palavras, para quem não vê a cor. */
function descricaoDe(etapa: EtapaNaTrilha): string {
  const partes: string[] = [`etapa ${etapa.posicao}`];

  if (etapa.atual) partes.push("onde você está");

  const porEstado: Record<EstadoEtapa, string> = {
    concluida: "concluída",
    // "Pulada" e não "vazia": foi uma escolha legítima, e o texto precisa
    // soar assim para quem não tem experiência a declarar.
    pulada: "pulada, e está tudo bem",
    pendente: etapa.opcional ? "opcional, ainda em branco" : "ainda falta",
  };
  partes.push(porEstado[etapa.estado]);

  if (!etapa.acessivel) partes.push("disponível depois das etapas anteriores");

  return `, ${partes.join(", ")}`;
}
