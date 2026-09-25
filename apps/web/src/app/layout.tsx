import type { ReactNode } from "react";

export const metadata = {
  title: "CV Express — seu currículo pronto em minutos",
  description:
    "Preencha um formulário rápido e receba um currículo em PDF, composto com qualidade tipográfica.",
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
