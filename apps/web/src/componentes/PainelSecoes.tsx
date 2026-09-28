"use client";
import type { CvData } from "@cv-express/schema";
import { ptBR } from "@cv-express/i18n";

export interface SecaoEditavel {
  id: string;
  rotulo: string;
  resumo: string;
}

/**
 * Painel lateral de seções — o "plano B" da seção 7 do planejamento.
 *
 * Esta é a forma de edição que FUNCIONA, e não um substituto provisório. A
 * edição por clique no PDF depende de coordenadas extraídas do .aux, e o
 * planejamento é explícito em que ela é aprimoramento, não requisito: se o
 * mapa vier vazio, o produto continua inteiro por aqui.
 *
 * Construir isto primeiro foi decisão deliberada — entrega a maior parte do
 * valor por uma fração do esforço e do risco.
 */
export function listarSecoes(cv: CvData): SecaoEditavel[] {
  const secoes: SecaoEditavel[] = [
    {
      id: "pessoal",
      rotulo: "Seus dados",
      resumo: cv.pessoal.nome || "Sem nome",
    },
  ];

  if (cv.objetivo.texto.trim() !== "") {
    secoes.push({
      id: "objetivo",
      rotulo: ptBR.secoes.objetivo,
      resumo: recortar(cv.objetivo.texto),
    });
  }

  for (const e of cv.experiencias) {
    secoes.push({
      id: `experiencias.${e.id}`,
      rotulo: e.cargo || "Experiência sem cargo",
      resumo: e.empresa || "Sem empresa",
    });
  }

  for (const f of cv.formacao) {
    secoes.push({
      id: `formacao.${f.id}`,
      rotulo: f.curso || "Formação sem curso",
      resumo: f.instituicao || "Sem instituição",
    });
  }

  if (cv.idiomas.length > 0) {
    secoes.push({
      id: "idiomas",
      rotulo: ptBR.secoes.idiomas,
      resumo: cv.idiomas.map((i) => i.idioma).filter(Boolean).join(", ") || "—",
    });
  }

  if (cv.habilidades.itens.length > 0 || cv.habilidades.textoOriginal.trim() !== "") {
    secoes.push({
      id: "habilidades",
      rotulo: ptBR.secoes.habilidades,
      resumo:
        cv.habilidades.itens.map((h) => h.nome).join(", ") ||
        recortar(cv.habilidades.textoOriginal),
    });
  }

  return secoes;
}

function recortar(texto: string, maximo = 60): string {
  const limpo = texto.trim().replace(/\s+/g, " ");
  return limpo.length <= maximo ? limpo : `${limpo.slice(0, maximo - 1)}…`;
}

export function PainelSecoes({
  cv,
  secaoAtiva,
  aoEscolher,
}: {
  cv: CvData;
  secaoAtiva?: string;
  aoEscolher: (id: string) => void;
}) {
  const secoes = listarSecoes(cv);

  return (
    <nav className="painel-secoes" aria-label="Seções do currículo">
      <h2 className="painel-secoes__titulo">O que você quer ajustar?</h2>
      <ul>
        {secoes.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => aoEscolher(s.id)}
              aria-current={s.id === secaoAtiva ? "true" : undefined}
              className="painel-secoes__item"
            >
              <span className="painel-secoes__rotulo">{s.rotulo}</span>
              <span className="painel-secoes__resumo">{s.resumo}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
