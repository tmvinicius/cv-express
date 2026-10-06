import Link from "next/link";
import { PRAZO_APOS_CONCLUSAO_MS, VALIDADE_SESSAO_MS } from "@cv-express/db";

const dias = (ms: number) => Math.round(ms / (24 * 60 * 60 * 1000));

/**
 * Currículo que não existe neste endereço.
 *
 * Três caminhos chegam aqui, e para quem lê eles são o mesmo: a pessoa
 * apagou os dados (e voltou pelo histórico do navegador), o prazo de 5 dias
 * depois de concluir terminou, ou o rascunho ficou 30 dias sem uso. O 404
 * genérico do Next dizia só "This page could not be found", em inglês, a
 * quem acabou de perder — ou de apagar de propósito — o próprio currículo.
 *
 * Não distingue os casos: a sessão já não existe, e não há como saber qual
 * deles foi sem guardar justamente o dado que foi apagado.
 */
export default function CurriculoNaoEncontrado() {
  return (
    <main className="texto-legal">
      <h1>Este currículo não está mais disponível</h1>
      <p>
        Ele pode ter sido apagado por você, ou o prazo para editá-lo terminou:
        currículos concluídos ficam disponíveis por {dias(PRAZO_APOS_CONCLUSAO_MS)} dias,
        e os que não foram concluídos, por {dias(VALIDADE_SESSAO_MS)} dias sem uso.
      </p>
      <p>Se você baixou o PDF antes, ele continua sendo seu.</p>
      <p>
        <Link href="/">Começar um currículo novo</Link>
      </p>
    </main>
  );
}
