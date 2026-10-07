import Link from "next/link";

/**
 * Para onde vai quem apagou os dados.
 *
 * Uma página própria, e não `/`: quem acabou de exercer o direito de apagar
 * precisa ler que deu certo, não ser convidado a começar de novo. Esta página
 * não toca no banco.
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
            dela — e mesmo assim a sessão só nasce no clique em "Começar". */}
        <Link href="/">Começar um currículo novo</Link>
      </p>
    </main>
  );
}
