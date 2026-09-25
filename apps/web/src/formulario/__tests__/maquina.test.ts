import { describe, it, expect } from "vitest";
import {
  novoCv,
  novaExperiencia,
  novoIdioma,
  type CvData,
} from "@cv-express/schema";

import { ETAPAS, etapaPorId } from "../etapas";
import {
  avancar,
  voltar,
  calcularProgresso,
  podeIrPara,
  prontoParaGerar,
} from "../maquina";

function cvComPessoal(): CvData {
  return {
    ...novoCv("teste"),
    pessoal: { nome: "Ana Souza", cidade: "Belo Horizonte", email: "ana@exemplo.com" },
  };
}

function cvCompletoObrigatorio(): CvData {
  return {
    ...cvComPessoal(),
    objetivo: { texto: "Atuar com desenvolvimento backend." },
  };
}

describe("validação por etapa", () => {
  /**
   * O problema que a divisão por etapa resolve: validarCv exige o currículo
   * inteiro, e o formulário não pode travar por causa de um campo que ainda
   * nem foi mostrado.
   */
  it("a etapa de dados pessoais não se importa com o objetivo vazio", () => {
    const cv = cvComPessoal();
    expect(cv.objetivo.texto).toBe("");
    expect(etapaPorId("pessoal").validar(cv)).toEqual([]);
  });

  it("a etapa de dados pessoais reprova e-mail inválido", () => {
    const cv = { ...novoCv("t"), pessoal: { nome: "Ana", cidade: "BH", email: "ana@" } };
    expect(etapaPorId("pessoal").validar(cv).length).toBeGreaterThan(0);
  });

  it("a etapa de experiências aponta qual item está errado", () => {
    const cv = {
      ...cvComPessoal(),
      experiencias: [
        novaExperiencia({ cargo: "Dev", empresa: "Acme" }),
        novaExperiencia({
          cargo: "Dev",
          empresa: "Beta",
          // Período invertido.
          periodo: { inicio: { ano: 2024, mes: 6 }, fim: { ano: 2020, mes: 1 } },
        }),
      ],
    };

    const erros = etapaPorId("experiencias").validar(cv);
    expect(erros).toHaveLength(1);
    expect(erros[0]).toContain("Experiência 2");
  });
});

describe("avançar", () => {
  it("bloqueia etapa obrigatória inválida", () => {
    const r = avancar("pessoal", novoCv("t"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erros.length).toBeGreaterThan(0);
  });

  it("libera etapa obrigatória válida", () => {
    const r = avancar("pessoal", cvComPessoal());
    expect(r).toEqual({ ok: true, proxima: "objetivo" });
  });

  it("deixa pular etapa opcional vazia", () => {
    // Primeiro emprego existe. Exigir experiência de quem está começando
    // trava justamente quem mais precisa do produto.
    const r = avancar("experiencias", cvComPessoal());
    expect(r).toEqual({ ok: true, proxima: "formacao" });
  });

  it("mas cobra correção do que foi preenchido numa etapa opcional", () => {
    const cv = {
      ...cvComPessoal(),
      idiomas: [novoIdioma({ idioma: "" })],
    };
    const r = avancar("idiomas", cv);
    expect(r.ok).toBe(false);
  });

  it("recusa avançar da última etapa", () => {
    const r = avancar("preview", cvCompletoObrigatorio());
    expect(r.ok).toBe(false);
  });
});

describe("voltar", () => {
  /**
   * "Voltar sempre permitido, sem perder o que foi preenchido adiante" é
   * requisito do planejamento. Estes dois testes o fixam.
   */
  it("é permitido mesmo com a etapa atual inválida", () => {
    // Exigir validade para voltar prenderia a pessoa num campo que ela quer
    // revisar depois de conferir o anterior.
    expect(voltar("objetivo")).toBe("pessoal");
  });

  it("não existe antes da primeira etapa", () => {
    expect(voltar("boas-vindas")).toBeNull();
  });

  it("não toca no currículo — dados adiante permanecem", () => {
    const cv = {
      ...cvCompletoObrigatorio(),
      experiencias: [novaExperiencia({ cargo: "Dev", empresa: "Acme" })],
    };
    const copia = structuredClone(cv);

    voltar("formacao");

    expect(cv).toEqual(copia);
    expect(cv.experiencias).toHaveLength(1);
  });
});

describe("progresso", () => {
  it("começa em zero num currículo em branco", () => {
    const p = calcularProgresso("boas-vindas", novoCv("t"));
    expect(p.percentual).toBe(0);
    expect(p.etapasConcluidas).toBe(0);
  });

  it("não conta boas-vindas, gerando e preview", () => {
    // Incluí-las mostraria progresso antes de a pessoa digitar qualquer coisa
    // — animador e falso.
    const p = calcularProgresso("boas-vindas", novoCv("t"));
    expect(p.totalDeEtapas).toBe(ETAPAS.filter((e) => e.contaNoProgresso).length);
    expect(p.totalDeEtapas).toBe(6);
  });

  it("sobe conforme as etapas são preenchidas", () => {
    const vazio = calcularProgresso("pessoal", novoCv("t"));
    const comPessoal = calcularProgresso("pessoal", cvComPessoal());
    const comObjetivo = calcularProgresso("objetivo", cvCompletoObrigatorio());

    expect(comPessoal.percentual).toBeGreaterThan(vazio.percentual);
    expect(comObjetivo.percentual).toBeGreaterThan(comPessoal.percentual);
  });

  it("chega a 100 com tudo preenchido", () => {
    const cv: CvData = {
      ...cvCompletoObrigatorio(),
      experiencias: [novaExperiencia({ cargo: "Dev", empresa: "Acme" })],
      formacao: [
        {
          id: "f1",
          curso: "CC",
          instituicao: "UFMG",
          nivel: "graduacao",
          status: "concluido",
          periodo: { inicio: { ano: 2015, mes: 2 }, fim: { ano: 2018, mes: 12 } },
        },
      ],
      idiomas: [novoIdioma({ idioma: "Inglês", nivel: "avancado" })],
      habilidades: { textoOriginal: "python, sql", itens: [], statusIa: "none" },
    };

    expect(calcularProgresso("preview", cv).percentual).toBe(100);
  });

  it("informa a posição de forma legível", () => {
    const p = calcularProgresso("objetivo", cvComPessoal());
    expect(p.posicaoAtual).toBe(2);
    expect(p.rotuloAtual).toBe("Objetivo");
  });
});

describe("pular para uma etapa", () => {
  it("voltar para trás é sempre possível", () => {
    expect(podeIrPara("pessoal", "habilidades", novoCv("t"))).toBe(true);
  });

  it("pular para frente exige o caminho válido", () => {
    // Sem dados pessoais, ir direto ao preview geraria currículo sem nome.
    expect(podeIrPara("preview", "pessoal", novoCv("t"))).toBe(false);
  });

  it("pula por cima de etapas opcionais vazias", () => {
    expect(podeIrPara("habilidades", "experiencias", cvCompletoObrigatorio())).toBe(true);
  });
});

describe("pronto para gerar", () => {
  it("lista o que falta", () => {
    const r = prontoParaGerar(novoCv("t"));
    expect(r.pronto).toBe(false);
    expect(r.pendencias.length).toBeGreaterThan(0);
  });

  it("aprova com só o obrigatório preenchido", () => {
    // Currículo sem experiência, sem idioma e sem habilidade é válido: é o
    // currículo de quem está começando.
    expect(prontoParaGerar(cvCompletoObrigatorio()).pronto).toBe(true);
  });
});
