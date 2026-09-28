import { notFound } from "next/navigation";
import { criarConexao } from "@cv-express/db";
import { carregarSessao } from "../../../acoes/sessao";
import type { IdEtapa } from "../../../formulario/etapas";
import { PaginaCliente } from "./PaginaCliente";

/**
 * A página do formulário.
 *
 * A etapa atual vem da URL (`?etapa=`), e não do estado do React: recarregar
 * a página, usar o botão voltar do navegador e compartilhar o endereço
 * continuam funcionando sem nada perdido.
 *
 * Nunca pré-renderizar: a página lê o currículo do banco, e o conteúdo muda a
 * cada autosave. Um HTML estático mostraria o rascunho congelado no build.
 */
export const dynamic = "force-dynamic";

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

  // Sessão expirada e sessão inexistente são a mesma coisa para quem acessa:
  // não existe currículo nesse endereço.
  if (!sessao) notFound();

  return (
    <PaginaCliente
      sessionId={id}
      cvInicial={sessao.data}
      etapaInicial={(etapa ?? "pessoal") as IdEtapa}
    />
  );
}
