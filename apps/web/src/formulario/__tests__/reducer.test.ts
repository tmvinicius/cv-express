import { describe, it, expect } from "vitest";
import { novoCv, novaExperiencia, type CvData } from "@cv-express/schema";
import { reduzir } from "../reducer";

function base(): CvData {
  return novoCv("teste");
}

function comExperiencia(descricao = "cuidei das apis"): CvData {
  return {
    ...base(),
    experiencias: [
      novaExperiencia({
        id: "e1",
        cargo: "Dev",
        empresa: "Acme",
        descricaoOriginal: descricao,
      }),
    ],
  };
}

describe("imutabilidade", () => {
  it("nunca muta o currículo recebido", () => {
    const cv = comExperiencia();
    const copia = structuredClone(cv);

    reduzir(cv, { tipo: "pessoal", campo: "nome", valor: "Ana" });
    reduzir(cv, { tipo: "exp:adicionar" });
    reduzir(cv, { tipo: "exp:remover", id: "e1" });

    expect(cv).toEqual(copia);
  });
});

describe("a IA nunca sobrescreve o texto original", () => {
  /**
   * A invariante central do produto. Se ela cair, a promessa de que "a IA
   * organiza o que você escreveu e não acrescenta nada" deixa de ser
   * verificável — não haveria mais com o que comparar.
   */
  it("aplicar a sugestão preserva descricaoOriginal", () => {
    const original = "cuidei das apis e do banco";
    const cv = comExperiencia(original);

    const depois = reduzir(cv, {
      tipo: "exp:aplicarIa",
      id: "e1",
      bullets: ["Desenvolvi APIs REST", "Administrei o banco de dados"],
    });

    expect(depois.experiencias[0]?.descricaoOriginal).toBe(original);
    expect(depois.experiencias[0]?.bullets).toHaveLength(2);
    expect(depois.experiencias[0]?.statusIa).toBe("applied");
  });

  it("recusar a sugestão também preserva", () => {
    const original = "cuidei das apis";
    const cv = comExperiencia(original);

    const depois = reduzir(cv, { tipo: "exp:recusarIa", id: "e1" });

    expect(depois.experiencias[0]?.descricaoOriginal).toBe(original);
    expect(depois.experiencias[0]?.bullets).toEqual([]);
    expect(depois.experiencias[0]?.statusIa).toBe("rejected");
  });

  it("o mesmo vale para habilidades", () => {
    const cv: CvData = {
      ...base(),
      habilidades: { textoOriginal: "python, sql", itens: [], statusIa: "none" },
    };

    const depois = reduzir(cv, {
      tipo: "hab:aplicarIa",
      itens: [{ id: "h1", nome: "Python", categoria: "tecnica" }],
    });

    expect(depois.habilidades.textoOriginal).toBe("python, sql");
  });
});

describe("editar o texto invalida a sugestão anterior", () => {
  /**
   * Sem isto, a pessoa reescreve a descrição e o PDF continua saindo com os
   * bullets do texto ANTIGO. É um defeito silencioso: nada dá erro, e ela só
   * descobre lendo o PDF pronto — se descobrir.
   */
  it("mexer na descrição limpa os bullets", () => {
    const cv = reduzir(comExperiencia(), {
      tipo: "exp:aplicarIa",
      id: "e1",
      bullets: ["Desenvolvi APIs"],
    });
    expect(cv.experiencias[0]?.bullets).toHaveLength(1);

    const depois = reduzir(cv, {
      tipo: "exp:campo",
      id: "e1",
      campo: "descricaoOriginal",
      valor: "agora eu cuidava de outra coisa",
    });

    expect(depois.experiencias[0]?.bullets).toEqual([]);
    expect(depois.experiencias[0]?.statusIa).toBe("none");
  });

  it("mexer no cargo NÃO limpa os bullets", () => {
    // Corrigir a grafia do cargo não invalida a descrição.
    const cv = reduzir(comExperiencia(), {
      tipo: "exp:aplicarIa",
      id: "e1",
      bullets: ["Desenvolvi APIs"],
    });

    const depois = reduzir(cv, {
      tipo: "exp:campo",
      id: "e1",
      campo: "cargo",
      valor: "Desenvolvedor",
    });

    expect(depois.experiencias[0]?.bullets).toHaveLength(1);
  });

  it("mexer no texto de habilidades limpa os itens", () => {
    const cv = reduzir(
      { ...base(), habilidades: { textoOriginal: "python", itens: [], statusIa: "none" } },
      { tipo: "hab:aplicarIa", itens: [{ id: "h1", nome: "Python", categoria: "tecnica" }] },
    );

    const depois = reduzir(cv, { tipo: "hab:texto", valor: "python, sql" });

    expect(depois.habilidades.itens).toEqual([]);
    expect(depois.habilidades.statusIa).toBe("none");
  });
});

