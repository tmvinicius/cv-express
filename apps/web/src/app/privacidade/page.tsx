import Link from "next/link";
import {
  PRAZO_APOS_CONCLUSAO_MS,
  VALIDADE_SESSAO_MS,
  RETENCAO_LIMITES_MS,
} from "@cv-express/db";

/**
 * Política de privacidade (LGPD).
 *
 * Os prazos NÃO estão escritos à mão: vêm das mesmas constantes que o código
 * usa para apagar os dados. Uma política que diz "30 dias" enquanto o banco
 * guarda por 60 é pior que nenhuma — é uma promessa falsa, por escrito.
 *
 * O que está aqui descreve o que o código FAZ hoje, e foi conferido contra
 * ele: o que vai para a IA, o que vai para o provedor de e-mail, o que fica
 * no banco e por quanto tempo. Ao mudar qualquer um desses fluxos, mude esta
 * página no mesmo commit.
 *
 * ANTES DE PUBLICAR: o texto não substitui revisão jurídica, e a LGPD exige
 * identificar o controlador e um canal de contato — `PRIVACIDADE_CONTATO`.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Privacidade — CV Express",
};

const DIA = 24 * 60 * 60 * 1000;
const dias = (ms: number) => Math.round(ms / DIA);

export default function Privacidade() {
  const contato = process.env["PRIVACIDADE_CONTATO"]?.trim();

  return (
    <main className="texto-legal">
      <h1>Privacidade</h1>
      <p>
        O CV Express não tem cadastro, senha nem conta. Guardamos o mínimo para
        montar o seu currículo, e apagamos assim que ele deixa de ser usado.
      </p>

      <h2>O que guardamos</h2>
      <ul>
        <li>
          <strong>O conteúdo do currículo</strong> — nome, cidade, e-mail,
          telefone e links que você informar, objetivo, experiências, formação,
          idiomas e habilidades. A idade, se informada, é guardada mas nunca
          aparece no PDF.
        </li>
        <li>
          <strong>O seu e-mail</strong>, quando você clica em “Concluir e
          salvar”, para enviar o link de volta ao currículo.
        </li>
        <li>
          <strong>Uma marca do seu endereço IP</strong>, transformada de modo
          que o endereço não fica guardado em claro, só para limitar o uso a
          partir dele: quantos currículos são começados, quantos PDFs são
          gerados, quantos pedidos de ajuda vão para a IA e quantos e-mails
          são enviados. O produto é gratuito, e isso é o que impede alguém de
          esgotá-lo para todo mundo.
        </li>
      </ul>
      <p>
        Não usamos cookies, nem ferramentas de análise ou de publicidade. O
        endereço da página do seu currículo é o que dá acesso a ele: não o
        compartilhe.
      </p>

      <h2>Com quem compartilhamos</h2>
      <ul>
        <li>
          <strong>Provedor de inteligência artificial</strong> — só quando
          você clica em “Organizar com ajuda da IA”, e só o texto daquele
          trecho: o cargo e a descrição de uma experiência, ou a lista de
          habilidades. Nome, e-mail e contatos nunca vão para a IA. A
          sugestão só entra no currículo se você aceitar.
        </li>
        <li>
          <strong>Provedor de e-mail</strong> — o seu endereço e o link, para
          entregar a mensagem de “Concluir e salvar”.
        </li>
        <li>
          <strong>Hospedagem e banco de dados</strong> onde o serviço roda. O
          PDF é montado na nossa própria infraestrutura; ele não é guardado no
          banco, e o gerador mantém uma cópia em memória por pouco tempo (30
          minutos, na configuração padrão) para não refazer o mesmo trabalho.
        </li>
      </ul>

      <h2>Por quanto tempo</h2>
      <ul>
        <li>
          <strong>Currículo em andamento:</strong> apagado depois de{" "}
          {dias(VALIDADE_SESSAO_MS)} dias sem uso. Cada vez que você volta, o
          prazo recomeça.
        </li>
        <li>
          <strong>Currículo concluído:</strong> o link enviado por e-mail e o
          próprio currículo valem por {dias(PRAZO_APOS_CONCLUSAO_MS)} dias a
          partir da primeira vez que você clicou em “Concluir e salvar” —
          editar não renova esse prazo. Depois disso, tudo é apagado.
        </li>
        <li>
          <strong>Marca do endereço IP:</strong> apagada em até{" "}
          {dias(RETENCAO_LIMITES_MS)} dias.
        </li>
      </ul>
      <p>
        A limpeza roda uma vez por dia, então um dado vencido pode durar até um
        dia a mais antes de sumir. Durante esse intervalo ele já não está
        acessível por nenhum link.
      </p>

      <h2>Seus direitos</h2>
      <p>
        Você pode ver e corrigir tudo o que guardamos no próprio formulário. E
        pode <strong>apagar tudo a qualquer momento</strong>, pelo botão
        “Apagar meus dados” no rodapé do formulário: o currículo, o e-mail e o
        link somem na hora, e não há como desfazer.
      </p>
      {contato ? (
        <p>
          Para qualquer outro pedido sobre os seus dados, fale com{" "}
          <a href={`mailto:${contato}`}>{contato}</a>.
        </p>
      ) : (
        // Sem contato configurado, a página diz isso em vez de inventar um.
        // Publicar assim é descumprir a LGPD — ver README.
        <p className="texto-legal__aviso">
          Canal de contato do responsável pelos dados ainda não configurado.
        </p>
      )}

      <p>
        <Link href="/">Voltar ao CV Express</Link>
      </p>
    </main>
  );
}
