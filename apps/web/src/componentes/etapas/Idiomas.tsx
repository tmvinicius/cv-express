"use client";
import type { CvData, NivelIdioma } from "@cv-express/schema";
import { ptBR } from "@cv-express/i18n";
import { Campo } from "../Campo";
import { Selecao } from "../Selecao";
import { ListaEditavel } from "../ListaEditavel";
import type { Despachar } from "../../formulario/reducer";

const NIVEIS: { valor: NivelIdioma; rotulo: string }[] = (
  ["basico", "intermediario", "avancado", "fluente", "nativo"] as const
).map((v) => ({ valor: v, rotulo: ptBR.niveisIdioma[v] }));

export function Idiomas({ cv, despachar }: { cv: CvData; despachar: Despachar }) {
  return (
    <div className="etapa">
      <h2>Fala algum outro idioma?</h2>

      <ListaEditavel
        itens={cv.idiomas}
        titulo="Idiomas"
        textoVazio="Nenhum idioma por enquanto — e tudo bem seguir sem isso."
        rotuloAdicionar="Adicionar idioma"
        aoAdicionar={() => despachar({ tipo: "idioma:adicionar" })}
        aoRemover={(id) => despachar({ tipo: "idioma:remover", id })}
        rotuloRemover={(i, idx) => `Remover ${i.idioma || `idioma ${idx + 1}`}`}
        renderizar={(idioma) => (
          <>
            <Campo
              rotulo="Idioma"
              valor={idioma.idioma}
              aoMudar={(v) =>
                despachar({ tipo: "idioma:nome", id: idioma.id, valor: v })
              }
            />
            <Selecao
              rotulo="Nível"
              valor={idioma.nivel}
              opcoes={NIVEIS}
              aoMudar={(nivel) =>
                despachar({ tipo: "idioma:nivel", id: idioma.id, nivel })
              }
            />
          </>
        )}
      />
    </div>
  );
}
