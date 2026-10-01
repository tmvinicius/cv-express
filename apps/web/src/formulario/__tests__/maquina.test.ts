import { describe, it, expect } from "vitest";
import {
  novoCv,
  novaExperiencia,
  novoIdioma,
  type CvData,
} from "@cv-express/schema";

import { ETAPAS, etapaPorId, etapaDoCampo, ehIdEtapa, etapaDaUrl } from "../etapas";
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
    // "pessoal" é a primeira etapa: não há "boas-vindas" atrás dela. Enquanto
    // havia, este null vinha de uma etapa sem tela, e o botão Voltar de
    // "pessoal" levava a um beco sem saída.
    expect(voltar("pessoal")).toBeNull();
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

  it("do preview volta ao preenchimento, pulando 'gerando'", () => {
    // "gerando" compila e avança sozinha para o preview. Se Voltar levasse
    // para ela, a pessoa seria devolvida ao preview no instante seguinte —
    // um botão que não sai do lugar.
    expect(voltar("preview")).toBe("habilidades");
    expect(voltar("gerando")).toBe("habilidades");
  });
});

describe("etapa vinda da URL", () => {
  /**
   * `?etapa=` é texto livre. Sem esta validação, um valor desconhecido
   * chegava a `podeIrPara`, que lia `ETAPAS[-1].validar` e derrubava a
   * página com erro 500 — e o caso mais provável é um link antigo para
   * "boas-vindas", etapa que existiu e foi removida.
   */
  it("reconhece só as etapas que existem", () => {
    for (const e of ETAPAS) expect(ehIdEtapa(e.id)).toBe(true);
    expect(ehIdEtapa("boas-vindas")).toBe(false);
    expect(ehIdEtapa("")).toBe(false);
    expect(ehIdEtapa(undefined)).toBe(false);
    expect(ehIdEtapa("constructor")).toBe(false);
  });

  it("cai na primeira etapa quando o valor não vale", () => {
    expect(etapaDaUrl(undefined)).toBe("pessoal");
    expect(etapaDaUrl("boas-vindas")).toBe("pessoal");
    expect(etapaDaUrl("../../etc")).toBe("pessoal");
    expect(etapaDaUrl("formacao")).toBe("formacao");
  });

  it("o progresso calculado a partir dela nunca quebra", () => {
    // O defeito original: calcularProgresso com etapa desconhecida lançava
    // TypeError no meio do render.
    expect(() => calcularProgresso(etapaDaUrl("boas-vindas"), novoCv("t"))).not.toThrow();
  });
});

