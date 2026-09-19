import { describe, it, expect } from "vitest";
import { gerarTex } from "../gerar.js";
import { construirViewModel } from "../viewModel.js";
import { cvMinimo, cvCompleto, cvExtremo } from "./fixtures.js";

describe("gerarTex — estrutura do documento", () => {
  it("gera um documento LaTeX completo", () => {
    const { tex } = gerarTex(cvCompleto());
    expect(tex).toContain("\\documentclass{cvexpress}");
    expect(tex).toContain("\\begin{document}");
    expect(tex).toContain("\\end{document}");
  });

  it("respeita a ordem canônica das seções", () => {
    const { tex } = gerarTex(cvCompleto());
    const pos = (s: string) => tex.indexOf(s);

    // Cabeçalho → objetivo → experiências → formação → habilidades → idiomas
    expect(pos("Objetivo Profissional")).toBeGreaterThan(pos("\\cvNome"));
    expect(pos("Experiência Profissional")).toBeGreaterThan(pos("Objetivo Profissional"));
    expect(pos("Formação Acadêmica")).toBeGreaterThan(pos("Experiência Profissional"));
    expect(pos("Habilidades")).toBeGreaterThan(pos("Formação Acadêmica"));
    expect(pos("Idiomas")).toBeGreaterThan(pos("Habilidades"));
  });

  it("omite seções vazias — nenhum título órfão", () => {
    const { tex } = gerarTex(cvMinimo());
    expect(tex).toContain("\\cvNome");
    expect(tex).not.toContain("Objetivo Profissional");
    expect(tex).not.toContain("Experiência Profissional");
    expect(tex).not.toContain("Formação Acadêmica");
    expect(tex).not.toContain("Habilidades");
    expect(tex).not.toContain("Idiomas");
  });
});

describe("decisões de negócio aplicadas ao documento", () => {
  it("não imprime a idade, mesmo estando preenchida", () => {
    // Decisão da V1: coletar sem imprimir. Aplicada estruturalmente — a idade
    // nem entra no ViewModel.
    const cv = cvCompleto();
    expect(cv.pessoal.idade).toBe(34);

    const { tex } = gerarTex(cv);
    expect(tex).not.toContain("34");

    const vm = construirViewModel(cv);
    expect(vm.pessoal).not.toHaveProperty("idade");
  });

  it("usa bullets quando existem", () => {
    const { tex } = gerarTex(cvCompleto());
    expect(tex).toContain("\\begin{cvBullets}");
    expect(tex).toContain("Desenvolvi APIs REST");
  });

  it("cai para a descrição original quando não há bullets", () => {
    // Seção 3.3: não existe estado em que a experiência suma do PDF.
    const { tex } = gerarTex(cvCompleto());
    expect(tex).toContain("manutenção de sistemas legados");
  });

  it("ordena experiências da mais recente para a mais antiga", () => {
    const { tex } = gerarTex(cvCompleto());
    expect(tex.indexOf("Desenvolvedor Backend Sênior")).toBeLessThan(
      tex.indexOf("Desenvolvedor Júnior"),
    );
  });

  it("formata períodos de modo uniforme", () => {
    const { tex } = gerarTex(cvCompleto());
    expect(tex).toContain("mar/2022 – atual");
    expect(tex).toContain("jan/2019 – fev/2022");
  });

  it("emite âncoras de posição para os campos editáveis", () => {
    const { tex } = gerarTex(cvCompleto());
    expect(tex).toContain("\\cvCampo{ experiencias.exp-1.cargo }");
    expect(tex).toContain("\\cvCampo{ pessoal.nome }");
  });
});

describe("segurança no caminho completo", () => {
  /**
   * O teste unitário do escape prova a função. Este prova o CAMINHO: CvData
   * hostil → ViewModel → motor → .tex. Um ponto de interpolação sem escape em
   * qualquer partial apareceria aqui.
   */
  const LEGITIMAS =
    /\\(?:textbackslash\{\}|textasciitilde\{\}|textasciicircum\{\}|[{}$&#_%])/g;

  it("não deixa comando do usuário sobreviver ao documento", () => {
    const { tex } = gerarTex(cvExtremo());

    // Remove tudo que é legítimo: comandos do próprio template e saídas do
    // escaper. O que sobrar de contrabarra veio dos dados.
    const semEscapes = tex.replace(LEGITIMAS, "");
    const semComandosDoTemplate = semEscapes.replace(
      /\\(?:documentclass|begin|end|cvNome|cvContato|cvSep|cvLink|cvCampo|cvSecao|cvItem|cvParagrafo|cvBullets|cvHabilidades|cvIdioma|item)\b/g,
      "",
    );

    expect(semComandosDoTemplate).not.toMatch(/\\[a-zA-Z]/);
  });

  it("neutraliza \\input e \\write18 vindos dos campos", () => {
    const { tex } = gerarTex(cvExtremo());
    expect(tex).not.toContain("\\input{/etc/passwd}");
    expect(tex).not.toContain("\\write18");
    expect(tex).toContain("\\textbackslash{}input");
  });

  it("percent-encoda a URL do LinkedIn em vez de escapá-la como texto", () => {
    const { tex } = gerarTex(cvExtremo());
    expect(tex).toContain("https://exemplo.com/a%5Fb%25c%23d");
  });

  it("preserva acentuação intacta", () => {
    const { tex } = gerarTex(cvCompleto());
    expect(tex).toContain("João Conceição d'Ávila");
    expect(tex).toContain("São Paulo");
    expect(tex).toContain("Ciência da Computação");
  });
});

describe("determinismo e contentHash", () => {
  it("gera bytes idênticos em execuções repetidas", () => {
    const cv = cvCompleto();
    const primeira = gerarTex(cv);
    for (let i = 0; i < 10; i++) {
      const outra = gerarTex(cv);
      expect(outra.tex).toBe(primeira.tex);
      expect(outra.contentHash).toBe(primeira.contentHash);
    }
  });

  it("muda o hash quando o conteúdo muda", () => {
    const a = gerarTex(cvCompleto());
    const cvB = cvCompleto();
    cvB.pessoal.nome = "Outro Nome";
    expect(gerarTex(cvB).contentHash).not.toBe(a.contentHash);
  });

  it("independe da ordem de entrada das experiências", () => {
    // A ordenação é por período, não por posição no array. Reordenar a
    // entrada não pode invalidar o cache.
    const a = cvCompleto();
    const b = cvCompleto();
    b.experiencias = [...b.experiencias].reverse();
    expect(gerarTex(b).contentHash).toBe(gerarTex(a).contentHash);
  });

  it("agrupa habilidades em ordem fixa de categoria", () => {
    const { tex } = gerarTex(cvCompleto());
    expect(tex.indexOf("Técnicas")).toBeLessThan(tex.indexOf("Ferramentas"));
    expect(tex.indexOf("Ferramentas")).toBeLessThan(tex.indexOf("Comportamentais"));
  });
});

describe("snapshots do .tex", () => {
  // Mudança no template vira diff revisável no PR. É o que transforma a
  // "especificidade normalizada" de disciplina em verificação automática.
  it("mínimo", () => {
    expect(gerarTex(cvMinimo()).tex).toMatchSnapshot();
  });

  it("completo", () => {
    expect(gerarTex(cvCompleto()).tex).toMatchSnapshot();
  });

  it("extremo", () => {
    expect(gerarTex(cvExtremo()).tex).toMatchSnapshot();
  });
});
