"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { CvData } from "@cv-express/schema";

import { FormularioCliente } from "../../../componentes/FormularioCliente";
import type { IdEtapa } from "../../../formulario/etapas";
import {
  acaoSalvar,
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
}: {
  sessionId: string;
  cvInicial: CvData;
  etapaInicial: IdEtapa;
}) {
  const router = useRouter();

  const navegar = useCallback(
    (etapa: IdEtapa) => {
      router.push(`/cv/${sessionId}?etapa=${etapa}`, { scroll: false });
    },
    [router, sessionId],
  );

  return (
    <FormularioCliente
      cvInicial={cvInicial}
      etapaInicial={etapaInicial}
      salvar={(cv) => acaoSalvar(sessionId, cv)}
      aoNavegar={navegar}
      pedirSugestaoExperiencia={(cv, id) => acaoPolirExperiencia(sessionId, cv, id)}
      pedirSugestaoHabilidades={(cv) => acaoNormalizarHabilidades(sessionId, cv)}
    />
  );
}
