"use server";

import { revalidatePath } from "next/cache";
import { criarConexao, type Banco } from "@cv-express/db";
import { criarServicoIa, criarProviderDoAmbiente } from "@cv-express/ai";
import type { CvData } from "@cv-express/schema";

import { salvarEtapa, apagarTudo } from "./sessao";
import { compilarCv } from "./compilar";

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
 * Polimento de uma experiência pela IA.
 *
 * Devolve o texto original em caso de falha, em vez de lançar: o
 * planejamento exige que a IA nunca bloqueie o fluxo.
 */
export async function acaoPolirExperiencia(
  sessionId: string,
  cv: CvData,
  experienciaId: string,
): Promise<string[]> {
  const experiencia = cv.experiencias.find((e) => e.id === experienciaId);
  if (!experiencia) return [];

  const servico = criarServicoIa(criarProviderDoAmbiente());
  const r = await servico.polirExperiencia(
    { cargo: experiencia.cargo, descricao: experiencia.descricaoOriginal },
    sessionId,
  );

  if (!r.ok) throw new Error(r.erro.message);
  return r.dados.bullets;
}

export async function acaoNormalizarHabilidades(sessionId: string, cv: CvData) {
  const servico = criarServicoIa(criarProviderDoAmbiente());
  const r = await servico.normalizarHabilidades(
    { texto: cv.habilidades.textoOriginal },
    sessionId,
  );

  if (!r.ok) throw new Error(r.erro.message);
  return r.dados.itens;
}
