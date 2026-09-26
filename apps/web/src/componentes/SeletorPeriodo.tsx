"use client";
import { useId } from "react";
import { ATUAL, type DataMesAno, type FimPeriodo } from "@cv-express/schema";
import { ptBR } from "@cv-express/i18n";

/**
 * Início e fim de um período, com "atual" como opção.
 *
 * Mês e ano em selects separados, e não um campo de texto livre. O schema
 * exige { ano, mes }; deixar a pessoa digitar "jan/2020" obrigaria a
 * interpretar formato brasileiro, americano, com e sem barra — e a errar em
 * algum deles. Dois selects não têm como produzir data inválida.
 *
 * O checkbox de "trabalho aqui atualmente" existe porque "atual" não é uma
 * data: gravar a data de hoje congelaria o currículo no dia do
 * preenchimento.
 */
export function SeletorPeriodo({
  inicio,
  fim,
  aoMudarInicio,
  aoMudarFim,
  rotuloAtual = "Trabalho aqui atualmente",
}: {
  inicio: DataMesAno;
  fim: FimPeriodo;
  aoMudarInicio: (d: DataMesAno) => void;
  aoMudarFim: (f: FimPeriodo) => void;
  rotuloAtual?: string;
}) {
  const idAtual = useId();
  const ehAtual = fim === ATUAL;
  const anoCorrente = new Date().getFullYear();
  const anos = Array.from({ length: 60 }, (_, i) => anoCorrente - i);

  const seletorData = (
    legenda: string,
    valor: DataMesAno,
    aoMudar: (d: DataMesAno) => void,
    desabilitado = false,
  ) => (
    <fieldset className="periodo__grupo" disabled={desabilitado}>
      <legend>{legenda}</legend>
      <select
        aria-label={`${legenda}: mês`}
        value={valor.mes}
        onChange={(e) => aoMudar({ ...valor, mes: Number(e.target.value) })}
      >
        {ptBR.meses.map((nome, i) => (
          <option key={nome} value={i + 1}>
            {nome}
          </option>
        ))}
      </select>
      <select
        aria-label={`${legenda}: ano`}
        value={valor.ano}
        onChange={(e) => aoMudar({ ...valor, ano: Number(e.target.value) })}
      >
        {anos.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
    </fieldset>
  );

  return (
    <div className="periodo">
      {seletorData("Início", inicio, aoMudarInicio)}

      <div className="periodo__atual">
        <input
          id={idAtual}
          type="checkbox"
          checked={ehAtual}
          onChange={(e) =>
            aoMudarFim(e.target.checked ? ATUAL : { ...inicio })
          }
        />
        <label htmlFor={idAtual}>{rotuloAtual}</label>
      </div>

      {!ehAtual && seletorData("Término", fim as DataMesAno, aoMudarFim)}
    </div>
  );
}
