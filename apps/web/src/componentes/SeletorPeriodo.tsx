"use client";
import { useId } from "react";
import {
  ATUAL,
  type DataMesAno,
  type FimPeriodo,
  type Periodo,
} from "@cv-express/schema";
import { formatarPeriodo } from "@cv-express/templates/formatadores";
import { ptBR } from "@cv-express/i18n";
import { temErro, type Diagnostico } from "../formulario/coerencia";

/**
 * Nomes de mês da INTERFACE, por extenso.
 *
 * O dicionário de `@cv-express/i18n` guarda as abreviações do DOCUMENTO
 * ("jan/2021" é a convenção brasileira em currículo) e é só isso que ele
 * promete. Numa lista suspensa, "jan" parece formulário inacabado; aqui há
 * espaço para o nome inteiro, e a pessoa escolhe lendo, não decifrando.
 *
 * O valor gravado continua sendo o número do mês, então esta lista é
 * puramente visual — trocar uma palavra aqui não toca em dado nenhum. É a
 * mesma divisão que o i18n já declara no próprio arquivo: rótulo de documento
 * lá, texto de interface no app web.
 */
const MESES_INTERFACE = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

/**
 * Início e fim de um período.
 *
 * Mês e ano em selects separados, e não um campo de texto livre. O schema
 * exige { ano, mes }; deixar a pessoa digitar "jan/2020" obrigaria a
 * interpretar formato brasileiro, americano, com e sem barra — e a errar em
 * algum deles. Dois selects não têm como produzir data inválida.
 *
 * DOIS MODOS, porque emprego e curso não terminam do mesmo jeito:
 *
 * - `permitirEmAberto` (o padrão, usado por experiências): oferece o checkbox
 *   de "trabalho aqui atualmente", que grava o marcador `atual` em vez de uma
 *   data. Existe porque "atual" não É uma data: gravar a de hoje congelaria o
 *   currículo no dia do preenchimento.
 * - sem ele (usado por formação): o término é sempre uma data, e pode estar no
 *   futuro — é a previsão de formatura. "2022 – dez/2027" diz ao recrutador
 *   quando a pessoa se forma; "2022 – atual" não diz nada. Quem ainda está
 *   cursando informa isso pela Situação ("Em andamento"), que já existe e sai
 *   impressa no PDF.
 *
 * FORMA VISUAL: os quatro controles são UM período, não quatro campos soltos.
 * Daí o desenho em intervalo — início, travessão, término — com o mesmo
 * travessão que o PDF imprime entre as duas datas, e o resumo embaixo
 * mostrando o resultado pelo MESMO formatador que compõe o documento. A
 * pessoa lê na tela a linha que vai sair impressa; não precisa imaginá-la.
 *
 * Os `diagnosticos` aparecem AQUI, colados nos selects, e não só na lista do
 * rodapé depois de tentar avançar. Dois selects não produzem data inválida,
 * mas produzem com folga um período invertido — e esse é justamente o dado
 * que o autosave recusa gravar, em silêncio, se ninguém avisar a tempo.
 */
