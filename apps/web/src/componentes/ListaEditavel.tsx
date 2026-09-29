"use client";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * Lista de itens que a pessoa acrescenta e remove.
 *
 * Usada por experiências, formação e idiomas. O ponto de extraí-la é o estado
 * vazio: uma etapa opcional sem nenhum item precisa deixar claro que ESTÁ
 * TUDO BEM seguir sem preencher. Sem isso, quem está no primeiro emprego acha
 * que travou — e é justamente quem mais precisa do produto.
 *
 * `itemEmFoco` fecha o caminho que vem do painel de seções e das sugestões de
 * corte: eles sabem exatamente de qual item estão falando, e sem isto o
 * clique entregava a lista inteira para a pessoa procurar de novo.
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
  itemEmFoco,
}: {
  itens: readonly T[];
  titulo: string;
  textoVazio: string;
  rotuloAdicionar: string;
  renderizar: (item: T, indice: number) => ReactNode;
  aoAdicionar: () => void;
  aoRemover: (id: string) => void;
  rotuloRemover: (item: T, indice: number) => string;
  /** Item que a pessoa pediu para ver. Recebe rolagem e foco ao montar. */
  itemEmFoco?: string | undefined;
}) {
  const refs = useRef(new Map<string, HTMLLIElement>());

  useEffect(() => {
    if (!itemEmFoco) return;
    const alvo = refs.current.get(itemEmFoco);
    if (!alvo) return;

    // `block: "center"` e não "start": o topo ficaria atrás do cabeçalho
    // grudento. `smooth` respeita prefers-reduced-motion pelo próprio
    // navegador, então não há checagem a fazer aqui.
    //
    // O `?.` não é paranoia: o jsdom não implementa scrollIntoView, e uma
    // exceção lançada aqui dentro derrubaria a etapa inteira — trocar a
    // rolagem, que é conforto, por uma tela quebrada. O foco abaixo é a parte
    // que importa e acontece de qualquer jeito.
    alvo.scrollIntoView?.({ behavior: "smooth", block: "center" });

    // Foco no primeiro campo do item, e não no <li>: quem chegou aqui veio
    // para editar. Se não houver campo, foca o próprio item para que o leitor
    // de tela ao menos anuncie onde a pessoa parou.
    const campo = alvo.querySelector<HTMLElement>("input, textarea, select");
    (campo ?? alvo).focus({ preventScroll: true });
  }, [itemEmFoco]);

  return (
    <section className="lista" aria-label={titulo}>
      {itens.length === 0 ? (
        <p className="lista__vazio">{textoVazio}</p>
      ) : (
        <ul className="lista__itens">
          {itens.map((item, i) => (
            <li
              key={item.id}
              className={
                item.id === itemEmFoco ? "lista__item lista__item--destacado" : "lista__item"
              }
              tabIndex={-1}
              ref={(el) => {
                if (el) refs.current.set(item.id, el);
                else refs.current.delete(item.id);
              }}
            >
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
