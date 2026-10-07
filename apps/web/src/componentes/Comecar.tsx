"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

/**
 * O botão "Começar" da página inicial.
 *
 * Um formulário de verdade, e não um `onClick` com `router.push`: a sessão
 * nasce de um POST, que robô de busca e pré-visualização de link não fazem
 * (ver `comecar` em `acoes/sessao.ts`). E, por ser formulário, funciona até
 * antes de o JavaScript carregar — num celular lento, o primeiro toque não se
 * perde.
 *
 * `acao` devolve `null` quando deu certo (ela redireciona e nem chega a
 * voltar) ou o texto da recusa, que aparece aqui mesmo.
 */
export function Comecar({
  acao,
}: {
  acao: (anterior: string | null) => Promise<string | null>;
}) {
  const [recusa, enviar] = useActionState(acao, null);

  return (
    <form action={enviar} className="inicio__comecar">
      <BotaoComecar />
      {recusa && (
        <p role="alert" className="inicio__recusa">
          {recusa}
        </p>
      )}
    </form>
  );
}

/**
 * Separado porque `useFormStatus` só enxerga o formulário que o CONTÉM.
 * Desabilitado enquanto envia: dois toques seguidos criariam duas sessões.
 */
function BotaoComecar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? "Abrindo…" : "Começar meu currículo"}
    </button>
  );
}
