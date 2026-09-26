"use client";
import { useId } from "react";

export interface Opcao<T extends string> {
  valor: T;
  rotulo: string;
}

/**
 * Select com rótulo ligado, mesma amarração de acessibilidade do Campo.
 */
export function Selecao<T extends string>({
  rotulo,
  valor,
  opcoes,
  aoMudar,
}: {
  rotulo: string;
  valor: T;
  opcoes: readonly Opcao<T>[];
  aoMudar: (v: T) => void;
}) {
  const id = useId();
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
      >
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
    </div>
  );
}
