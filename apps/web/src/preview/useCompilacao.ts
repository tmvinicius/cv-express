"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CvData } from "@cv-express/schema";

import type { ResultadoCompilacao } from "../acoes/compilar";
import type { EstadoPreview } from "../componentes/Preview";

export type Compilar = (cv: CvData) => Promise<ResultadoCompilacao>;

export interface Compilacao {
  estado: EstadoPreview;
  /**
   * O PDF pronto é DESTE conteúdo, e não de uma versão anterior?
   *
   * `estado` sozinho não responde isso. Quando o CvData muda com o hook
   * montado, o primeiro render depois da mudança ainda carrega o `pronto` da
   * compilação anterior — o efeito que pede a nova só roda depois do render.
   * Quem avança sozinho para o preview ao ver `pronto` avançaria com o PDF
   * velho.
   *
   * No fluxo de hoje, sair do preview para editar desmonta o componente e o
   * estado nasce limpo na volta; `emDia` não depende disso para estar certo.
   */
  emDia: boolean;
  tentarDeNovo: () => void;
}

/**
 * Compila o currículo enquanto `ativo` for verdadeiro.
 *
 * Compila de novo só quando o CvData muda. Entrar e sair do preview com o
 * mesmo conteúdo reaproveita o PDF que já está na tela. Se o componente for
 * remontado, a nova chamada cai no cache do worker, que é indexado pelo
 * contentHash — não roda o Tectonic de novo.
 */
export function useCompilacao(cv: CvData, compilar: Compilar, ativo: boolean): Compilacao {
  // O estado anda junto com a chave do conteúdo que o produziu. É isso que
  // permite responder `emDia` sem depender da ordem em que os efeitos rodam.
  const [resultado, setResultado] = useState<{ estado: EstadoPreview; chave: string | null }>({
    estado: { fase: "gerando" },
    chave: null,
  });
  const [tentativa, setTentativa] = useState(0);

  const chave = JSON.stringify(cv);
  const ultimaCompilada = useRef<string | null>(null);

  // Só a resposta do pedido mais recente vale. Sem isto, uma compilação lenta
  // que termina depois de uma rápida sobrescreveria o PDF novo com o antigo.
  const pedidoAtual = useRef(0);

  useEffect(() => {
    if (!ativo) return;

    const chaveDaTentativa = `${chave}#${tentativa}`;
    if (ultimaCompilada.current === chaveDaTentativa) return;
    ultimaCompilada.current = chaveDaTentativa;

    const pedido = ++pedidoAtual.current;
    // A chave vai junto já no "gerando": o preview mantém o PDF anterior na
    // tela enquanto isso, mas `emDia` passa a ser falso até a resposta.
    setResultado({ estado: { fase: "gerando" }, chave });

    compilar(cv)
      .then((r) => {
        if (pedido !== pedidoAtual.current) return;
        setResultado({
          estado: r.ok
            ? { fase: "pronto", pdfBase64: r.resposta.pdf, paginas: r.resposta.pageCount }
            : { fase: "erro", mensagem: r.mensagem },
          chave,
        });
      })
      .catch(() => {
        // A Server Action lança quando a rede cai no meio do caminho. Vira a
        // mesma tela de erro, com o botão de tentar de novo — nunca uma
        // página quebrada no último passo.
        if (pedido !== pedidoAtual.current) return;
        setResultado({
          estado: {
            fase: "erro",
            mensagem: "Não conseguimos gerar o PDF agora. Seu currículo está salvo.",
          },
          chave,
        });
      });
    // `cv` fica fora das dependências de propósito: `chave` já é o conteúdo
    // dele, e um objeto novo com o mesmo conteúdo não deve recompilar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, chave, tentativa, compilar]);

  const tentarDeNovo = useCallback(() => setTentativa((t) => t + 1), []);

  return {
    estado: resultado.estado,
    emDia: resultado.estado.fase === "pronto" && resultado.chave === chave,
    tentarDeNovo,
  };
}
