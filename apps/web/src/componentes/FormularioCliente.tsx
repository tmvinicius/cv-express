"use client";

import { useCallback, useReducer, useRef, useState } from "react";
import type { CategoriaHabilidade, CvData } from "@cv-express/schema";

import { reduzir, type AcaoCv } from "../formulario/reducer";
import { useAutosave } from "../formulario/useAutosave";
import {
  ETAPAS,
  destinoDoCampo,
  etapaPorId,
  indiceDa,
  type IdEtapa,
} from "../formulario/etapas";
import { avancar, voltar, calcularProgresso } from "../formulario/maquina";
import type { ResultadoIa } from "../acoes/ia";
import type { Compilar } from "../preview/useCompilacao";

import { BarraProgresso } from "./BarraProgresso";
import { TrilhaEtapas } from "./TrilhaEtapas";
import { IndicadorAutosave } from "./IndicadorAutosave";
import { DadosPessoais } from "./etapas/DadosPessoais";
import { Objetivo } from "./etapas/Objetivo";
import { Experiencias } from "./etapas/Experiencias";
import { Formacao } from "./etapas/Formacao";
import { Idiomas } from "./etapas/Idiomas";
import { Habilidades, type EstadoHabilidades } from "./etapas/Habilidades";
import { Resultado } from "./etapas/Resultado";
import type { EstadoSugestao } from "./AprovacaoIa";
import { mensagemDeFalhaIa, podeTentarDeNovo } from "./mensagensIa";

export interface OpcoesNavegacao {
  /** Item da lista a abrir e focar (`?item=`). */
  item?: string;
  /** Substitui a entrada do histórico em vez de empilhar uma nova. */
  substituir?: boolean;
}

type HabilidadeSemId = { nome: string; categoria: CategoriaHabilidade };

