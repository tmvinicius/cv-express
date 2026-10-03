/**
 * Envio de e-mail.
 *
 * Porta pequena, com dois adaptadores, pelo mesmo motivo da camada de IA: o
 * resto do app não sabe qual serviço manda o e-mail, e trocar de serviço é
 * trocar variável de ambiente.
 *
 *   EMAIL_PROVIDER    resend | console
 *   RESEND_API_KEY    obrigatória com resend
 *   EMAIL_REMETENTE   ex.: "CV Express <nao-responda@seudominio.com.br>"
 *   APP_URL           endereço público do app, base do link (ex.: https://…)
 *
 * Sem o SDK do Resend: a API é um POST JSON, e uma dependência a mais para
 * isso seria superfície sem ganho.
 */

export interface MensagemEmail {
  para: string;
  assunto: string;
  texto: string;
  html: string;
}

export type ResultadoEnvio =
  | { ok: true }
  | { ok: false; motivo: "recusado" | "rede" };

export interface EnviadorEmail {
  enviar(mensagem: MensagemEmail): Promise<ResultadoEnvio>;
}

export type Ambiente = Record<string, string | undefined>;

export interface ConfiguracaoEmail {
  enviador: EnviadorEmail;
  /**
   * Base do link, SEMPRE da configuração.
   *
   * Nunca do cabeçalho `Host` da requisição: ele é controlado por quem faz a
   * requisição, e um link montado a partir dele mandaria o token para o
   * domínio que o atacante escolher — o clássico envenenamento de link de
   * redefinição de senha.
   */
  urlBase: string;
}

/**
 * O e-mail está configurado neste ambiente?
 *
 * Devolve `null` em vez de lançar: o componente de servidor usa isto para
 * decidir se o botão nasce habilitado, e uma variável errada não pode
 * derrubar a página do formulário.
 */
export function configuracaoEmail(env: Ambiente = process.env): ConfiguracaoEmail | null {
  const producao = env["NODE_ENV"] === "production";
  const urlBase = (env["APP_URL"] ?? (producao ? "" : "http://localhost:3000")).replace(
    /\/+$/,
    "",
  );
  if (!/^https?:\/\//.test(urlBase)) return null;

  switch (env["EMAIL_PROVIDER"]) {
    case "resend": {
      const chave = env["RESEND_API_KEY"];
      const remetente = env["EMAIL_REMETENTE"];
      if (!chave || !remetente) return null;
      return { enviador: new ResendEnviador(chave, remetente), urlBase };
    }

    case "console":
      // O link é uma chave do currículo por 5 dias, e este adaptador o
      // escreve no log. Em produção, log é lido por mais gente do que deveria
      // ter acesso ao currículo de alguém.
      if (producao) return null;
      return { enviador: new ConsoleEnviador(), urlBase };

    default:
      return null;
  }
}

/** Resend: https://resend.com/docs/api-reference/emails/send-email */
export class ResendEnviador implements EnviadorEmail {
  constructor(
    private readonly chave: string,
    private readonly remetente: string,
    private readonly buscar: typeof fetch = fetch,
    private readonly timeoutMs = 10_000,
  ) {}

  async enviar(m: MensagemEmail): Promise<ResultadoEnvio> {
    let resposta: Response;
    try {
      resposta = await this.buscar("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.chave}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.remetente,
          to: [m.para],
          subject: m.assunto,
          text: m.texto,
          html: m.html,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      console.error("[email] falha de rede", { erro: String(e) });
      return { ok: false, motivo: "rede" };
    }

    if (!resposta.ok) {
      // O corpo da RESPOSTA ajuda a diagnosticar (domínio não verificado,
      // chave revogada). O da requisição nunca vai para o log: ele carrega o
      // link, que é uma chave do currículo.
      const detalhe = await resposta.text().catch(() => "");
      console.error("[email] recusado pelo provedor", {
        status: resposta.status,
        detalhe: detalhe.slice(0, 500),
      });
      return { ok: false, motivo: "recusado" };
    }

    return { ok: true };
  }
}

/**
 * Para desenvolvimento: escreve o e-mail no log do servidor.
 *
 * É o que permite testar o fluxo inteiro — concluir, abrir o link, editar —
 * sem conta em provedor nenhum. Recusado em produção (ver acima).
 */
export class ConsoleEnviador implements EnviadorEmail {
  async enviar(m: MensagemEmail): Promise<ResultadoEnvio> {
    console.info(
      `\n[email:console] Para: ${m.para}\nAssunto: ${m.assunto}\n\n${m.texto}\n`,
    );
    return { ok: true };
  }
}