export function SeletorPeriodo({
  inicio,
  fim,
  aoMudarInicio,
  aoMudarFim,
  rotuloAtual = "Trabalho aqui atualmente",
  rotuloTermino = "Término",
  permitirEmAberto = true,
  anosFuturos = 0,
  diagnosticos = [],
}: {
  inicio: DataMesAno;
  fim: FimPeriodo;
  aoMudarInicio: (d: DataMesAno) => void;
  aoMudarFim: (f: FimPeriodo) => void;
  rotuloAtual?: string;
  /** Legenda do grupo de término. "Conclusão (ou previsão)" em formação. */
  rotuloTermino?: string;
  /** Oferece o checkbox de período em aberto? Formação não oferece. */
  permitirEmAberto?: boolean;
  /**
   * Quantos anos à frente entram na lista.
   *
   * Zero para experiência: emprego futuro se declara pelo checkbox. Para
   * formação, o teto é o do schema (`LIMITES.ANO_MAX_FUTURO`), então nenhuma
   * opção oferecida é recusada na validação.
   */
  anosFuturos?: number;
  /** Incoerências de data já calculadas por `formulario/coerencia`. */
  diagnosticos?: readonly Diagnostico[];
}) {
  const idAtual = useId();
  const idDiagnosticos = `${idAtual}-diagnosticos`;
  const ehAtual = permitirEmAberto && fim === ATUAL;
  const anoCorrente = new Date().getFullYear();
  const anos = Array.from(
    { length: 60 + anosFuturos },
    (_, i) => anoCorrente + anosFuturos - i,
  );

  const invalido = temErro(diagnosticos);

  /**
   * Término exibido quando o modo não permite período em aberto.
   *
   * Um currículo gravado antes desta mudança pode ter `fim: "atual"` numa
   * formação. Sem esta conversão, o select receberia a string e nasceria
   * descontrolado. Mostrar o início é o palpite menos errado, e o
   * `diagnosticarFormacao` pede a data em voz alta — em vez de gravar por
   * conta própria uma previsão que a pessoa não escolheu.
   */
  const fimExibido: DataMesAno = fim === ATUAL ? inicio : fim;

  /** O que o resumo mostra: sempre o que os controles estão dizendo. */
  const periodoExibido: Periodo = {
    inicio,
    fim: ehAtual ? ATUAL : fimExibido,
  };

  const grupo = (
    legenda: string,
    valor: DataMesAno,
    aoMudar: (d: DataMesAno) => void,
  ) => (
    <fieldset
      className="periodo__grupo"
      // aria-describedby no fieldset e não em cada select: a mensagem fala do
      // par de datas, e repeti-la nos dois campos faria o leitor de tela
      // anunciá-la quatro vezes ao percorrer o período.
      {...(diagnosticos.length > 0 ? { "aria-describedby": idDiagnosticos } : {})}
    >
      <legend className="periodo__rotulo">{legenda}</legend>

      <div className="periodo__selects">
        <select
          // A classe é a mesma dos outros campos de propósito: o período não é
          // um controle especial, e parecer um era metade do problema.
          className="campo__entrada"
          aria-label={`${legenda}: mês`}
          aria-invalid={invalido}
          value={valor.mes}
          onChange={(e) => aoMudar({ ...valor, mes: Number(e.target.value) })}
        >
          {MESES_INTERFACE.map((nome, i) => (
            <option key={nome} value={i + 1}>
              {nome}
            </option>
          ))}
        </select>

        <select
          className="campo__entrada"
          aria-label={`${legenda}: ano`}
          aria-invalid={invalido}
          value={valor.ano}
          onChange={(e) => aoMudar({ ...valor, ano: Number(e.target.value) })}
        >
          {anos.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>
    </fieldset>
  );

  return (
    <div className={`periodo ${invalido ? "periodo--invalido" : ""}`}>
      <div className="periodo__intervalo">
        {grupo("Início", inicio, aoMudarInicio)}

        {/* O mesmo travessão que separa as datas no PDF. aria-hidden porque
            para quem ouve a estrutura já vem dos dois grupos rotulados, e o
            resumo abaixo lê o intervalo inteiro. */}
        <span className="periodo__travessao" aria-hidden="true">
          –
        </span>

        {ehAtual ? (
          /* Ocupa o lugar do grupo de término para o intervalo não desmontar
             quando a pessoa marca a caixa. O texto está no resumo, abaixo. */
          <p className="periodo__marca-atual" aria-hidden="true">
            atual
          </p>
        ) : (
          grupo(rotuloTermino, fimExibido, aoMudarFim)
        )}
      </div>

      {permitirEmAberto && (
        <div className="periodo__atual">
          <input
            id={idAtual}
            type="checkbox"
            checked={ehAtual}
            onChange={(e) => aoMudarFim(e.target.checked ? ATUAL : { ...inicio })}
          />
          <label htmlFor={idAtual}>{rotuloAtual}</label>
        </div>
      )}

      {/* Mesmo formatador do documento: a linha da tela é a linha do PDF. */}
      <p className="periodo__resumo">
        No currículo: <strong>{formatarPeriodo(periodoExibido, ptBR)}</strong>
        {ehAtual && " — e continua certo daqui a um ano."}
      </p>

      {diagnosticos.length > 0 && (
        /*
         * role="status" e não "alert": o aviso nasce enquanto a pessoa ainda
         * mexe nos selects, e "alert" interromperia a leitura a cada troca de
         * mês. Bloqueio, quando há, vem do botão de avançar.
         */
        <ul id={idDiagnosticos} className="periodo__diagnosticos" role="status">
          {diagnosticos.map((d) => (
            <li
              key={d.mensagem}
              className={`periodo__diagnostico periodo__diagnostico--${d.severidade}`}
            >
              {d.mensagem} <span className="periodo__sugestao">{d.sugestao}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