export interface FormularioClienteProps {
  cvInicial: CvData;
  etapaInicial: IdEtapa;
  /** Item pedido na URL — vem do painel de seções e das sugestões de corte. */
  itemEmFoco?: string | undefined;
  /** O servidor tem IA configurada? Só ele sabe; a página lê e repassa. */
  iaDisponivel?: boolean;
  salvar: (cv: CvData) => Promise<boolean>;
  aoNavegar: (etapa: IdEtapa, opcoes?: OpcoesNavegacao) => void;
  /**
   * A IA devolve RESULTADO, com o motivo da falha como código. Ver
   * `acoes/ia.ts`: em produção, a mensagem de uma exceção de Server Action é
   * trocada por um digest, então só o código atravessa a fronteira.
   */
  pedirSugestaoExperiencia: (cv: CvData, id: string) => Promise<ResultadoIa<string[]>>;
  /** Devolve o que o serviço de IA produz: sem id, que o redutor atribui. */
  pedirSugestaoHabilidades: (cv: CvData) => Promise<ResultadoIa<HabilidadeSemId[]>>;
  /** Obrigatória: sem ela o formulário não tem como entregar o PDF. */
  compilar: Compilar;
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
  itemEmFoco,
  iaDisponivel = true,
  salvar,
  aoNavegar,
  pedirSugestaoExperiencia,
  pedirSugestaoHabilidades,
  compilar,
}: FormularioClienteProps) {
  const [cv, despachar] = useReducer(reduzir, cvInicial);
  const [erros, setErros] = useState<string[]>([]);

  const [sugestoes, setSugestoes] = useState<Record<string, EstadoSugestao>>({});
  const [sugestaoHab, setSugestaoHab] = useState<EstadoHabilidades>({ fase: "ocioso" });

  /**
   * Versão de cada pedido à IA, por experiência (e uma para habilidades).
   *
   * Uma resposta só vale se a versão não mudou desde que o pedido saiu. Sem
   * isto, a pessoa pedia a sugestão, reescrevia a descrição enquanto a IA
   * pensava, e recebia tópicos do texto ANTIGO apresentados como sugestão do
   * texto novo — um clique em "Usar sugestão" e o currículo carregava
   * informação que já não correspondia ao que ela escreveu.
   */
  const versaoExp = useRef<Record<string, number>>({});
  const versaoHab = useRef(0);

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

  const irParaEtapa = useCallback((destino: IdEtapa) => aoNavegar(destino), [aoNavegar]);

  const irParaCampo = useCallback(
    (fieldId: string) => {
      const d = destinoDoCampo(fieldId);
      aoNavegar(d.etapa, d.itemId ? { item: d.itemId } : {});
    },
    [aoNavegar],
  );

  // "gerando" é passagem: substitui a entrada do histórico, para que o botão
  // Voltar do navegador leve do preview direto às habilidades.
  const aoGerar = useCallback(() => aoNavegar("preview", { substituir: true }), [aoNavegar]);

  /** Esquece a sugestão de uma experiência, e invalida o pedido em voo. */
  const descartarSugestaoExp = useCallback((id: string) => {
    versaoExp.current[id] = (versaoExp.current[id] ?? 0) + 1;
    setSugestoes((s) => {
      if (!(id in s)) return s;
      const { [id]: _descartada, ...resto } = s;
      return resto;
    });
  }, []);

  const descartarSugestaoHab = useCallback(() => {
    versaoHab.current += 1;
    setSugestaoHab({ fase: "ocioso" });
  }, []);

  /**
   * Pedido de sugestão à IA.
   *
   * O erro é tratado aqui, e não propagado: falha de IA jamais pode bloquear
   * o formulário. O pior desfecho possível é a pessoa seguir com o texto que
   * ela mesma escreveu, o que já é um resultado aceitável.
   */
  const pedirParaExperiencia = useCallback(
    async (id: string) => {
      const versao = (versaoExp.current[id] ?? 0) + 1;
      versaoExp.current[id] = versao;
      setSugestoes((s) => ({ ...s, [id]: { fase: "pensando" } }));

      let r: ResultadoIa<string[]>;
      try {
        r = await pedirSugestaoExperiencia(cv, id);
      } catch {
        // A Server Action ainda pode lançar quando a rede cai no caminho.
        r = { ok: false, motivo: "desconhecido" };
      }

      if (versaoExp.current[id] !== versao) return;

      setSugestoes((s) => ({ ...s, [id]: estadoDaSugestao(r) }));
    },
    [cv, pedirSugestaoExperiencia],
  );

  const pedirParaHabilidades = useCallback(async () => {
    const versao = ++versaoHab.current;
    setSugestaoHab({ fase: "pensando" });

    let r: ResultadoIa<HabilidadeSemId[]>;
    try {
      r = await pedirSugestaoHabilidades(cv);
    } catch {
      r = { ok: false, motivo: "desconhecido" };
    }

    if (versaoHab.current !== versao) return;

    setSugestaoHab(
      r.ok
        ? { fase: "pronta", itens: r.dados }
        : {
            fase: "erro",
            mensagem: mensagemDeFalhaIa(r.motivo),
            tentavel: podeTentarDeNovo(r.motivo),
          },
    );
  }, [cv, pedirSugestaoHabilidades]);

  const despacharELimpar = useCallback(
    (acao: AcaoCv) => {
      despachar(acao);
      // Mexer em qualquer campo apaga os erros da tentativa anterior: manter
      // uma lista de erros que a pessoa já está corrigindo é ruído.
      setErros([]);

      // A sugestão pendente morre junto com o texto que a originou, e também
      // quando a pessoa decide (usar ou manter o dela). Sem isto, "Manter o
      // meu texto" não tinha efeito visível — a comparação continuava na tela
      // — e uma sugestão do texto antigo sobrevivia à edição do texto.
      switch (acao.tipo) {
        case "exp:campo":
          if (acao.campo === "descricaoOriginal") descartarSugestaoExp(acao.id);
          break;
        case "exp:aplicarIa":
        case "exp:recusarIa":
        case "exp:remover":
          descartarSugestaoExp(acao.id);
          break;
        case "hab:texto":
        case "hab:aplicarIa":
        case "hab:recusarIa":
          descartarSugestaoHab();
          break;
      }
    },
    [descartarSugestaoExp, descartarSugestaoHab],
  );

  const final = etapaInicial === "gerando" || etapaInicial === "preview";
  const anterior = voltar(etapaInicial);
  const proxima = proximaNaFila(etapaInicial);

  return (
    <div className="formulario">
      <header className="formulario__cabecalho">
        <BarraProgresso progresso={progresso} />
        <TrilhaEtapas progresso={progresso} aoEscolher={irParaEtapa} />
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
            iaDisponivel={iaDisponivel}
            aoPedirSugestao={(id) => void pedirParaExperiencia(id)}
            itemEmFoco={itemEmFoco}
          />
        )}
        {etapaInicial === "formacao" && (
          <Formacao cv={cv} despachar={despacharELimpar} itemEmFoco={itemEmFoco} />
        )}
        {etapaInicial === "idiomas" && (
          <Idiomas cv={cv} despachar={despacharELimpar} itemEmFoco={itemEmFoco} />
        )}
        {etapaInicial === "habilidades" && (
          <Habilidades
            cv={cv}
            despachar={despacharELimpar}
            estado={sugestaoHab}
            iaDisponivel={iaDisponivel}
            aoPedirSugestao={() => void pedirParaHabilidades()}
          />
        )}
        {final && (
          <Resultado
            cv={cv}
            etapa={etapaInicial}
            compilar={compilar}
            aoGerar={aoGerar}
            aoIrParaCampo={irParaCampo}
            aoIrParaEtapa={irParaEtapa}
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
        {anterior && (
          <button type="button" onClick={retroceder}>
            Voltar
          </button>
        )}
        {/* Nas telas finais não há "Continuar": em "gerando" o avanço é
            automático, e no preview a ação principal é o download. */}
        {!final && (
          <button type="button" onClick={seguir}>
            {rotuloDeSeguir(etapa.opcional && !etapa.preenchida(cv), proxima)}
          </button>
        )}
      </nav>
    </div>
  );
}

function estadoDaSugestao(r: ResultadoIa<string[]>): EstadoSugestao {
  if (!r.ok) {
    return {
      fase: "erro",
      mensagem: mensagemDeFalhaIa(r.motivo),
      tentavel: podeTentarDeNovo(r.motivo),
    };
  }
  // Lista vazia: o item foi removido enquanto o pedido ia e voltava. Não há
  // o que comparar, e uma comparação com lado direito vazio seria confusa.
  return r.dados.length > 0 ? { fase: "pronta", bullets: r.dados } : { fase: "ocioso" };
}

/** A etapa seguinte na fila, sem validar — só para escolher o rótulo. */
function proximaNaFila(atual: IdEtapa): IdEtapa | null {
  return ETAPAS[indiceDa(atual) + 1]?.id ?? null;
}

function rotuloDeSeguir(pulando: boolean, proxima: IdEtapa | null): string {
  if (proxima === "gerando") return pulando ? "Pular e gerar o currículo" : "Gerar meu currículo";
  return pulando ? "Pular esta etapa" : "Continuar";
}
