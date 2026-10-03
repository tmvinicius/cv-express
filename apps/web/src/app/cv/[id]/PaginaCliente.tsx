"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { CvData } from "@cv-express/schema";

import {
  FormularioCliente,
  type OpcoesNavegacao,
} from "../../../componentes/FormularioCliente";
import type { IdEtapa } from "../../../formulario/etapas";
import type { Capacidades } from "../../../acoes/capacidades";
import {
  acaoSalvar,
  acaoCompilar,
  acaoConcluir,
  acaoPolirExperiencia,
  acaoNormalizarHabilidades,
} from "../../../acoes/servidor";

/**
 * Cola entre a página de servidor e o formulário.
 *
 * A navegação usa `router.push`, então a etapa fica na URL e o histórico do
 * navegador funciona. `scroll: false` evita o salto para o topo a cada etapa,
 * que no celular dá a impressão de que a página recarregou.
 *
 * `?item=` acompanha a etapa quando o destino é um item específico — o
 * painel de seções e as sugestões de corte sabem exatamente de qual item
 * falam, e perder isso no caminho entregava a lista inteira.
 */
export function PaginaCliente({
  sessionId,
  cvInicial,
  etapaInicial,
  itemEmFoco,
  capacidades,
  prazo,
}: {
  sessionId: string;
  cvInicial: CvData;
  etapaInicial: IdEtapa;
  itemEmFoco?: string | undefined;
  capacidades: Capacidades;
  /** ISO do prazo de edição, se o currículo já foi concluído. */
  prazo: string | null;
}) {
  const router = useRouter();

  const navegar = useCallback(
    (etapa: IdEtapa, opcoes: OpcoesNavegacao = {}) => {
      const busca = new URLSearchParams({ etapa });
      if (opcoes.item) busca.set("item", opcoes.item);
      const destino = `/cv/${sessionId}?${busca.toString()}`;

      if (opcoes.substituir) router.replace(destino, { scroll: false });
      else router.push(destino, { scroll: false });
    },
    [router, sessionId],
  );

  const salvar = useCallback((cv: CvData) => acaoSalvar(sessionId, cv), [sessionId]);
  const polir = useCallback(
    (cv: CvData, id: string) => acaoPolirExperiencia(sessionId, cv, id),
    [sessionId],
  );
  const concluir = useCallback((cv: CvData) => acaoConcluir(sessionId, cv), [sessionId]);
  const normalizar = useCallback(
    (cv: CvData) => acaoNormalizarHabilidades(sessionId, cv),
    [sessionId],
  );

  return (
    <FormularioCliente
      cvInicial={cvInicial}
      etapaInicial={etapaInicial}
      itemEmFoco={itemEmFoco}
      iaDisponivel={capacidades.ia.disponivel}
      salvar={salvar}
      aoNavegar={navegar}
      pedirSugestaoExperiencia={polir}
      pedirSugestaoHabilidades={normalizar}
      compilar={acaoCompilar}
      concluir={concluir}
      emailDisponivel={capacidades.email.disponivel}
      prazoInicial={prazo}
    />
  );
}
