"use client";

import { useCallback, useReducer, useState } from "react";
import type { CategoriaHabilidade, CvData } from "@cv-express/schema";

import { reduzir, type AcaoCv } from "../formulario/reducer";
import { useAutosave } from "../formulario/useAutosave";
import { etapaPorId, type IdEtapa } from "../formulario/etapas";
import { avancar, voltar, calcularProgresso } from "../formulario/maquina";

import { BarraProgresso } from "./BarraProgresso";
import { IndicadorAutosave } from "./IndicadorAutosave";
import { DadosPessoais } from "./etapas/DadosPessoais";
import { Objetivo } from "./etapas/Objetivo";
import { Experiencias } from "./etapas/Experiencias";
import { Formacao } from "./etapas/Formacao";
import { Idiomas } from "./etapas/Idiomas";
import { Habilidades, type EstadoHabilidades } from "./etapas/Habilidades";
import type { EstadoSugestao } from "./AprovacaoIa";

export interface FormularioClienteProps {
  cvInicial: CvData;
  etapaInicial: IdEtapa;
  salvar: (cv: CvData) => Promise<boolean>;
  aoNavegar: (etapa: IdEtapa) => void;
  pedirSugestaoExperiencia: (cv: CvData, id: string) => Promise<string[]>;
  /** Devolve o que o serviço de IA produz: sem id, que o redutor atribui. */
  pedirSugestaoHabilidades: (
    cv: CvData,
  ) => Promise<{ nome: string; categoria: CategoriaHabilidade }[]>;
}

/**
 * Onde o formulário ganha vida.
 *
 * Junta o redutor, o autosave e as telas. A etapa atual vem por prop (a
 * página a lê da URL), e não de estado interno — recarregar, voltar pelo
 * navegador e compartilhar o endereço continuam funcionando.
 */
export function FormularioCliente({
  cvInicial,
  etapaInicial,
  salvar,
  aoNavegar,
  pedirSugestaoExperiencia,
  pedirSugestaoHabilidades,
}: FormularioClienteProps) {
  const [cv, despachar] = useReducer(reduzir, cvInicial);
  const [erros, setErros] = useState<string[]>([]);

  const [sugestoes, setSugestoes] = useState<Record<string, EstadoSugestao>>({});
  const [sugestaoHab, setSugestaoHab] = useState<EstadoHabilidades>({ fase: "ocioso" });

  const { estado: estadoAutosave } = useAutosave(cv, { salvar });

  const progresso = calcularProgresso(etapaInicial, cv);
  const etapa = etapaPorId(etapaInicial);

  const seguir = useCallback(() => {
    const r = avancar(etapaInicial, cv);
    if (!r.ok) {
      setErros(r.erros);
      return;
    }
    setErros([]);
    aoNavegar(r.proxima);
  }, [etapaInicial, cv, aoNavegar]);

  const retroceder = useCallback(() => {
    const anterior = voltar(etapaInicial);
    // Voltar nunca valida e nunca limpa: a pessoa pode querer revisar o
    // passo anterior justamente porque errou neste.
    if (anterior) aoNavegar(anterior);
  }, [etapaInicial, aoNavegar]);

  /**
   * Pedido de sugestão à IA.
   *
   * O erro é tratado aqui, e não propagado: falha de IA jamais pode bloquear
   * o formulário. O pior desfecho possível é a pessoa seguir com o texto que
   * ela mesma escreveu, o que já é um resultado aceitável.
   */
  const pedirParaExperiencia = useCallback(
    async (id: string) => {
      setSugestoes((s) => ({ ...s, [id]: { fase: "pensando" } }));
      try {
        const bullets = await pedirSugestaoExperiencia(cv, id);
        setSugestoes((s) => ({ ...s, [id]: { fase: "pronta", bullets } }));
      } catch {
        setSugestoes((s) => ({
          ...s,
          [id]: {
            fase: "erro",
            mensagem: "Não conseguimos organizar agora. Seu texto continua valendo.",
          },
        }));
      }
    },
    [cv, pedirSugestaoExperiencia],
  );

  const pedirParaHabilidades = useCallback(async () => {
    setSugestaoHab({ fase: "pensando" });
    try {
      const itens = await pedirSugestaoHabilidades(cv);
      setSugestaoHab({ fase: "pronta", itens });
    } catch {
      setSugestaoHab({
        fase: "erro",
        mensagem: "Não conseguimos organizar agora. Seu texto continua valendo.",
      });
    }
  }, [cv, pedirSugestaoHabilidades]);

  const despacharELimpar = useCallback((acao: AcaoCv) => {
    despachar(acao);
    // Mexer em qualquer campo apaga os erros da tentativa anterior: manter
    // uma lista de erros que a pessoa já está corrigindo é ruído.
    setErros([]);
  }, []);

  return (
    <div className="formulario">
      <header className="formulario__cabecalho">
        <BarraProgresso progresso={progresso} />
        <IndicadorAutosave estado={estadoAutosave} />
      </header>

      <main className="formulario__conteudo">
        {etapaInicial === "pessoal" && (
          <DadosPessoais cv={cv} despachar={despacharELimpar} />
        )}
        {etapaInicial === "objetivo" && (
          <Objetivo cv={cv} despachar={despacharELimpar} />
        )}
        {etapaInicial === "experiencias" && (
          <Experiencias
            cv={cv}
            despachar={despacharELimpar}
            sugestoes={sugestoes}
            aoPedirSugestao={(id) => void pedirParaExperiencia(id)}
          />
        )}
        {etapaInicial === "formacao" && (
          <Formacao cv={cv} despachar={despacharELimpar} />
        )}
        {etapaInicial === "idiomas" && (
          <Idiomas cv={cv} despachar={despacharELimpar} />
        )}
        {etapaInicial === "habilidades" && (
          <Habilidades
            cv={cv}
            despachar={despacharELimpar}
            estado={sugestaoHab}
            aoPedirSugestao={() => void pedirParaHabilidades()}
          />
        )}
      </main>

      {erros.length > 0 && (
        <div className="formulario__erros" role="alert">
          <p>Falta ajustar antes de seguir:</p>
          <ul>
            {erros.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <nav className="formulario__navegacao" aria-label="Navegação entre etapas">
        {voltar(etapaInicial) && (
          <button type="button" onClick={retroceder}>
            Voltar
          </button>
        )}
        <button type="button" onClick={seguir}>
          {etapa.opcional && !etapa.preenchida(cv) ? "Pular esta etapa" : "Continuar"}
        </button>
      </nav>
    </div>
  );
}
