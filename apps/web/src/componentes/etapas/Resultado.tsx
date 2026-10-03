"use client";

import { useEffect, type ReactNode } from "react";
import type { CvData } from "@cv-express/schema";

import { ETAPAS, type IdEtapa } from "../../formulario/etapas";
import { prontoParaGerar } from "../../formulario/maquina";
import { useCompilacao, type Compilar } from "../../preview/useCompilacao";
import { sugerirCortes } from "../../preview/sugestoesDeCorte";
import { Preview } from "../Preview";
import { AvisoPaginas } from "../AvisoPaginas";
import { PainelSecoes } from "../PainelSecoes";

/**
 * As duas telas depois do preenchimento: "gerando" e o preview.
 *
 * Existe porque, até aqui, NENHUMA das peças do fim do fluxo estava ligada.
 * Preview, AvisoPaginas, PainelSecoes, useCompilacao e acaoCompilar tinham
 * código e teste, mas nenhuma tela os renderizava: quem terminava a etapa de
 * habilidades caía numa página vazia com um botão "Continuar", e o clique
 * seguinte respondia "Esta é a última etapa." O produto inteiro existe para
 * entregar o PDF, e ele nunca era entregue.
 *
 * As duas etapas compartilham o mesmo componente — e, portanto, a mesma
 * compilação. "gerando" avança sozinha para o preview quando o PDF do
 * conteúdo ATUAL fica pronto; o preview reaproveita esse resultado sem
 * compilar de novo, porque a instância do formulário sobrevive à troca de
 * `?etapa=` na URL.
 */
export function Resultado({
  cv,
  etapa,
  compilar,
  aoGerar,
  aoIrParaCampo,
  aoIrParaEtapa,
  conclusao,
}: {
  cv: CvData;
  etapa: "gerando" | "preview";
  compilar: Compilar;
  /** Chamado uma vez quando "gerando" termina com sucesso. */
  aoGerar: () => void;
  /** Leva a um campo ou item — vem do painel de seções e das sugestões de corte. */
  aoIrParaCampo: (fieldId: string) => void;
  aoIrParaEtapa: (etapa: IdEtapa) => void;
  /**
   * O "Concluir e salvar", logo abaixo do título do preview. Vem pronto do
   * formulário, que é quem tem o estado da conclusão.
   */
  conclusao?: ReactNode;
}) {
  const { pronto } = prontoParaGerar(cv);

  // Sem as etapas obrigatórias, nem chama o worker: ele recusaria o
  // currículo, e a pessoa leria um erro técnico sobre um problema que ela
  // resolve em dez segundos. `?etapa=preview` é digitável na URL, então isto
  // não é hipótese.
  const { estado, emDia, tentarDeNovo } = useCompilacao(cv, compilar, pronto);

  useEffect(() => {
    if (etapa === "gerando" && emDia) aoGerar();
  }, [etapa, emDia, aoGerar]);

  if (!pronto) {
    return <Pendencias cv={cv} aoIrParaEtapa={aoIrParaEtapa} />;
  }

  const nomeArquivo = nomeDoArquivo(cv.pessoal.nome);

  if (etapa === "gerando") {
    return (
      <div className="etapa">
        <h2>Montando seu currículo</h2>
        <p className="etapa__apoio">
          Estamos compondo o PDF a partir do que você escreveu. Leva poucos
          segundos.
        </p>
        <Preview estado={estado} nomeArquivo={nomeArquivo} aoTentarDeNovo={tentarDeNovo} />
      </div>
    );
  }

  return (
    <div className="etapa resultado">
      <h2>Seu currículo está pronto</h2>

      {conclusao}

      <div className="resultado__conteudo">
        <div className="resultado__documento">
          {estado.fase === "pronto" && (
            <AvisoPaginas
              paginas={estado.paginas}
              sugestoes={sugerirCortes(cv)}
              aoIrPara={aoIrParaCampo}
            />
          )}
          <Preview estado={estado} nomeArquivo={nomeArquivo} aoTentarDeNovo={tentarDeNovo} />
        </div>

        <PainelSecoes cv={cv} aoEscolher={aoIrParaCampo} />
      </div>
    </div>
  );
}

/**
 * O que falta antes de gerar.
 *
 * Aponta a ETAPA, com um botão, e não só a mensagem do schema: "pessoal.email:
 * Invalid email" diz o que está errado, mas não onde consertar.
 */
function Pendencias({
  cv,
  aoIrParaEtapa,
}: {
  cv: CvData;
  aoIrParaEtapa: (etapa: IdEtapa) => void;
}) {
  const faltando = ETAPAS.filter(
    (e) => !e.opcional && e.contaNoProgresso && e.validar(cv).length > 0,
  );

  return (
    <div className="etapa">
      <h2>Falta pouco para gerar</h2>
      <p className="etapa__apoio">
        Antes de montar o PDF, precisamos de mais alguma informação. Tudo o
        que você já escreveu continua salvo.
      </p>
      <ul className="pendencias">
        {faltando.map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => aoIrParaEtapa(e.id)}>
              Completar “{e.rotulo}”
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * `curriculo-ana-souza.pdf`.
 *
 * Sem acento e sem espaço porque o nome sai do navegador para o disco de
 * quem baixou e dali para anexos de e-mail e sistemas de RH — muitos deles
 * ainda estragam nome de arquivo com "ç" ou espaço.
 */
export function nomeDoArquivo(nome: string): string {
  const base = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base ? `curriculo-${base}.pdf` : "curriculo.pdf";
}
