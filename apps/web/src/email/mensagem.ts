import { formatarPrazo } from "../formulario/prazo";

/**
 * O e-mail com o link para voltar ao currículo.
 *
 * O nome da pessoa entra no HTML ESCAPADO. É dado digitado num formulário
 * público, e HTML de e-mail é interpretado pelo cliente de quem recebe: um
 * `<a href=…>` no campo "nome" viraria um link de phishing assinado pelo
 * nosso domínio. É a mesma regra do LaTeX — dado do usuário nunca vira
 * marcação —, aplicada a outra linguagem.
 */
export function montarEmailDoLink(dados: {
  nome: string;
  link: string;
  expiraEm: Date;
}): { assunto: string; texto: string; html: string } {
  const primeiroNome = dados.nome.trim().split(/\s+/)[0] ?? "";
  const saudacao = primeiroNome ? `Olá, ${primeiroNome}!` : "Olá!";
  const prazo = `${formatarPrazo(dados.expiraEm)} (horário de Brasília)`;

  const assunto = "Seu currículo no CV Express — link para voltar e editar";

  const texto = [
    saudacao,
    "",
    "Seu currículo está salvo. Use o link abaixo para voltar, fazer ajustes e baixar o PDF de novo:",
    "",
    dados.link,
    "",
    `O link vale até ${prazo}. Você pode usá-lo quantas vezes quiser até lá — editar não muda esse prazo. Depois disso, o link e o currículo deixam de ficar disponíveis.`,
    "",
    "Não encaminhe este e-mail: quem tiver o link consegue editar o seu currículo.",
    "",
    "Se não foi você que pediu, pode ignorar esta mensagem.",
    "",
    "— CV Express",
  ].join("\n");

  const e = escaparHtml;
  const html = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:24px;background:#F2F3F1;font-family:Arial,Helvetica,sans-serif;color:#1A1D1C;">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:8px;padding:28px;">
    <p style="margin:0 0 16px;font-size:16px;">${e(saudacao)}</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.5;">Seu currículo está salvo. Use o botão abaixo para voltar, fazer ajustes e baixar o PDF de novo.</p>
    <p style="margin:0 0 20px;">
      <a href="${e(dados.link)}" style="display:inline-block;background:#17535F;color:#FFFFFF;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:6px;">Voltar ao meu currículo</a>
    </p>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">O link vale até <strong>${e(prazo)}</strong>. Você pode usá-lo quantas vezes quiser até lá — editar não muda esse prazo. Depois disso, o link e o currículo deixam de ficar disponíveis.</p>
    <p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#525A58;">Não encaminhe este e-mail: quem tiver o link consegue editar o seu currículo. Se não foi você que pediu, pode ignorar esta mensagem.</p>
    <p style="margin:0;font-size:12px;line-height:1.5;color:#525A58;">Se o botão não funcionar, copie este endereço no navegador:<br>${e(dados.link)}</p>
  </div>
</body>
</html>`;

  return { assunto, texto, html };
}

export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
