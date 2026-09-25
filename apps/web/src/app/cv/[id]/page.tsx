import { notFound } from "next/navigation";
import { criarConexao } from "@cv-express/db";
import { carregarSessao } from "../../../acoes/sessao";
import { calcularProgresso } from "../../../formulario/maquina";
import { BarraProgresso } from "../../../componentes/BarraProgresso";
import type { IdEtapa } from "../../../formulario/etapas";

/**
 * Nunca pré-renderizar: a página lê o currículo do banco, e o conteúdo muda a
 * cada autosave. Um HTML estático mostraria o rascunho congelado no build.
 */
export const dynamic = "force-dynamic";


/**
 * O formulário.
 *
 * A etapa atual vem da URL (`?etapa=`), e não do estado do React. É o que faz
 * recarregar a página, voltar pelo botão do navegador e compartilhar o
 * endereço funcionarem sem nada perdido — coerente com o requisito de que
 * perder o preenchimento é o pior defeito possível aqui.
 *
 * As telas de cada etapa entram na Parte 8, junto com o preview.
 */
export default async function PaginaFormulario({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ etapa?: string }>;
}) {
  const { id } = await params;
  const { etapa } = await searchParams;

  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL não configurada.");

  const db = await criarConexao(url);
  const sessao = await carregarSessao(db, id);

  // Sessão expirada ou inexistente são a mesma coisa para quem acessa: não
  // existe currículo nesse endereço.
  if (!sessao) notFound();

  const atual = (etapa ?? "boas-vindas") as IdEtapa;
  const progresso = calcularProgresso(atual, sessao.data);

  return (
    <main>
      <BarraProgresso progresso={progresso} />
      {/* As telas de etapa entram na Parte 8. */}
    </main>
  );
}
