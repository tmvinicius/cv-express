import { describe, it, expect } from "vitest";
import {
  verificarExpansao,
  verificarNumerosInventados,
  verificarHabilidadesInventadas,
  verificarExperiencia,
} from "../guardrails.js";

describe("teto de expansão", () => {
  it("aceita reescrita de tamanho parecido", () => {
    const original = "cuidei das apis e do banco de dados da aplicação principal";
    const produzido =
      "Desenvolvi e mantive as APIs da aplicação. Administrei o banco de dados.";
    expect(verificarExpansao(original, produzido)).toBeNull();
  });

  it("recusa quando o modelo passou a escrever em vez de organizar", () => {
    const original = "cuidei das apis";
    const produzido = "Lorem ipsum dolor sit amet. ".repeat(40);
    expect(verificarExpansao(original, produzido)?.regra).toBe("expansao");
  });

  it("tem piso para textos curtos", () => {
    // 1,5x de 15 caracteres seriam 22 — apertado demais para virar bullet
    // com verbo de ação. O piso evita reprovar organização legítima.
    const original = "mexi com vendas";
    const produzido = "Atuei na área de vendas, com atendimento a clientes.";
    expect(verificarExpansao(original, produzido)).toBeNull();
  });
});

describe("números inventados — a invenção que mais machuca", () => {
  it("aceita números que estavam no original", () => {
    const original = "atendi 50 clientes e reduzi custo em 20%";
    const produzido = "Atendi 50 clientes. Reduzi custos em 20%.";
    expect(verificarNumerosInventados(original, produzido)).toBeNull();
  });

  it("recusa métrica que o usuário nunca escreveu", () => {
    // O caso que o guardrail existe para impedir: a pessoa vai ter de
    // sustentar numa entrevista um número que não escreveu.
    const original = "trabalhei com vendas";
    const produzido = "Aumentei as vendas em 40%.";
    const v = verificarNumerosInventados(original, produzido);
    expect(v?.regra).toBe("numero_inventado");
    expect(v?.mensagem).toContain("40");
  });

  it("ignora diferença de formatação numérica", () => {
    // "1.500" e "1500" são o mesmo número; acusar isso seria falso positivo.
    expect(verificarNumerosInventados("vendi 1500 unidades", "Vendi 1.500 unidades.")).toBeNull();
    expect(verificarNumerosInventados("meta de 1.000", "Meta de 1000.")).toBeNull();
  });

  it("aceita saída sem número nenhum", () => {
    expect(verificarNumerosInventados("gerenciei o time", "Gerenciei o time.")).toBeNull();
  });
});

describe("habilidades inventadas", () => {
  it("aceita normalização de grafia e capitalização", () => {
    // É exatamente o trabalho legítimo da IA aqui.
    const original = "python, sql, docker, trabalho em equipe";
    expect(
      verificarHabilidadesInventadas(original, [
        { nome: "Python" },
        { nome: "SQL" },
        { nome: "Docker" },
        { nome: "Trabalho em Equipe" },
      ]),
    ).toBeNull();
  });

  it("aceita diferença de acentuação", () => {
    expect(
      verificarHabilidadesInventadas("analise de dados, gestao", [
        { nome: "Análise de Dados" },
        { nome: "Gestão" },
      ]),
    ).toBeNull();
  });

  it("recusa habilidade inferida mas não informada", () => {
    // Inferência plausível continua sendo mentira: quem citou Kubernetes
    // não necessariamente sabe Docker.
    const v = verificarHabilidadesInventadas("kubernetes", [
      { nome: "Kubernetes" },
      { nome: "Docker" },
    ]);
    expect(v?.regra).toBe("habilidade_inventada");
    expect(v?.mensagem).toContain("Docker");
  });

  it("recusa habilidade que o modelo achou que combinaria", () => {
    const v = verificarHabilidadesInventadas("python, sql", [
      { nome: "Python" },
      { nome: "SQL" },
      { nome: "Pandas" },
    ]);
    expect(v?.mensagem).toContain("Pandas");
  });

  it("aceita lista vazia", () => {
    expect(verificarHabilidadesInventadas("qualquer coisa", [])).toBeNull();
  });
});

describe("verificarExperiencia", () => {
  it("reprova bullets vazios", () => {
    expect(verificarExperiencia("algum texto", [])?.regra).toBe("vazio");
  });

  it("aprova organização fiel", () => {
    const original = "cuidei das apis, mexi no banco e ajudei o time";
    expect(
      verificarExperiencia(original, [
        "Desenvolvi e mantive APIs",
        "Administrei o banco de dados",
        "Apoiei o time no dia a dia",
      ]),
    ).toBeNull();
  });

  it("reprova quando qualquer regra falha", () => {
    expect(
      verificarExperiencia("cuidei das apis", ["Reduzi a latência em 80%"]),
    ).not.toBeNull();
  });
});
