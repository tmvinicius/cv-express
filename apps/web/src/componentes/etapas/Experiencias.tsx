"use client";
import { LIMITES, type CvData } from "@cv-express/schema";
import { Campo } from "../Campo";
import { SeletorPeriodo } from "../SeletorPeriodo";
import { ListaEditavel } from "../ListaEditavel";
import { AprovacaoIa, type EstadoSugestao } from "../AprovacaoIa";
import type { Despachar } from "../../formulario/reducer";

/**
 * Experiências, uma por vez, com o polimento da IA logo após cada uma
 * (seção 6 do planejamento).
 *
 * A aprovação da IA fica DENTRO do item, e não numa etapa separada no fim.
 * Pedir para a pessoa revisar cinco sugestões de uma vez, depois de já ter
 * esquecido o que escreveu em cada uma, transformaria a revisão em clique
 * automático — e a aprovação humana é o que sustenta a promessa de que nada
 * é inventado.
 */
export function Experiencias({
  cv,
  despachar,
  sugestoes,
  aoPedirSugestao,
}: {
  cv: CvData;
  despachar: Despachar;
  /** Estado da sugestão por id de experiência. */
  sugestoes: Record<string, EstadoSugestao>;
  aoPedirSugestao: (id: string) => void;
}) {
  return (
    <div className="etapa">
      <h2>Por onde você já passou?</h2>

      <ListaEditavel
        itens={cv.experiencias}
        titulo="Experiências profissionais"
        textoVazio="Ainda sem experiências aqui. Se este é seu primeiro emprego, pode seguir em frente — o currículo funciona sem esta parte."
        rotuloAdicionar="Adicionar experiência"
        aoAdicionar={() => despachar({ tipo: "exp:adicionar" })}
        aoRemover={(id) => despachar({ tipo: "exp:remover", id })}
        rotuloRemover={(e, i) => `Remover ${e.cargo || `experiência ${i + 1}`}`}
        renderizar={(exp) => (
          <>
            <Campo
              rotulo="Cargo"
              valor={exp.cargo}
              aoMudar={(v) =>
                despachar({ tipo: "exp:campo", id: exp.id, campo: "cargo", valor: v })
              }
              obrigatorio
            />
            <Campo
              rotulo="Empresa"
              valor={exp.empresa}
              aoMudar={(v) =>
                despachar({ tipo: "exp:campo", id: exp.id, campo: "empresa", valor: v })
              }
              obrigatorio
            />
            <Campo
              rotulo="Cidade"
              valor={exp.cidade ?? ""}
              aoMudar={(v) =>
                despachar({ tipo: "exp:campo", id: exp.id, campo: "cidade", valor: v })
              }
              ajuda="Opcional."
            />

            <SeletorPeriodo
              inicio={exp.periodo.inicio}
              fim={exp.periodo.fim}
              aoMudarInicio={(inicio) =>
                despachar({ tipo: "exp:periodo", id: exp.id, inicio })
              }
              aoMudarFim={(fim) => despachar({ tipo: "exp:periodo", id: exp.id, fim })}
            />

            <Campo
              rotulo="O que você fazia lá?"
              valor={exp.descricaoOriginal}
              aoMudar={(v) =>
                despachar({
                  tipo: "exp:campo",
                  id: exp.id,
                  campo: "descricaoOriginal",
                  valor: v,
                })
              }
              ajuda="Escreva do seu jeito, sem se preocupar com formatação. A IA organiza depois."
              multilinha
              maxLength={LIMITES.DESCRICAO_MAX}
            />

            {exp.bullets.length > 0 ? (
              <div className="bullets-aplicados">
                <h3>Como vai aparecer no currículo</h3>
                <ul>
                  {exp.bullets.map((b, i) => (
                    <li key={`${exp.id}-${i}`}>
                      <Campo
                        rotulo={`Tópico ${i + 1}`}
                        valor={b}
                        aoMudar={(v) =>
                          despachar({
                            tipo: "exp:editarBullet",
                            id: exp.id,
                            indice: i,
                            valor: v,
                          })
                        }
                      />
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => despachar({ tipo: "exp:recusarIa", id: exp.id })}
                >
                  Voltar ao meu texto
                </button>
              </div>
            ) : (
              <AprovacaoIa
                original={exp.descricaoOriginal}
                estado={sugestoes[exp.id] ?? { fase: "ocioso" }}
                aoPedir={() => aoPedirSugestao(exp.id)}
                aoUsar={(bullets) =>
                  despachar({ tipo: "exp:aplicarIa", id: exp.id, bullets })
                }
                aoManterOriginal={() =>
                  despachar({ tipo: "exp:recusarIa", id: exp.id })
                }
              />
            )}
          </>
        )}
      />
    </div>
  );
}
