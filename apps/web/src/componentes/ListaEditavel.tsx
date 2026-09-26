"use client";
import type { ReactNode } from "react";

/**
 * Lista de itens que a pessoa acrescenta e remove.
 *
 * Usada por experiências, formação e idiomas. O ponto de extraí-la é o estado
 * vazio: uma etapa opcional sem nenhum item precisa deixar claro que ESTÁ
 * TUDO BEM seguir sem preencher. Sem isso, quem está no primeiro emprego acha
 * que travou — e é justamente quem mais precisa do produto.
 */
export function ListaEditavel<T extends { id: string }>({
  itens,
  titulo,
  textoVazio,
  rotuloAdicionar,
  renderizar,
  aoAdicionar,
  aoRemover,
  rotuloRemover,
}: {
  itens: readonly T[];
  titulo: string;
  textoVazio: string;
  rotuloAdicionar: string;
  renderizar: (item: T, indice: number) => ReactNode;
  aoAdicionar: () => void;
  aoRemover: (id: string) => void;
  rotuloRemover: (item: T, indice: number) => string;
}) {
  return (
    <section className="lista" aria-label={titulo}>
      {itens.length === 0 ? (
        <p className="lista__vazio">{textoVazio}</p>
      ) : (
        <ul className="lista__itens">
          {itens.map((item, i) => (
            <li key={item.id} className="lista__item">
              {renderizar(item, i)}
              <button
                type="button"
                onClick={() => aoRemover(item.id)}
                aria-label={rotuloRemover(item, i)}
                className="lista__remover"
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}

      <button type="button" onClick={aoAdicionar} className="lista__adicionar">
        {rotuloAdicionar}
      </button>
    </section>
  );
}
