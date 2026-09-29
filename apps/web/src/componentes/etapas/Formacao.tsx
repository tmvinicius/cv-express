"use client";
import {
  LIMITES,
  type CvData,
  type NivelFormacao,
  type StatusFormacao,
} from "@cv-express/schema";
import { ptBR } from "@cv-express/i18n";
import { Campo } from "../Campo";
import { Selecao } from "../Selecao";
import { SeletorPeriodo } from "../SeletorPeriodo";
import { ListaEditavel } from "../ListaEditavel";
import { diagnosticarFormacao } from "../../formulario/coerencia";
import type { Despachar } from "../../formulario/reducer";

const NIVEIS: { valor: NivelFormacao; rotulo: string }[] = (
  [
    "tecnico",
    "tecnologo",
    "graduacao",
    "pos_graduacao",
    "mestrado",
    "doutorado",
    "curso_livre",
  ] as const
).map((v) => ({ valor: v, rotulo: ptBR.niveisFormacao[v] }));

const STATUS: { valor: StatusFormacao; rotulo: string }[] = (
  ["concluido", "em_andamento", "trancado"] as const
).map((v) => ({ valor: v, rotulo: ptBR.statusFormacao[v] }));

export function Formacao({
  cv,
  despachar,
  itemEmFoco,
}: {
  cv: CvData;
  despachar: Despachar;
  /** Item que a pessoa pediu para ver, vindo do painel de seções. */
  itemEmFoco?: string | undefined;
}) {
  return (
    <div className="etapa">
      <h2>E os estudos?</h2>

      <ListaEditavel
        itemEmFoco={itemEmFoco}
        itens={cv.formacao}
        titulo="Formação acadêmica"
        textoVazio="Nada aqui ainda. Curso técnico e curso livre também contam."
        rotuloAdicionar="Adicionar formação"
        aoAdicionar={() => despachar({ tipo: "form:adicionar" })}
        aoRemover={(id) => despachar({ tipo: "form:remover", id })}
        rotuloRemover={(f, i) => `Remover ${f.curso || `formação ${i + 1}`}`}
        renderizar={(f, i) => (
          <>
            <Campo
              rotulo="Curso"
              valor={f.curso}
              aoMudar={(v) =>
                despachar({ tipo: "form:campo", id: f.id, campo: "curso", valor: v })
              }
              obrigatorio
            />
            <Campo
              rotulo="Instituição"
              valor={f.instituicao}
              aoMudar={(v) =>
                despachar({
                  tipo: "form:campo",
                  id: f.id,
                  campo: "instituicao",
                  valor: v,
                })
              }
              obrigatorio
            />
            <Selecao
              rotulo="Nível"
              valor={f.nivel}
              opcoes={NIVEIS}
              aoMudar={(nivel) => despachar({ tipo: "form:nivel", id: f.id, nivel })}
            />
            <Selecao
              rotulo="Situação"
              valor={f.status}
              opcoes={STATUS}
              aoMudar={(status) => despachar({ tipo: "form:status", id: f.id, status })}
              /* Só no primeiro item: repetida em cada formação, a mesma frase
                 vira ruído e ensina a pular o texto de apoio. */
              {...(i === 0
                ? {
                    ajuda:
                      "Quem ainda está cursando marca “Em andamento” — o período segue com a previsão de formatura.",
                  }
                : {})}
            />
            {/*
              Formação NÃO tem o checkbox de período em aberto, e isso é
              decisão de produto: "2022 – atual" não diz quando a pessoa se
              forma, "2022 – dez/2027" diz. Por isso o término é sempre uma
              data e aceita anos à frente, até o teto do schema — nenhuma opção
              oferecida aqui é recusada na validação. Quem ainda cursa se
              declara pela Situação, acima.
            */}
            <SeletorPeriodo
              inicio={f.periodo.inicio}
              fim={f.periodo.fim}
              aoMudarInicio={(inicio) =>
                despachar({ tipo: "form:periodo", id: f.id, inicio })
              }
              aoMudarFim={(fim) => despachar({ tipo: "form:periodo", id: f.id, fim })}
              permitirEmAberto={false}
              rotuloTermino="Conclusão (ou previsão)"
              anosFuturos={LIMITES.ANO_MAX_FUTURO}
              diagnosticos={diagnosticarFormacao(f)}
            />
          </>
        )}
      />
    </div>
  );
}
