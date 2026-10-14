"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * As páginas do PDF desenhadas em <canvas>, com o PDF.js.
 *
 * POR QUE NÃO O <iframe> QUE HAVIA AQUI. Ele dependia do leitor de PDF do
 * navegador, e o público principal está no celular, onde esse leitor não
 * existe ou não serve:
 *
 *   - o Chrome do Android não mostra PDF dentro da página — o quadro fica
 *     vazio (é o `navigator.pdfViewerEnabled === false` dele);
 *   - o Safari do iPhone mostra só a primeira página, sem rolar.
 *
 * Ver o currículo pronto é o momento do produto, e no celular ele não
 * acontecia. Com o PDF.js o desenho é o mesmo em qualquer navegador — é a
 * escolha que o planejamento já fazia (§7), e é também a base de que a
 * edição por clique sobre o documento vai precisar.
 *
 * O build LEGACY do PDF.js, e não o moderno: o moderno exige navegador
 * recente, e quem monta currículo no celular muitas vezes está num aparelho
 * antigo, preso numa versão velha do iOS.
 *
 * Carregado sob demanda (`import()`), só quando há PDF: o PDF.js tem ~500 KB,
 * e o worker que faz a leitura, ~1,3 MB. Nenhuma outra tela paga isso.
 */

export interface PropsPaginasPdf {
  /** O PDF. Uma cópia vai para o worker do PDF.js; esta não é tocada. */
  bytes: Uint8Array;
  /** O PDF.js não carregou ou não conseguiu desenhar. Quem chama tem plano B. */
  aoFalhar: () => void;
}

export function PaginasPdf({ bytes, aoFalhar }: PropsPaginasPdf) {
  const caixa = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(0);

  // Mede a largura disponível, e mede de novo quando ela muda de verdade
  // (girar o celular, redimensionar a janela). Desenhar na largura real é o
  // que deixa o texto nítido: esticar por CSS um canvas pequeno borra.
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    setLargura(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observador = new ResizeObserver(([entrada]) => {
      const nova = entrada?.contentRect.width ?? 0;
      setLargura((atual) => (precisaRedesenhar(atual, nova) ? nova : atual));
    });
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  useEffect(() => {
    const el = caixa.current;
    if (!el || largura <= 0) return;

    let cancelado = false;
    let documento: PDFDocumentProxy | null = null;

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        // Cópia: o PDF.js TRANSFERE o buffer para o worker, e o original
        // ficaria vazio — inclusive para o link de download.
        const carregado = await pdfjs.getDocument({ data: bytes.slice() }).promise;
        documento = carregado;
        const escala = window.devicePixelRatio || 1;

        // As páginas novas são desenhadas FORA da tela, e só entram quando
        // todas estão prontas: enquanto isso, as anteriores continuam
        // visíveis. Trocar uma a uma faria a tela piscar a cada edição.
        const novas: HTMLCanvasElement[] = [];
        for (let n = 1; n <= carregado.numPages; n++) {
          const pagina = await carregado.getPage(n);
          const natural = pagina.getViewport({ scale: 1 });
          const viewport = pagina.getViewport({
            scale: escalaParaLargura(natural.width, largura, escala),
          });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.className = "preview__pagina";
          canvas.setAttribute("role", "img");
          canvas.setAttribute("aria-label", `Página ${n} de ${carregado.numPages} do seu currículo`);
          await pagina.render({ canvas, viewport }).promise;
          if (cancelado) return;
          novas.push(canvas);
        }
        if (!cancelado) el.replaceChildren(...novas);
      } catch (erro) {
        if (cancelado) return;
        console.error("[preview] o PDF.js não desenhou o PDF", erro);
        aoFalhar();
      } finally {
        // As páginas já estão nos canvas; o documento só segura memória.
        // Destruir a tarefa encerra também o worker dela: um worker por PDF,
        // e o preview desenha um PDF por visita — não vale manter um vivo.
        void documento?.loadingTask.destroy();
      }
    })();

    return () => {
      cancelado = true;
    };
    // `aoFalhar` fica de fora: uma função nova a cada render do pai não pode
    // mandar redesenhar o PDF inteiro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bytes, largura]);

  return <div ref={caixa} className="preview__paginas" />;
}

/**
 * A escala que faz a página ocupar `larguraAlvo` pixels de CSS, já
 * multiplicada pela densidade da tela (2 ou 3 no celular). Com teto: numa
 * tela de densidade 3, desenhar acima de ~2.000 px de largura só gasta
 * memória — e celular com pouca memória mata a aba.
 */
export function escalaParaLargura(
  larguraDaPagina: number,
  larguraAlvo: number,
  densidade: number,
): number {
  const PIXELS_MAXIMOS = 2000;
  const pixels = Math.min(larguraAlvo * densidade, PIXELS_MAXIMOS);
  return pixels / larguraDaPagina;
}

/**
 * Redesenhar só quando a largura mudou o bastante para aparecer.
 *
 * No celular, a barra de endereço que some ao rolar muda a altura e, às
 * vezes, um ou dois pixels da largura. Redesenhar o PDF a cada um desses
 * eventos travaria a rolagem.
 */
export function precisaRedesenhar(atual: number, nova: number): boolean {
  if (atual <= 0) return nova > 0;
  return Math.abs(nova - atual) / atual > 0.1;
}
