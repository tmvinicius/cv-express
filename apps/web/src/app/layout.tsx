import type { ReactNode } from "react";

// A ordem importa: tokens define as variáveis, base as consome, componentes
// depende das duas. Trocar a ordem produz variável indefinida — e o
// navegador, nesse caso, cai para a cor herdada sem dar erro nenhum.
import "../estilos/tokens.css";
import "../estilos/base.css";
import "../estilos/componentes.css";

/**
 * Toda página é renderizada por requisição.
 *
 * Não é por dado: é pela CSP. O middleware gera um nonce por requisição e o
 * Next o carimba nos `<script>` da página — mas só quando renderiza naquela
 * requisição. Uma página gerada no build sairia com scripts sem nonce, que o
 * navegador bloqueia: o HTML aparece, mas nada responde ao clique. As únicas
 * páginas estáticas eram `/dados-apagados` e o 404, que não tocam no banco;
 * renderizá-las sob demanda custa quase nada.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "CV Express — seu currículo pronto em minutos",
  description:
    "Preencha um formulário rápido e receba um currículo em PDF, composto com qualidade tipográfica.",
};

// Sem isto o celular renderiza numa viewport virtual de 980px e encolhe
// tudo — o formulário sai ilegível justamente no aparelho onde boa parte do
// público vai preenchê-lo.
//
// maximumScale fica de fora de propósito: travar o zoom é uma barreira de
// acessibilidade (WCAG 1.4.4) para quem tem baixa visão. O ganho seria
// evitar o zoom do Safari ao focar um campo, e isso já está resolvido pelo
// font-size mínimo de 16px em base.css.
export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // lang="pt-BR" não é detalhe: é o que faz leitor de tela usar a pronúncia
  // correta e o navegador oferecer a hifenização certa.
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
