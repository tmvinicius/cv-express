"use client";
import type { CvData, NivelFormacao, StatusFormacao } from "@cv-express/schema";
import { ptBR } from "@cv-express/i18n";
import { Campo } from "../Campo";
import { Selecao } from "../Selecao";
import { SeletorPeriodo } from "../SeletorPeriodo";
import { ListaEditavel } from "../ListaEditavel";
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

export function Formacao({ cv, despachar }: { cv: CvData; despachar: Despachar }) {
  return (
    <div className="etapa">
      <h2>E os estudos?</h2>

      <ListaEditavel
        itens={cv.formacao}
        titulo="Formação acadêmica"
        textoVazio="Nada aqui ainda. Curso técnico e curso livre também contam."
        rotuloAdicionar="Adicionar formação"
        aoAdicionar={() => despachar({ tipo: "form:adicionar" })}
        aoRemover={(id) => despachar({ tipo: "form:remover", id })}
        rotuloRemover={(f, i) => `Remover ${f.curso || `formação ${i + 1}`}`}
        renderizar={(f) => (
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
            />
            <SeletorPeriodo
              inicio={f.periodo.inicio}
              fim={f.periodo.fim}
              aoMudarInicio={(inicio) =>
                despachar({ tipo: "form:periodo", id: f.id, inicio })
              }
              aoMudarFim={(fim) => despachar({ tipo: "form:periodo", id: f.id, fim })}
              rotuloAtual="Ainda estou cursando"
            />
          </>
        )}
      />
    </div>
  );
}
