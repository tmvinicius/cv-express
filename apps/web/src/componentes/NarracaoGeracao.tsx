"use client";

import { useEffect, useState } from "react";
import type { CvData } from "@cv-express/schema";

/**
 * A narração da tela "gerando" (seção 6 do planejamento): "2–3 segundos
 * percebidos como trabalho, não como travamento".
 *
 * Três decisões:
 *
 * 1. As frases acompanham o CONTEÚDO. "Organizando suas experiências" para
 *    quem não tem experiência nenhuma — o primeiro emprego, justamente o
 *    público que mais precisa do produto — soaria como cobrança.
 *
 * 2. Ela PARA na última frase, não recomeça. Uma narração em ciclo, quando a
 *    compilação demora, vira a definição visual de "travou".
 *
 * 3. É `aria-hidden`. Para quem usa leitor de tela, uma frase nova a cada
 *    segundo é uma interrupção a cada segundo; o status único e estável do
 *    Preview ("Montando seu currículo…") já anuncia o que importa.
 */
export function passosDaNarracao(cv: CvData): string[] {
  const passos = ["Lendo o que você escreveu…"];
  if (cv.experiencias.length > 0) passos.push("Organizando suas experiências…");
  if (cv.formacao.length > 0) passos.push("Ordenando sua formação…");
  passos.push("Montando o layout…", "Ajustando a tipografia…");
  return passos;
}

/** Tempo em cada frase. Rápido o bastante para caber nos 2–3 s típicos. */
export const INTERVALO_NARRACAO_MS = 900;

export function NarracaoGeracao({ cv }: { cv: CvData }) {
  const passos = passosDaNarracao(cv);
  const [indice, setIndice] = useState(0);
  const ultimo = passos.length - 1;

  useEffect(() => {
    if (indice >= ultimo) return;
    const relogio = setTimeout(() => setIndice((i) => i + 1), INTERVALO_NARRACAO_MS);
    return () => clearTimeout(relogio);
  }, [indice, ultimo]);

  return (
    <p className="narracao" aria-hidden="true">
      {passos[Math.min(indice, ultimo)]}
    </p>
  );
}
