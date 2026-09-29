/**
 * Cálculo de contraste segundo a WCAG 2.1.
 *
 * Existe para que "a paleta é acessível" seja um fato verificado, e não uma
 * afirmação. O teste correspondente roda em CI e reprova a build se alguém
 * escurecer um texto ou clarear um fundo sem perceber.
 *
 * Contraste é o tipo de coisa que passa despercebida em revisão visual:
 * quem tem visão perfeita, num monitor bom, com o brilho no máximo, não
 * enxerga a diferença entre 4,2:1 (reprovado) e 4,6:1 (aprovado). Quem lê o
 * currículo no celular, na rua, com sol na tela, enxerga.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexParaRgb(hex: string): Rgb {
  const limpo = hex.replace("#", "").trim();

  const expandido =
    limpo.length === 3
      ? limpo
          .split("")
          .map((c) => c + c)
          .join("")
      : limpo;

  if (!/^[0-9a-fA-F]{6}$/.test(expandido)) {
    throw new Error(`Cor inválida: ${hex}`);
  }

  return {
    r: parseInt(expandido.slice(0, 2), 16),
    g: parseInt(expandido.slice(2, 4), 16),
    b: parseInt(expandido.slice(4, 6), 16),
  };
}

/**
 * Luminância relativa (WCAG 2.1, 1.4.3).
 *
 * A correção gama não é detalhe matemático: o olho humano não percebe brilho
 * de forma linear, e usar o valor cru do canal produziria um resultado que
 * não corresponde ao que alguém enxerga.
 */
export function luminanciaRelativa({ r, g, b }: Rgb): number {
  const canal = (v: number): number => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/** Razão de contraste entre duas cores. Vai de 1:1 a 21:1. */
export function razaoDeContraste(corA: string, corB: string): number {
  const a = luminanciaRelativa(hexParaRgb(corA));
  const b = luminanciaRelativa(hexParaRgb(corB));

  const clara = Math.max(a, b);
  const escura = Math.min(a, b);

  return (clara + 0.05) / (escura + 0.05);
}

/**
 * Mínimos do WCAG 2.1 nível AA.
 *
 * Texto grande tem exigência menor porque o traço é mais espesso e continua
 * legível com menos contraste. "Grande" é 18,66px em negrito ou 24px normal.
 *
 * Componentes de interface (bordas de campo, ícones) usam 3:1 pela regra
 * 1.4.11 — ela existe porque uma borda invisível torna o campo invisível,
 * mesmo que o texto dentro dele esteja legível.
 */
export const MINIMO_AA = {
  textoNormal: 4.5,
  textoGrande: 3,
  componente: 3,
} as const;

export type TipoDeUso = keyof typeof MINIMO_AA;

export function passaNoAA(
  frente: string,
  fundo: string,
  uso: TipoDeUso = "textoNormal",
): boolean {
  return razaoDeContraste(frente, fundo) >= MINIMO_AA[uso];
}

/** Formata para relatório: "4.83:1". */
export function formatarRazao(frente: string, fundo: string): string {
  return `${razaoDeContraste(frente, fundo).toFixed(2)}:1`;
}
