"use client";

import { startTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * O que a pessoa vê quando algo quebra do nosso lado.
 *
 * Sem isto, um banco fora do ar no meio do preenchimento mostrava a página de
 * erro genérica do Next, em inglês ("Application error: a server-side
 * exception has occurred"), a alguém que estava montando o currículo — e que
 * concluiria, com razão, que perdeu tudo.
 *
 * Três regras:
 *
 * 1. Dizer o que continua valendo, sem prometer mais do que é verdade: o que
 *    já tinha sido salvo está no banco; os últimos segundos podem não estar.
 * 2. Oferecer "tentar de novo" que funcione. `reset()` sozinho só re-renderiza
 *    o cliente; quando quem falhou foi a página de servidor (o caso comum —
 *    o banco), é o `router.refresh()` que pede o conteúdo de novo.
 * 3. Nunca mostrar `error.message`. Em produção o Next já a troca por um
 *    texto genérico, mas em qualquer outro ambiente ela traz o erro cru — o
 *    mesmo motivo de o log do LaTeX nunca chegar ao cliente. Só o `digest`
 *    aparece: é o código que liga esta tela à linha do log do servidor.
 *
 * Cobre toda página abaixo do layout raiz. O próprio layout não lê dado
 * nenhum, então um `global-error.tsx` só repetiria isto para um caso que não
 * acontece.
 */
export default function Erro({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  const tentarDeNovo = () => {
    startTransition(() => {
      router.refresh();
      reset();
    });
  };

  return (
    <main className="texto-legal pagina-erro">
      <h1>Algo deu errado do nosso lado</h1>
      <p>
        O que já tinha sido salvo continua guardado — o formulário salva
        sozinho enquanto você escreve. Só os últimos segundos antes do erro
        podem não ter entrado.
      </p>
      <div className="pagina-erro__acoes">
        <button type="button" onClick={tentarDeNovo}>
          Tentar de novo
        </button>
        <Link href="/">Ir para o início</Link>
      </div>
      <p>
        Se o problema continuar, volte daqui a alguns minutos pelo mesmo
        endereço desta página: é por ele que você chega ao seu currículo.
      </p>
      {error.digest && (
        <p className="pagina-erro__codigo">Código do erro: {error.digest}</p>
      )}
    </main>
  );
}
