"use client";
import { useId } from "react";

export interface Opcao<T extends string> {
  valor: T;
  rotulo: string;
}

/**
 * Select com rótulo ligado, mesma amarração de acessibilidade do Campo.
 *
 * A `ajuda` usa `aria-describedby` pelo mesmo motivo do Campo: um texto solto
 * embaixo do select é lido por quem enxerga e ignorado por quem usa leitor de
 * tela. Aqui ela carrega peso de verdade — é onde a etapa de formação explica
 * que "ainda cursando" se declara pela Situação, e não por uma caixa.
 */
export function Selecao<T extends string>({
  rotulo,
  valor,
  opcoes,
  aoMudar,
  ajuda,
}: {
  rotulo: string;
  valor: T;
  opcoes: readonly Opcao<T>[];
  aoMudar: (v: T) => void;
  /** Texto de apoio abaixo do select. */
  ajuda?: string;
}) {
  const id = useId();
  const idAjuda = `${id}-ajuda`;

  return (
    <div className="campo">
      <label htmlFor={id} className="campo__rotulo">
        {rotulo}
      </label>
      <select
        id={id}
        value={valor}
        onChange={(e) => aoMudar(e.target.value as T)}
        className="campo__entrada"
        {...(ajuda !== undefined ? { "aria-describedby": idAjuda } : {})}
      >
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>

      {ajuda && (
        <p id={idAjuda} className="campo__ajuda">
          {ajuda}
        </p>
      )}
    </div>
  );
}