describe("progresso", () => {
  it("começa em zero num currículo em branco", () => {
    const p = calcularProgresso("pessoal", novoCv("t"));
    expect(p.percentual).toBe(0);
    expect(p.etapasConcluidas).toBe(0);
  });

  it("não conta gerando e preview", () => {
    // Incluí-las faria a barra chegar a 100% antes de a pessoa terminar —
    // animador e falso.
    const p = calcularProgresso("pessoal", novoCv("t"));
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

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  O CRITÉRIO ÚNICO                                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * O defeito relatado: a barra media etapas preenchidas, o contador media
 * posição na fila, e os dois apareciam lado a lado se contradizendo — 0% ao
 * lado de "Etapa 1 de 6". Estes testes fixam UM critério e provam que os dois
 * indicadores saem do mesmo lugar.
 */
describe("progresso como fonte única", () => {
  it("fora das seis etapas de preenchimento, não há posição a anunciar", () => {
    // Era aqui que a contradição aparecia primeiro: "Etapa 1 de 6" fora das
    // etapas de preenchimento.
    expect(calcularProgresso("gerando", novoCv("t")).naTrilha).toBe(false);
    expect(calcularProgresso("preview", novoCv("t")).naTrilha).toBe(false);
    expect(calcularProgresso("pessoal", novoCv("t")).naTrilha).toBe(true);
  });

  it("descreve as seis etapas, em ordem, com rótulo", () => {
    const p = calcularProgresso("pessoal", novoCv("t"));

    expect(p.etapas).toHaveLength(6);
    expect(p.etapas.map((e) => e.id)).toEqual([
      "pessoal",
      "objetivo",
      "experiencias",
      "formacao",
      "idiomas",
      "habilidades",
    ]);
    expect(p.etapas[0]?.posicao).toBe(1);
    expect(p.etapas[0]?.rotulo).toBe("Seus dados");
  });

  it("a barra é a contagem de resolvidas — nunca outro número", () => {
    const cv = cvCompletoObrigatorio();
    const p = calcularProgresso("experiencias", cv);

    const resolvidas = p.etapas.filter((e) => e.estado !== "pendente").length;
    expect(p.resolvidas).toBe(resolvidas);
    expect(p.percentual).toBe(Math.round((resolvidas / p.totalDeEtapas) * 100));
  });

  it("etapa opcional deixada para trás conta como resolvida, não como pendência", () => {
    /**
     * Quem está no primeiro emprego pula experiências de propósito. Contar
     * isso como pendência para sempre travaria a barra em 33% até o fim do
     * formulário — e transformaria o produto num boletim de quem não tem
     * experiência.
     */
    const p = calcularProgresso("habilidades", cvCompletoObrigatorio());
    const experiencias = p.etapas.find((e) => e.id === "experiencias");

    expect(experiencias?.estado).toBe("pulada");
    expect(p.resolvidas).toBe(5); // pessoal, objetivo + 3 opcionais puladas
    expect(p.etapasConcluidas).toBe(2); // preenchidas de verdade: só duas
  });

  it("opcional ainda não visitada fica pendente, não pulada", () => {
    // Pular é decisão de quem passou por ali. Antes disso é só o que falta.
    const p = calcularProgresso("objetivo", cvCompletoObrigatorio());
    expect(p.etapas.find((e) => e.id === "experiencias")?.estado).toBe("pendente");
  });

  it("preenchida com dado inválido NÃO conta como concluída", () => {
    /**
     * Uma experiência com período invertido é justamente o dado que o
     * `salvarEtapa` recusa gravar. Se a barra andasse com ela, o indicador
     * comemoraria um avanço que o banco não registrou.
     */
    const cv: CvData = {
      ...cvCompletoObrigatorio(),
      experiencias: [
        novaExperiencia({
          cargo: "Dev",
          empresa: "Acme",
          periodo: { inicio: { ano: 2024, mes: 6 }, fim: { ano: 2020, mes: 1 } },
        }),
      ],
    };

    const p = calcularProgresso("formacao", cv);
    expect(p.etapas.find((e) => e.id === "experiencias")?.estado).toBe("pendente");
  });

  it("marca uma única etapa como atual, e ela pode estar concluída", () => {
    const p = calcularProgresso("pessoal", cvComPessoal());
    const atuais = p.etapas.filter((e) => e.atual);

    expect(atuais).toHaveLength(1);
    expect(atuais[0]?.id).toBe("pessoal");
    // Estar em cima de uma etapa pronta não a "despronta": são duas
    // informações diferentes, e a trilha mostra as duas.
    expect(atuais[0]?.estado).toBe("concluida");
  });

  it("acessibilidade de cada etapa é a mesma resposta de podeIrPara", () => {
    // A trilha desenha botão só onde `podeIrPara` autoriza; se divergisse,
    // voltaria a existir clique que não faz nada.
    const cv = cvCompletoObrigatorio();
    for (const etapa of calcularProgresso("formacao", cv).etapas) {
      expect(etapa.acessivel).toBe(podeIrPara(etapa.id, "formacao", cv));
    }
  });

  it("sem os dados obrigatórios, as etapas adiante não são alcançáveis", () => {
    const p = calcularProgresso("pessoal", novoCv("t"));
    expect(p.etapas.find((e) => e.id === "pessoal")?.acessivel).toBe(true);
    expect(p.etapas.find((e) => e.id === "habilidades")?.acessivel).toBe(false);
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

describe("etapaDoCampo", () => {
  it("leva a seção do painel à etapa onde ela se edita", () => {
    expect(etapaDoCampo("pessoal")).toBe("pessoal");
    expect(etapaDoCampo("experiencias.e1")).toBe("experiencias");
    expect(etapaDoCampo("formacao.f1")).toBe("formacao");
  });

  it("aceita o fieldId completo das sugestões de corte", () => {
    expect(etapaDoCampo("experiencias.e1.cargo")).toBe("experiencias");
  });

  it("id desconhecido cai no começo do formulário, nunca num clique mudo", () => {
    expect(etapaDoCampo("inexistente")).toBe("pessoal");
    // "preview" existe em ETAPAS, mas não é onde se edita um campo.
    expect(etapaDoCampo("preview")).toBe("pessoal");
  });
});

describe("o objetivo é obrigatório de verdade", () => {
  /**
   * O defeito que estes testes impedem: `opcional: false` decorativo.
   *
   * `objetivoSchema.texto` não tem `.min(1)` — e não pode ter, porque o mesmo
   * schema valida o autosave e rascunho vazio é estado legítimo. Sem a regra
   * na etapa, `avancar` deixava passar e `prontoParaGerar` não acusava nada,
   * enquanto `preenchida` exigia texto e a barra travava abaixo de 100%. O
   * botão dizia "pode gerar" e a barra dizia "falta coisa", sobre o mesmo
   * campo.
   */
  const semObjetivo = (): CvData => ({
    ...cvComPessoal(),
    objetivo: { texto: "" },
  });

  it("não avança da etapa de objetivo com o texto vazio", () => {
    const r = avancar("objetivo", semObjetivo());
    expect(r.ok).toBe(false);
  });

  it("avança quando há texto", () => {
    const r = avancar("objetivo", {
      ...cvComPessoal(),
      objetivo: { texto: "Atuar como desenvolvedora backend." },
    });
    expect(r.ok).toBe(true);
  });

  it("prontoParaGerar acusa a falta — o botão e a barra concordam", () => {
    // Era aqui que os dois indicadores se contradiziam.
    const cv = semObjetivo();
    expect(prontoParaGerar(cv).pronto).toBe(false);
    expect(calcularProgresso("habilidades", cv).percentual).toBeLessThan(100);
  });
});
