import Link from "next/link";

/**
 * Endereço que não existe.
 *
 * O 404 padrão do Next dizia "This page could not be found", em inglês, e
 * trazia um `<style>` embutido que a CSP bloqueia — saía em inglês E sem
 * formatação. O caso mais provável aqui é um link de currículo copiado pela
 * metade: o endereço do currículo é longo, e é a única chave dele.
 *
 * Currículo que existiu e não existe mais tem página própria, que explica
 * prazos: `app/cv/[id]/not-found.tsx`.
 */
export const metadata = {
  title: "Página não encontrada — CV Express",
  robots: { index: false, follow: false },
};

export default function NaoEncontrada() {
  return (
    <main className="texto-legal">
      <h1>Esta página não existe</h1>
      <p>
        Se você colou o endereço de um currículo, confira se ele veio
        completo: o endereço é longo, e um pedaço a menos leva para cá.
      </p>
      <p>
        <Link href="/">Ir para o início</Link>
      </p>
    </main>
  );
}
