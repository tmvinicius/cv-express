import Link from "next/link";
import { VALIDADE_SESSAO_MS } from "@cv-express/db";

import { acaoComecar } from "../acoes/servidor";
import { capacidadesDoAmbiente } from "../acoes/capacidades";
import { Comecar } from "../componentes/Comecar";

/**
 * A página inicial.
 *
 * Até aqui, abrir `/` criava uma sessão no banco e redirecionava. Todo GET
 * virava uma linha: robô de busca, a pré-visualização que o WhatsApp gera
 * quando alguém cola o link, monitor de uptime. E uma sessão de graça por
 * visita era também o jeito de contornar as cotas por sessão da IA e da
 * compilação. Agora esta página não toca no banco; a sessão nasce no clique
 * em "Começar", que é um POST com limite por origem.
 *
 * Isso reabre a decisão registrada em `formulario/etapas.ts` ("nenhuma tela
 * antes do primeiro campo"), e a reabre do jeito mais barato possível: uma
 * tela, um botão, nenhuma escolha. Ela não é uma etapa do formulário —
 * quem volta pelo link do e-mail ou pelo endereço do currículo nunca a vê.
 *
 * Dinâmica porque lê o ambiente: só promete a ajuda da IA onde ela existe.
 * Não é custo de banco — a página não abre conexão nenhuma.
 */
export const dynamic = "force-dynamic";

const DIA = 24 * 60 * 60 * 1000;

export default function Inicio() {
  const { ia } = capacidadesDoAmbiente();

  return (
    <main className="inicio">
      <h1>Seu currículo pronto em minutos</h1>
      <p className="inicio__chamada">
        Responda algumas perguntas curtas, uma tela de cada vez, e receba um
        currículo em PDF com cara de profissional.
      </p>

      <ol className="inicio__passos">
        <li>
          <strong>Conte a sua trajetória.</strong> Dados de contato,
          experiências, formação, idiomas e habilidades. As etapas opcionais
          estão marcadas.
        </li>
        {ia.disponivel && (
          <li>
            <strong>Peça ajuda para organizar, se quiser.</strong> A IA arruma
            o que você escreveu em tópicos claros — nunca acrescenta nada — e
            você decide se usa.
          </li>
        )}
        <li>
          <strong>Baixe o PDF.</strong> Dá para voltar e ajustar qualquer parte
          antes de baixar.
        </li>
      </ol>

      <Comecar acao={acaoComecar} />

      <p className="inicio__nota">
        {/* O prazo vem da constante que o expurgo usa — nunca digitado. */}
        Sem cadastro e sem senha. O rascunho fica guardado por{" "}
        {Math.round(VALIDADE_SESSAO_MS / DIA)} dias sem uso, e você pode apagá-lo
        quando quiser. <Link href="/privacidade">Como tratamos seus dados</Link>
      </p>
    </main>
  );
}
