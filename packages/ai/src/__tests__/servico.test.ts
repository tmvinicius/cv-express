import { describe, it, expect } from "vitest";
import { criarServicoIa } from "../servico.js";
import { MockAdapter } from "../adapters/mock.js";
import { AiError } from "../erros.js";
import { extrairJson } from "../json.js";

describe("extrairJson", () => {
  it("lê JSON puro", () => {
    expect(extrairJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("lê JSON dentro de cerca de markdown", () => {
    expect(extrairJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extrairJson("```\n{\"a\":1}\n```")).toEqual({ a: 1 });
  });

  it("lê JSON cercado de conversa", () => {
    expect(extrairJson('Claro! {"a":1} Espero ter ajudado.')).toEqual({ a: 1 });
  });

  it("não se perde com chaves dentro de string", () => {
    // Contagem ingênua de chaves cortaria no lugar errado.
    expect(extrairJson('{"texto":"usei { e } no código"}')).toEqual({
      texto: "usei { e } no código",
    });
  });

  it("respeita escape dentro de string", () => {
    expect(extrairJson('{"t":"aspas \\" e chave {"}')).toEqual({
      t: 'aspas " e chave {',
    });
  });

  it("devolve null para resposta truncada", () => {
    // Acontece quando o modelo bate no max_tokens.
    expect(extrairJson('{"bullets":["um","do')).toBeNull();
  });

  it("devolve null quando não há JSON", () => {
    expect(extrairJson("desculpe, não entendi")).toBeNull();
    expect(extrairJson("")).toBeNull();
  });
});

describe("nova tentativa após saída inválida", () => {
  it("tenta de novo e aceita a segunda resposta", async () => {
    const mock = new MockAdapter({
      respostas: ["não é json", '{"bullets":["Desenvolvi APIs"]}'],
    });
    const servico = criarServicoIa(mock);

    const r = await servico.polirExperiencia({
      cargo: "Dev",
      descricao: "cuidei das apis",
    });

    expect(r.ok).toBe(true);
    expect(mock.chamadas).toBe(2);
  });

  it("anexa o motivo da recusa na nova tentativa", async () => {
    // Dizer QUAL foi o erro melhora muito o acerto na segunda tentativa,
    // sobretudo com modelo menor.
    const mock = new MockAdapter({
      respostas: ["não é json", '{"bullets":["Desenvolvi APIs"]}'],
    });
    await criarServicoIa(mock).polirExperiencia({
      cargo: "Dev",
      descricao: "cuidei das apis",
    });

    expect(mock.pedidos[1]?.usuario).toContain("recusada");
  });

  it("desiste depois do limite de tentativas", async () => {
    const mock = new MockAdapter({ respostas: ["lixo"] });
    const r = await criarServicoIa(mock).polirExperiencia({
      cargo: "Dev",
      descricao: "cuidei das apis",
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erro.codigo).toBe("SAIDA_INVALIDA");
      expect(r.erro.tentavelNovamente).toBe(false);
    }
    expect(mock.chamadas).toBe(2);
  });
});

describe("guardrail acima do adapter", () => {
  it("descarta sugestão que inventou número", async () => {
    // O provider devolveu formato válido; o guardrail é que barra.
    const mock = new MockAdapter({
      respostas: ['{"bullets":["Aumentei as vendas em 40%"]}'],
    });
    const r = await criarServicoIa(mock).polirExperiencia({
      cargo: "Vendedor",
      descricao: "trabalhei com vendas",
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erro.codigo).toBe("GUARDRAIL");
      // Não vale tentar de novo: repetir tende a inventar outro número.
      expect(r.erro.tentavelNovamente).toBe(false);
      expect(r.erro.detalhe).toContain("40");
    }
  });

  it("descarta habilidade inventada", async () => {
    const mock = new MockAdapter({
      respostas: [
        '{"itens":[{"nome":"Kubernetes","categoria":"ferramenta"},{"nome":"Docker","categoria":"ferramenta"}]}',
      ],
    });
    const r = await criarServicoIa(mock).normalizarHabilidades({
      texto: "kubernetes",
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erro.codigo).toBe("GUARDRAIL");
      expect(r.erro.detalhe).toContain("Docker");
    }
  });

  it("a mensagem ao usuário não expõe detalhe técnico", async () => {
    const mock = new MockAdapter({
      respostas: ['{"bullets":["Reduzi custo em 99%"]}'],
    });
    const r = await criarServicoIa(mock).polirExperiencia({
      cargo: "Dev",
      descricao: "cuidei do sistema",
    });

    if (!r.ok) {
      expect(r.erro.message).not.toContain("99");
      expect(r.erro.detalhe).toContain("99");
    }
  });
});

describe("cota por sessão", () => {
  it("bloqueia depois do limite", async () => {
    const servico = criarServicoIa(new MockAdapter(), { chamadasPorSessao: 2 });
    const entrada = { cargo: "Dev", descricao: "cuidei das apis" };

    expect((await servico.polirExperiencia(entrada, "s1")).ok).toBe(true);
    expect((await servico.polirExperiencia(entrada, "s1")).ok).toBe(true);

    const terceira = await servico.polirExperiencia(entrada, "s1");
    expect(terceira.ok).toBe(false);
    if (!terceira.ok) expect(terceira.erro.codigo).toBe("COTA_DA_SESSAO");
  });

  it("conta por sessão, não globalmente", async () => {
    const servico = criarServicoIa(new MockAdapter(), { chamadasPorSessao: 1 });
    const entrada = { cargo: "Dev", descricao: "cuidei das apis" };

    expect((await servico.polirExperiencia(entrada, "s1")).ok).toBe(true);
    expect((await servico.polirExperiencia(entrada, "s2")).ok).toBe(true);
    expect((await servico.polirExperiencia(entrada, "s1")).ok).toBe(false);
  });

  it("entrada vazia não consome cota", async () => {
    const servico = criarServicoIa(new MockAdapter(), { chamadasPorSessao: 1 });

    await servico.polirExperiencia({ cargo: "Dev", descricao: "" }, "s1");
    const depois = await servico.polirExperiencia(
      { cargo: "Dev", descricao: "cuidei das apis" },
      "s1",
    );

    expect(depois.ok).toBe(true);
  });

  it("sem sessaoId, não limita — é chamada interna", async () => {
    const servico = criarServicoIa(new MockAdapter(), { chamadasPorSessao: 1 });
    const entrada = { cargo: "Dev", descricao: "cuidei das apis" };

    expect((await servico.polirExperiencia(entrada)).ok).toBe(true);
    expect((await servico.polirExperiencia(entrada)).ok).toBe(true);
  });
});

describe("a IA nunca lança para quem chama", () => {
  /**
   * O planejamento exige que falha de IA jamais bloqueie a geração do
   * currículo. O tipo Resultado torna impossível esquecer de tratar: o
   * TypeScript obriga a olhar `ok` antes de acessar os dados.
   */
  it("falha do provider vira resultado, não exceção", async () => {
    const servico = criarServicoIa(
      new MockAdapter({ erro: new AiError("LIMITE_EXCEDIDO", "cota") }),
    );

    const r = await servico.polirExperiencia({
      cargo: "Dev",
      descricao: "cuidei das apis",
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro.tentavelNovamente).toBe(true);
  });

  it("exceção inesperada do adapter também vira resultado", async () => {
    const quebrado = {
      nome: "quebrado",
      modelo: "x",
      suporteJson: "nativo" as const,
      async gerar(): Promise<never> {
        throw new TypeError("defeito nosso");
      },
    };

    const r = await criarServicoIa(quebrado).polirExperiencia({
      cargo: "Dev",
      descricao: "cuidei das apis",
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro.codigo).toBe("INDISPONIVEL");
  });
});

describe("contabilidade de tokens", () => {
  it("soma o uso das tentativas", async () => {
    const mock = new MockAdapter({
      respostas: ["lixo", '{"bullets":["Desenvolvi APIs"]}'],
    });
    const r = await criarServicoIa(mock).polirExperiencia({
      cargo: "Dev",
      descricao: "cuidei das apis",
    });

    // Duas chamadas de 100/50 cada.
    if (r.ok) {
      expect(r.uso.entrada).toBe(200);
      expect(r.uso.saida).toBe(100);
    }
  });
});
