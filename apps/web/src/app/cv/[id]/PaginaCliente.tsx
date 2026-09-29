"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { CvData } from "@cv-express/schema";

import { FormularioCliente } from "../../../componentes/FormularioCliente";
import type { IdEtapa } from "../../../formulario/etapas";
import type { Capacidades } from "../../../acoes/capacidades";
import {
  acaoSalvar,
  acaoCompilar,
  acaoApagarTudo,
  acaoPolirExperiencia,
  acaoNormalizarHabilidades,
} from "../../../acoes/servidor";

/**
 * Cola entre a página de servidor e o formulário.
 *
 * A navegação usa `router.push`, então a etapa fica na URL e o histórico do
 * navegador funciona. `scroll: false` evita o salto para o topo a cada etapa,
 * que no celular dá a impressão de que a página recarregou.
 */
export function PaginaCliente({
  sessionId,
  cvInicial,
  etapaInicial,
  itemEmFoco,
  capacidades,
}: {
  sessionId: string;
  cvInicial: CvData;
  etapaInicial: IdEtapa;
  itemEmFoco?: string | undefined;
  capacidades: Capacidades;
}) {
  const router = useRouter();

  const navegar = useCallback(
    (etapa: IdEtapa, itemId?: string) => {
      // `item` só entra quando existe: um `?item=` vazio na URL confundiria
      // quem lê o endereço e não significaria nada.
      const busca = new URLSearchParams({ etapa });
      if (itemId) busca.set("item", itemId);
      router.push(`/cv/${sessionId}?${busca.toString()}`, { scroll: false });
    },
    [router, sessionId],
  );

  return (
    <FormularioCliente
      cvInicial={cvInicial}
      etapaInicial={etapaInicial}
      itemEmFoco={itemEmFoco}
      capacidades={capacidades}
      salvar={(cv) => acaoSalvar(sessionId, cv)}
      aoNavegar={navegar}
      pedirSugestaoExperiencia={(cv, id) => acaoPolirExperiencia(sessionId, cv, id)}
      pedirSugestaoHabilidades={(cv) => acaoNormalizarHabilidades(sessionId, cv)}
      compilar={acaoCompilar}
      /* Depois de apagar não há para onde voltar: a sessão não existe mais e
         /cv/<id> passaria a responder 404. `router.replace` para "/" — que
         cria uma sessão nova — em vez de push, para o botão voltar do
         navegador não trazer a pessoa de volta a uma página morta. */
      apagarTudo={async () => {
        const ok = await acaoApagarTudo(sessionId);
        if (ok) router.replace("/");
        return ok;
      }}
    />
  );
}
