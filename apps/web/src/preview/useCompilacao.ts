"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CvData } from "@cv-express/schema";

import type { ResultadoCompilacao } from "../acoes/compilar";
import type { EstadoPreview } from "../componentes/Preview";

export type Compilar = (cv: CvData) => Promise<ResultadoCompilacao>;

export interface Compilacao {
  estado: EstadoPreview;
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
  const [estado, setEstado] = useState<EstadoPreview>({ fase: "gerando" });
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
    setEstado({ fase: "gerando" });

    compilar(cv)
      .then((r) => {
        if (pedido !== pedidoAtual.current) return;
        setEstado(
          r.ok
            ? { fase: "pronto", pdfBase64: r.resposta.pdf, paginas: r.resposta.pageCount }
            : { fase: "erro", mensagem: r.mensagem },
        );
      })
      .catch(() => {
        // A Server Action lança quando a rede cai no meio do caminho. Vira a
        // mesma tela de erro, com o botão de tentar de novo — nunca uma
        // página quebrada no último passo.
        if (pedido !== pedidoAtual.current) return;
        setEstado({
          fase: "erro",
          mensagem: "Não conseguimos gerar o PDF agora. Seu currículo está salvo.",
        });
      });
    // `cv` fica fora das dependências de propósito: `chave` já é o conteúdo
    // dele, e um objeto novo com o mesmo conteúdo não deve recompilar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, chave, tentativa, compilar]);

  const tentarDeNovo = useCallback(() => setTentativa((t) => t + 1), []);

  return { estado, tentarDeNovo };
}
