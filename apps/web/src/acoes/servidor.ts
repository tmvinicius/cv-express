"use server";

import { revalidatePath } from "next/cache";
import { criarConexao, type Banco } from "@cv-express/db";
import type { HabilidadeSugerida } from "@cv-express/ai";
import type { CvData } from "@cv-express/schema";

import { salvarEtapa, apagarTudo } from "./sessao";
import { obterServicoIa } from "./servicoIa";
import { compilarCv } from "./compilar";
import * as ia from "./ia";
import type { ResultadoIa } from "./ia";

/**
 * Server Actions — a fronteira entre navegador e servidor.
 *
 * Invólucros finos em volta dos módulos testáveis. A lógica vive em
 * sessao.ts e compilar.ts, que rodam sem o Next; aqui só se resolve
 * configuração e se aplica a diretiva "use server".
 *
 * Nenhum segredo atravessa esta fronteira: DATABASE_URL, WORKER_TOKEN e a
 * chave da IA ficam do lado do servidor, e o navegador só vê o resultado.
 */

let bancoCompartilhado: Banco | null = null;

async function banco(): Promise<Banco> {
  if (bancoCompartilhado) return bancoCompartilhado;

  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL não configurada.");

  bancoCompartilhado = await criarConexao(url);
  return bancoCompartilhado;
}

export async function acaoSalvar(sessionId: string, cv: CvData): Promise<boolean> {
  const r = await salvarEtapa(await banco(), sessionId, cv);
  return r.ok;
}

export async function acaoApagarTudo(sessionId: string): Promise<boolean> {
  const ok = await apagarTudo(await banco(), sessionId);
  revalidatePath("/");
  return ok;
}

export async function acaoCompilar(cv: CvData) {
  const urlWorker = process.env["WORKER_URL"];
  const token = process.env["WORKER_TOKEN"];

  if (!urlWorker || !token) {
    // Configuração ausente é defeito de implantação, não do usuário — mas a
    // mensagem que ele vê não menciona variável de ambiente nenhuma.
    return {
      ok: false as const,
      codigo: "ERRO_INTERNO" as const,
      mensagem: "O gerador de PDF não está disponível agora. Seu currículo está salvo.",
    };
  }

  return compilarCv(cv, { urlWorker, token });
}

/**
 * A resolução e o REUSO do serviço vivem em `servicoIa.ts`, não aqui.
 *
 * Não é organização: a cota por sessão mora dentro do serviço, então quem
 * decide quando o serviço é criado decide se existe teto de gasto. Isso é
 * lógica, e lógica precisa de teste — que este arquivo não pode ter, porque
 * não roda sem o Next (AGENTS.md §3).
 */
/**
 * Polimento de uma experiência pela IA.
 *
 * Devolve resultado, nunca exceção: a IA não pode bloquear o fluxo, e em
 * produção a mensagem de uma exceção de Server Action é substituída por um
 * digest — então o motivo precisa vir como dado para a tela poder explicá-lo.
 */
export async function acaoPolirExperiencia(
  sessionId: string,
  cv: CvData,
  experienciaId: string,
): Promise<ResultadoIa<string[]>> {
  const servico = obterServicoIa();
  if (!servico) return { ok: false, motivo: "sem_configuracao" };

  return ia.polirExperiencia(servico, cv, experienciaId, sessionId);
}

export async function acaoNormalizarHabilidades(
  sessionId: string,
  cv: CvData,
): Promise<ResultadoIa<HabilidadeSugerida[]>> {
  const servico = obterServicoIa();
  if (!servico) return { ok: false, motivo: "sem_configuracao" };

  return ia.normalizarHabilidades(servico, cv, sessionId);
}
