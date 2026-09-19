import { describe, it, expect } from "vitest";
import {
  campo,
  parseFieldId,
  resolverCampo,
  novoCv,
  novaExperiencia,
  novoIdioma,
} from "../index.js";

describe("construtores de FieldId", () => {
  it("monta o caminho a partir do id estável do item", () => {
    expect(campo.experiencia("abc123", "cargo")).toBe("experiencias.abc123.cargo");
    expect(campo.pessoal("nome")).toBe("pessoal.nome");
    expect(campo.objetivo()).toBe("objetivo");
    expect(campo.habilidades()).toBe("habilidades");
  });

  it("recusa id que contenha o separador — deixaria o caminho ambíguo", () => {
    expect(() => campo.experiencia("abc.123", "cargo")).toThrow(/não pode/i);
    expect(() => campo.experiencia("", "cargo")).toThrow();
  });
});

describe("parseFieldId", () => {
  it("faz a volta completa: constrói e reinterpreta", () => {
    const id = campo.experiencia("xYz789", "empresa");
    expect(parseFieldId(id)).toEqual({
      secao: "experiencias",
      itemId: "xYz789",
      campo: "empresa",
    });
  });

  it("reconhece as seções sem item", () => {
    expect(parseFieldId("objetivo")).toEqual({ secao: "objetivo" });
    expect(parseFieldId("habilidades")).toEqual({ secao: "habilidades" });
  });

  it("devolve null para entrada inválida em vez de lançar", () => {
    // Entradas vindas do .aux do LaTeX ou de cliques no navegador. Uma
    // entrada obsoleta é situação esperada, não defeito.
    expect(parseFieldId("")).toBeNull();
    expect(parseFieldId("secaoInexistente.abc.cargo")).toBeNull();
    expect(parseFieldId("experiencias.abc.campoInexistente")).toBeNull();
    expect(parseFieldId("pessoal.senha")).toBeNull();
    expect(parseFieldId("experiencias..cargo")).toBeNull();
    expect(parseFieldId("experiencias.abc")).toBeNull();
    expect(parseFieldId("objetivo.extra")).toBeNull();
  });

  it("não aceita 'idade' como campo pessoal endereçável", () => {
    // A idade é coletada mas não renderizada na V1, logo não tem região
    // clicável no PDF.
    expect(parseFieldId("pessoal.idade")).toBeNull();
  });
});

describe("resolverCampo", () => {
  const exp = novaExperiencia({
    cargo: "Desenvolvedora Backend",
    empresa: "Acme",
    descricaoOriginal: "trabalhei com apis",
  });
  const idioma = novoIdioma({ idioma: "Inglês", nivel: "avancado" });

  const cv = {
    ...novoCv("cv-1"),
    pessoal: {
      nome: "Ana Conceição",
      cidade: "Belo Horizonte",
      email: "ana@exemplo.com",
    },
    objetivo: { texto: "Atuar com backend" },
    experiencias: [exp],
    idiomas: [idioma],
  };

  it("resolve campos de todas as seções", () => {
    expect(resolverCampo(cv, parseFieldId(campo.pessoal("nome"))!)).toBe(
      "Ana Conceição",
    );
    expect(resolverCampo(cv, parseFieldId(campo.objetivo())!)).toBe(
      "Atuar com backend",
    );
    expect(
      resolverCampo(cv, parseFieldId(campo.experiencia(exp.id, "cargo"))!),
    ).toBe("Desenvolvedora Backend");
    expect(
      resolverCampo(cv, parseFieldId(campo.idioma(idioma.id, "nivel"))!),
    ).toBe("avancado");
  });

  it("devolve undefined quando o item já não existe", () => {
    // O usuário pode apagar a experiência entre a compilação e o clique.
    const ref = parseFieldId(campo.experiencia("id-que-sumiu", "cargo"))!;
    expect(resolverCampo(cv, ref)).toBeUndefined();
  });

  /**
   * Este é o teste que justifica a divergência do planejamento (campo.ts).
   * Com endereçamento por índice, apagar um item faria o identificador antigo
   * resolver silenciosamente para OUTRO item — o clique abriria o editor
   * errado, sem erro nenhum. Com id estável, ele simplesmente não resolve.
   */
  it("não aponta para o item errado após remoção de outro item", () => {
    const primeira = novaExperiencia({ cargo: "Primeira", empresa: "A" });
    const segunda = novaExperiencia({ cargo: "Segunda", empresa: "B" });
    const antes = { ...cv, experiencias: [primeira, segunda] };

    const refSegunda = parseFieldId(campo.experiencia(segunda.id, "cargo"))!;
    expect(resolverCampo(antes, refSegunda)).toBe("Segunda");

    // Usuário apaga a PRIMEIRA experiência. A segunda passa a ser o índice 0.
    const depois = { ...antes, experiencias: [segunda] };

    // O identificador continua apontando para a mesma experiência.
    expect(resolverCampo(depois, refSegunda)).toBe("Segunda");

    // E o identificador da que foi apagada não resolve para nada.
    const refPrimeira = parseFieldId(campo.experiencia(primeira.id, "cargo"))!;
    expect(resolverCampo(depois, refPrimeira)).toBeUndefined();
  });
});
