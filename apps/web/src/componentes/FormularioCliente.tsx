"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import type { CategoriaHabilidade, CvData } from "@cv-express/schema";

import { reduzir, type AcaoCv } from "../formulario/reducer";
import { useAutosave } from "../formulario/useAutosave";
import { destinoDoCampo, etapaPorId, type IdEtapa } from "../formulario/etapas";
import {
  avancar,
  voltar,
  calcularProgresso,
  prontoParaGerar,
} from "../formulario/maquina";
import { useCompilacao, type Compilar } from "../preview/useCompilacao";
import { sugerirCortes } from "../preview/sugestoesDeCorte";
import type { Capacidades } from "../acoes/capacidades";
import type { MotivoFalhaIa, ResultadoIa } from "../acoes/ia";
import { mensagemDeFalhaIa, podeTentarDeNovo } from "./mensagensIa";

import { Preview } from "./Preview";
import { ApagarMeusDados } from "./ApagarMeusDados";
import { PainelSecoes } from "./PainelSecoes";
import { AvisoPaginas } from "./AvisoPaginas";

import { BarraProgresso } from "./BarraProgresso";
import { TrilhaEtapas } from "./TrilhaEtapas";
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
  /**
   * Item que a pessoa pediu para ver (`?item=` na URL).
   *
   * Vem da URL, e não de estado interno, pela mesma razão que a etapa vem:
   * recarregar e o botão voltar do navegador continuam funcionando.
   */
  itemEmFoco?: string | undefined;
  salvar: (cv: CvData) => Promise<boolean>;
  aoNavegar: (etapa: IdEtapa, itemId?: string) => void;
  /** O que este servidor consegue fazer. Vem calculado do componente da rota. */
  capacidades: Capacidades;
  /**
   * Pedidos de IA devolvem RESULTADO, não lançam.
   *
   * O motivo da falha precisa chegar como dado para a tela poder dizer se foi
   * demora, cota ou ambiente sem IA — em produção o Next apaga a mensagem de
   * uma exceção de Server Action.
   */
  pedirSugestaoExperiencia: (cv: CvData, id: string) => Promise<ResultadoIa<string[]>>;
  /** Devolve o que o serviço de IA produz: sem id, que o redutor atribui. */
  pedirSugestaoHabilidades: (
    cv: CvData,
  ) => Promise<ResultadoIa<{ nome: string; categoria: CategoriaHabilidade }[]>>;
  /** Gera o PDF. Em produção é a Server Action que chama o latex-worker. */
  compilar: Compilar;
  /**
   * Apaga a sessão inteira e leva a pessoa embora. Obrigação de LGPD.
   *
   * Vem por prop, como `salvar` e `compilar`: o componente não conhece Server
   * Action nenhuma, e é o que permite testá-lo sem subir o Next.
   */
  apagarTudo: () => Promise<boolean>;
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
  salvar,
  aoNavegar,
  capacidades,
  pedirSugestaoExperiencia,
  pedirSugestaoHabilidades,
  compilar,
  apagarTudo,
}: FormularioClienteProps) {
  const [cv, despachar] = useReducer(reduzir, cvInicial);
  const [erros, setErros] = useState<string[]>([]);

  const [sugestoes, setSugestoes] = useState<Record<string, EstadoSugestao>>({});
  const [sugestaoHab, setSugestaoHab] = useState<EstadoHabilidades>({ fase: "ocioso" });

  const { estado: estadoAutosave } = useAutosave(cv, { salvar });

  const progresso = calcularProgresso(etapaInicial, cv);
  const etapa = etapaPorId(etapaInicial);

  /**
   * "gerando" e "preview" não têm campos: são onde o PDF acontece.
   *
   * Sem o currículo mínimo (nome, cidade, e-mail, objetivo), não se chama o
   * worker — ele recusaria com DADOS_INVALIDOS e a pessoa veria um erro
   * genérico em vez de saber o que falta. A URL permite chegar aqui direto,
   * então a checagem não pode depender de ter passado pelas etapas.
   */
  const naGeracao = etapaInicial === "gerando" || etapaInicial === "preview";
  const { pronto, pendencias } = prontoParaGerar(cv);
  const { estado: estadoPreview, tentarDeNovo } = useCompilacao(
    cv,
    compilar,
    naGeracao && pronto,
  );

  // "gerando" é a tela de espera: assim que o PDF sai, segue para o preview.
  // Em erro, fica ali mesmo, com a mensagem e o botão de tentar de novo.
  useEffect(() => {
    if (etapaInicial === "gerando" && estadoPreview.fase === "pronto") {
      aoNavegar("preview");
    }
  }, [etapaInicial, estadoPreview.fase, aoNavegar]);

  /**
   * Clique no painel de seções ou numa sugestão de corte.
   *
   * Leva o ITEM adiante, não só a etapa. Antes só a etapa viajava: clicar em
   * "Experiência 3" abria a lista inteira e a pessoa tinha de procurar qual
   * ela mesma pedira — e a sugestão de corte, que diz exatamente qual cargo
   * encurtar, entregava a mesma lista.
   */
  const irParaCampo = useCallback(
    (fieldId: string) => {
      const { etapa, itemId } = destinoDoCampo(fieldId);
      aoNavegar(etapa, itemId);
    },
    [aoNavegar],
  );

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
      let resultado: ResultadoIa<string[]>;
      try {
        resultado = await pedirSugestaoExperiencia(cv, id);
      } catch {
        // A Server Action lançou — rede caiu no meio do caminho. Sem motivo
        // confiável para mostrar, cai no texto genérico.
        resultado = { ok: false, motivo: "desconhecido" };
      }
      setSugestoes((s) => ({
        ...s,
        [id]: resultado.ok
          ? { fase: "pronta", bullets: resultado.dados }
          : estadoDeErro(resultado.motivo),
      }));
    },
    [cv, pedirSugestaoExperiencia],
  );

  const pedirParaHabilidades = useCallback(async () => {
    setSugestaoHab({ fase: "pensando" });
    let resultado: ResultadoIa<{ nome: string; categoria: CategoriaHabilidade }[]>;
    try {
      resultado = await pedirSugestaoHabilidades(cv);
    } catch {
      resultado = { ok: false, motivo: "desconhecido" };
    }
    setSugestaoHab(
      resultado.ok
        ? { fase: "pronta", itens: resultado.dados }
        : estadoDeErro(resultado.motivo),
    );
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
        {/* A trilha e a barra leem o MESMO `progresso`. É o que impede o
            "0%" ao lado de "Etapa 1 de 6" que existia aqui antes. */}
        <TrilhaEtapas progresso={progresso} aoEscolher={aoNavegar} />
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
            itemEmFoco={itemEmFoco}
            sugestoes={sugestoes}
            iaDisponivel={capacidades.ia.disponivel}
            aoPedirSugestao={(id) => void pedirParaExperiencia(id)}
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
            iaDisponivel={capacidades.ia.disponivel}
            aoPedirSugestao={() => void pedirParaHabilidades()}
          />
        )}

        {naGeracao && !pronto && (
          <div className="formulario__erros" role="alert">
            <p>Falta preencher antes de gerar o currículo:</p>
            <ul>
              {pendencias.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}

        {naGeracao && pronto && (
          <>
            <Preview
              estado={estadoPreview}
              nomeArquivo={nomeDoArquivo(cv)}
              aoTentarDeNovo={tentarDeNovo}
            />
            {etapaInicial === "preview" && estadoPreview.fase === "pronto" && (
              <AvisoPaginas
                paginas={estadoPreview.paginas}
                sugestoes={sugerirCortes(cv)}
                aoIrPara={irParaCampo}
              />
            )}
            {etapaInicial === "preview" && (
              <PainelSecoes cv={cv} aoEscolher={irParaCampo} />
            )}
            {/* No preview, e não antes: a pessoa acabou de ver (e baixar) o
                PDF. Oferecer "apagar tudo" no meio do preenchimento seria pôr
                a saída de emergência no caminho de quem está trabalhando. */}
            {etapaInicial === "preview" && <ApagarMeusDados aoApagar={apagarTudo} />}
          </>
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
        {/* Na geração não há para onde seguir: "gerando" avança sozinho e
            "preview" é a última etapa. Um "Continuar" ali só levava ao erro
            "Esta é a última etapa." */}
        {!naGeracao && (
          <button type="button" onClick={seguir}>
            {etapa.opcional && !etapa.preenchida(cv) ? "Pular esta etapa" : "Continuar"}
          </button>
        )}
      </nav>
    </div>
  );
}

/**
 * Motivo → estado de erro da tela.
 *
 * `tentavel` existe para não oferecer "tentar de novo" quando repetir não tem
 * como dar em outra coisa — um botão que não funciona é o defeito que este
 * caminho inteiro veio corrigir.
 */
function estadoDeErro(motivo: MotivoFalhaIa) {
  return {
    fase: "erro" as const,
    mensagem: mensagemDeFalhaIa(motivo),
    tentavel: podeTentarDeNovo(motivo),
  };
}

/** "João Conceição" → "curriculo-joao-conceicao.pdf". */
function nomeDoArquivo(cv: CvData): string {
  const base = cv.pessoal.nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base ? `curriculo-${base}.pdf` : "curriculo.pdf";
}
