"use client";
import type { CvData } from "@cv-express/schema";
import { LIMITES } from "@cv-express/schema";
import { Campo } from "../Campo";
import type { Despachar } from "../../formulario/reducer";

/**
 * Exemplos por área.
 *
 * Existem para matar a folha em branco, que o planejamento identifica como
 * uma das duas dores centrais do produto. Um campo vazio com "descreva seu
 * objetivo profissional" é exatamente onde a pessoa desiste.
 *
 * São exemplos para LER, não modelos para copiar: clicar preenche o campo
 * para a pessoa editar, e o texto deixa isso claro.
 */
const EXEMPLOS = [
  {
    area: "Tecnologia",
    texto:
      "Atuar como desenvolvedor backend, em um time que valorize qualidade de código e entrega contínua.",
  },
  {
    area: "Administrativo",
    texto:
      "Trabalhar com rotinas administrativas e atendimento, contribuindo para a organização dos processos da equipe.",
  },
  {
    area: "Vendas",
    texto:
      "Atuar na área comercial, com foco em relacionamento com clientes e crescimento da carteira.",
  },
  {
    area: "Saúde",
    texto:
      "Integrar uma equipe de atendimento ao paciente, com cuidado humanizado e atenção aos protocolos.",
  },
];

export function Objetivo({
  cv,
  despachar,
}: {
  cv: CvData;
  despachar: Despachar;
}) {
  return (
    <div className="etapa">
      <h2>O que você procura?</h2>
      <p className="etapa__apoio">
        Duas ou três linhas sobre o tipo de vaga que você quer. Não precisa ser
        perfeito — dá para ajustar depois.
      </p>

      <Campo
        rotulo="Objetivo profissional"
        valor={cv.objetivo.texto}
        aoMudar={(v) => despachar({ tipo: "objetivo", texto: v })}
        multilinha
        maxLength={LIMITES.OBJETIVO_MAX}
      />

      <details className="exemplos">
        <summary>Não sabe como começar? Veja exemplos</summary>
        <ul>
          {EXEMPLOS.map((e) => (
            <li key={e.area}>
              <strong>{e.area}:</strong> {e.texto}
              <button
                type="button"
                onClick={() => despachar({ tipo: "objetivo", texto: e.texto })}
              >
                Usar como ponto de partida
              </button>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
