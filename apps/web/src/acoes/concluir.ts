import { dadosPessoaisSchema, type CvData } from "@cv-express/schema";
import { concluirSessao, revogarLink, type Banco } from "@cv-express/db";

import { salvarEtapa } from "./sessao";
import type { ConfiguracaoEmail } from "../email/envio";
import { montarEmailDoLink } from "../email/mensagem";

/**
 * "Concluir e salvar": grava a versão final, fixa o prazo de 5 dias e manda
 * o link para o e-mail do currículo.
 *
 * Só o resultado atravessa para o navegador — nunca o token. Ele vai no
 * e-mail e em lugar nenhum mais: se voltasse na resposta, qualquer extensão
 * do navegador ou log de proxy teria a chave do currículo.
 */
export type ResultadoConcluir =
  | {
      ok: true;
      /** "novo": e-mail enviado agora. "ja_enviado": o link anterior vale. */
      envio: "novo" | "ja_enviado";
      email: string;
      /** ISO. O prazo é o mesmo nos dois casos — nunca reseta. */
      expiraEm: string;
    }
  | {
      ok: false;
      motivo:
        | "sem_configuracao"
        | "dados_incompletos"
        | "sessao_ausente"
        | "limite_de_envios"
        | "falha_envio";
    };

export async function concluirESalvar(
  db: Banco,
  sessionId: string,
  cv: CvData,
  email: ConfiguracaoEmail | null,
  agora: Date = new Date(),
): Promise<ResultadoConcluir> {
  // Antes de tocar no banco: sem e-mail configurado, concluir fixaria o
  // prazo de 5 dias de uma sessão para a qual nenhum link vai sair.
  if (!email) return { ok: false, motivo: "sem_configuracao" };

  // O e-mail precisa existir e ser válido — é para ele que o link vai.
  if (!dadosPessoaisSchema.safeParse(cv.pessoal).success) {
    return { ok: false, motivo: "dados_incompletos" };
  }

  // "Salvar" de verdade: o autosave tem debounce, e o clique pode chegar
  // antes da última gravação. A versão concluída é a que está na tela.
  const salvo = await salvarEtapa(db, sessionId, cv, agora);
  if (!salvo.ok) {
    return {
      ok: false,
      motivo: salvo.motivo === "sessao_ausente" ? "sessao_ausente" : "dados_incompletos",
    };
  }

  const destino = cv.pessoal.email.trim();
  const r = await concluirSessao(db, sessionId, destino, agora);

  if (!r.ok) {
    return {
      ok: false,
      motivo: r.motivo === "limite_de_envios" ? "limite_de_envios" : "sessao_ausente",
    };
  }

  if (r.envio === "novo") {
    const mensagem = montarEmailDoLink({
      nome: cv.pessoal.nome,
      link: `${email.urlBase}/retomar/${r.token}`,
      expiraEm: r.expiraEm,
    });

    let envio;
    try {
      envio = await email.enviador.enviar({ para: destino, ...mensagem });
    } catch {
      envio = { ok: false as const };
    }

    if (!envio.ok) {
      // O link que ninguém recebeu não pode ficar "ativo": o próximo clique
      // responderia "já enviamos" e a pessoa ficaria sem link.
      await revogarLink(db, r.token, agora);
      return { ok: false, motivo: "falha_envio" };
    }
  }

  return {
    ok: true,
    envio: r.envio,
    email: destino,
    expiraEm: r.expiraEm.toISOString(),
  };
}