describe("listas", () => {
  it("adiciona ao fim, preservando o que existe", () => {
    const cv = reduzir(comExperiencia(), { tipo: "exp:adicionar" });

    expect(cv.experiencias).toHaveLength(2);
    expect(cv.experiencias[0]?.id).toBe("e1");
  });

  it("cada item novo tem id próprio", () => {
    let cv = base();
    for (let i = 0; i < 5; i++) cv = reduzir(cv, { tipo: "exp:adicionar" });

    const ids = new Set(cv.experiencias.map((e) => e.id));
    expect(ids.size).toBe(5);
  });

  it("remove só o item pedido", () => {
    let cv = comExperiencia();
    cv = reduzir(cv, { tipo: "exp:adicionar" });
    const outroId = cv.experiencias[1]!.id;

    const depois = reduzir(cv, { tipo: "exp:remover", id: "e1" });

    expect(depois.experiencias).toHaveLength(1);
    expect(depois.experiencias[0]?.id).toBe(outroId);
  });

  it("remover id inexistente não faz nada", () => {
    const cv = comExperiencia();
    expect(reduzir(cv, { tipo: "exp:remover", id: "nao-existe" }).experiencias).toHaveLength(1);
  });

  it("edita o item certo quando há vários", () => {
    let cv = comExperiencia();
    cv = reduzir(cv, { tipo: "exp:adicionar" });
    const segundoId = cv.experiencias[1]!.id;

    const depois = reduzir(cv, {
      tipo: "exp:campo",
      id: segundoId,
      campo: "cargo",
      valor: "Estagiário",
    });

    expect(depois.experiencias[0]?.cargo).toBe("Dev");
    expect(depois.experiencias[1]?.cargo).toBe("Estagiário");
  });
});

describe("período", () => {
  it("muda só o início, preservando o fim", () => {
    const cv = comExperiencia();
    const fimOriginal = cv.experiencias[0]!.periodo.fim;

    const depois = reduzir(cv, {
      tipo: "exp:periodo",
      id: "e1",
      inicio: { ano: 2020, mes: 3 },
    });

    expect(depois.experiencias[0]?.periodo.inicio).toEqual({ ano: 2020, mes: 3 });
    expect(depois.experiencias[0]?.periodo.fim).toBe(fimOriginal);
  });

  it("aceita 'atual' como fim", () => {
    const depois = reduzir(comExperiencia(), {
      tipo: "exp:periodo",
      id: "e1",
      fim: "atual",
    });
    expect(depois.experiencias[0]?.periodo.fim).toBe("atual");
  });
});

describe("edição de bullet", () => {
  it("altera só o índice pedido", () => {
    const cv = reduzir(comExperiencia(), {
      tipo: "exp:aplicarIa",
      id: "e1",
      bullets: ["Primeiro", "Segundo", "Terceiro"],
    });

    const depois = reduzir(cv, {
      tipo: "exp:editarBullet",
      id: "e1",
      indice: 1,
      valor: "Segundo, corrigido",
    });

    expect(depois.experiencias[0]?.bullets).toEqual([
      "Primeiro",
      "Segundo, corrigido",
      "Terceiro",
    ]);
  });
});
