import { notFound } from "next/navigation";
import { obterBanco } from "../../../acoes/banco";
import { carregarSessao } from "../../../acoes/sessao";
import { capacidadesDoAmbiente } from "../../../acoes/capacidades";
import { etapaDaUrl } from "../../../formulario/etapas";
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
  searchParams: Promise<{ etapa?: string; item?: string }>;
}) {
  const { id } = await params;
  const { etapa, item } = await searchParams;

  const sessao = await carregarSessao(await obterBanco(), id);

  // Sessão expirada e sessão inexistente são a mesma coisa para quem acessa:
  // não existe currículo nesse endereço.
  if (!sessao) notFound();

  return (
    <PaginaCliente
      sessionId={id}
      cvInicial={sessao.data}
      /* Validada, e não convertida com `as`: um valor desconhecido (um link
         antigo para "boas-vindas", por exemplo) derrubava o render com 500. */
      etapaInicial={etapaDaUrl(etapa)}
      /* `?item=` diz QUAL item da lista abrir. Vem do painel de seções e das
         sugestões de corte, que sabem exatamente de qual item falam. */
      itemEmFoco={item}
      /* Lido aqui, no servidor, e não no navegador: a página já nasce sabendo
         se a ajuda da IA funciona, e o botão não pisca de habilitado para
         desabilitado. Só o booleano atravessa — a chave não. */
      capacidades={capacidadesDoAmbiente()}
    />
  );
}
