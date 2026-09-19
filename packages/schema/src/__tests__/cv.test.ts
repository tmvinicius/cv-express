import { describe, it, expect } from "vitest";
import {
  cvDataSchema,
  validarCv,
  experienciaSchema,
  dadosPessoaisSchema,
  LIMITES,
  novoCv,
  novaExperiencia,
  novoId,
} from "../index.js";

/** Currículo completo e válido, usado como base dos testes. */
function cvValido() {
  const cv = novoCv("cv-teste");
  return {
    ...cv,
    pessoal: {
      nome: "Ana Gonçalves de Assunção",
      cidade: "Belo Horizonte",
      email: "ana@exemplo.com.br",
    },
    experiencias: [
      novaExperiencia({
        cargo: "Desenvolvedora Backend",
        empresa: "Acme",
        periodo: { inicio: { ano: 2021, mes: 3 }, fim: { ano: 2024, mes: 6 } },
        descricaoOriginal: "cuidei das apis e do banco",
      }),
    ],
  };
}

describe("cvDataSchema", () => {
  it("aceita um currículo completo", () => {
    expect(cvDataSchema.safeParse(cvValido()).success).toBe(true);
  });

  it("preenche os padrões de locale, template e statusIa", () => {
    const base = cvValido();
    const semPadroes = {
      ...base,
      locale: undefined,
      templateId: undefined,
    };
    const r = cvDataSchema.parse(semPadroes);
    expect(r.locale).toBe("pt-BR");
    expect(r.templateId).toBe("classico");
    expect(r.experiencias[0]?.statusIa).toBe("none");
  });

  it("rejeita e-mail malformado", () => {
    const r = dadosPessoaisSchema.safeParse({
      nome: "Ana",
      cidade: "BH",
      email: "ana@",
    });
    expect(r.success).toBe(false);
  });

  it("normaliza e-mail para minúsculas", () => {
    const r = dadosPessoaisSchema.parse({
      nome: "Ana",
      cidade: "BH",
      email: "  Ana@Exemplo.COM  ",
    });
    expect(r.email).toBe("ana@exemplo.com");
  });

  it("converte campo opcional vazio em undefined, para não sujar o PDF", () => {
    const r = dadosPessoaisSchema.parse({
      nome: "Ana",
      cidade: "BH",
      email: "ana@exemplo.com",
      telefone: "   ",
    });
    expect(r.telefone).toBeUndefined();
  });

  it("preserva acentuação sem alteração", () => {
    const nome = "João Conceição d'Ávila Küper";
    const r = dadosPessoaisSchema.parse({
      nome,
      cidade: "São Paulo",
      email: "joao@exemplo.com",
    });
    expect(r.nome).toBe(nome);
  });
});

describe("limites técnicos — a borda de segurança", () => {
  it("rejeita descrição acima do teto", () => {
    const r = experienciaSchema.safeParse({
      ...novaExperiencia({ cargo: "Dev", empresa: "Acme" }),
      descricaoOriginal: "a".repeat(LIMITES.DESCRICAO_MAX + 1),
    });
    expect(r.success).toBe(false);
  });

  it("aceita descrição exatamente no teto", () => {
    const r = experienciaSchema.safeParse({
      ...novaExperiencia({ cargo: "Dev", empresa: "Acme" }),
      descricaoOriginal: "a".repeat(LIMITES.DESCRICAO_MAX),
    });
    expect(r.success).toBe(true);
  });

  it("rejeita mais experiências do que o teto", () => {
    const cv = {
      ...cvValido(),
      experiencias: Array.from({ length: LIMITES.ITENS_MAX.experiencias + 1 }, () =>
        novaExperiencia({ cargo: "Dev", empresa: "Acme" }),
      ),
    };
    expect(cvDataSchema.safeParse(cv).success).toBe(false);
  });

  it("rejeita documento acima do teto de bytes, mesmo com campos válidos", () => {
    // Cada experiência é individualmente válida; a soma é que estoura.
    // É exatamente o buraco que o teto de bytes existe para tapar.
    const cv = {
      ...cvValido(),
      experiencias: Array.from({ length: 50 }, () =>
        novaExperiencia({
          cargo: "Desenvolvedora",
          empresa: "Acme",
          descricaoOriginal: "a".repeat(LIMITES.DESCRICAO_MAX),
        }),
      ),
    };

    // Passa no schema campo a campo...
    expect(cvDataSchema.safeParse(cv).success).toBe(true);
    // ...mas não na validação completa da borda.
    const r = validarCv(cv);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toContain("acima do limite");
    }
  });
});

describe("imutabilidade do texto original", () => {
  it("mantém descricaoOriginal intacta ao aplicar bullets da IA", () => {
    const original = "cuidei das apis, mexi no banco e ajudei o time";
    const exp = novaExperiencia({
      cargo: "Dev",
      empresa: "Acme",
      descricaoOriginal: original,
    });

    // Como a camada de IA aplicará a sugestão: escreve em bullets, nunca por cima.
    const polida = {
      ...exp,
      bullets: [
        "Desenvolvi e mantive APIs REST",
        "Administrei o banco de dados da aplicação",
      ],
      statusIa: "applied" as const,
    };

    const r = experienciaSchema.parse(polida);
    expect(r.descricaoOriginal).toBe(original);
    expect(r.bullets).toHaveLength(2);
  });
});

describe("novoCv", () => {
  it("cria um rascunho com as listas vazias", () => {
    const cv = novoCv();
    expect(cv.experiencias).toEqual([]);
    expect(cv.habilidades.itens).toEqual([]);
    expect(cv.locale).toBe("pt-BR");
  });

  it("não passa na validação completa — rascunho incompleto é estado legítimo", () => {
    // Documenta a decisão: o autosave grava rascunho; só a compilação exige
    // documento inteiro.
    expect(validarCv(novoCv()).success).toBe(false);
  });

  it("gera ids distintos", () => {
    const ids = new Set(Array.from({ length: 500 }, () => novoId()));
    expect(ids.size).toBe(500);
  });
});
