import Link from "next/link";

/**
 * Para onde vai quem apagou os dados.
 *
 * Não pode ser `/`: aquela página CRIA uma sessão nova no banco ao abrir.
 * Mandar para lá quem acabou de exercer o direito de apagar seria gravar
 * dados dela de novo no instante seguinte. Esta página não toca no banco.
 */
export const metadata = {
  title: "Dados apagados — CV Express",
  robots: { index: false, follow: false },
};

export default function DadosApagados() {
  return (
    <main className="texto-legal">
      <h1>Seus dados foram apagados</h1>
      <p>
        O currículo, o e-mail e o link de retorno foram removidos agora. O
        endereço da página do currículo e qualquer link enviado por e-mail
        deixaram de funcionar.
      </p>
      <p>Se você baixou o PDF antes, ele continua sendo seu.</p>
      <p>
        {/* Link explícito, e não redirecionamento: começar de novo é escolha
            dela, e só então uma sessão nova é criada. */}
        <Link href="/">Começar um currículo novo</Link>
      </p>
    </main>
  );
}
