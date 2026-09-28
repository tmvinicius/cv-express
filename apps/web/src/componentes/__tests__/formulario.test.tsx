import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { novoCv, novaExperiencia, type CvData } from "@cv-express/schema";

import { FormularioCliente } from "../FormularioCliente";

afterEach(cleanup);

type Props = Parameters<typeof FormularioCliente>[0];

/**
 * Monta o formulário e devolve os mocks já tipados.
 *
 * Os mocks são declarados fora do objeto de props porque espalhá-los junto
 * com os overrides alarga o tipo e faz `.mock` desaparecer para o TypeScript.
 */
function montar(overrides: Partial<Props> = {}) {
  const salvar = vi.fn(async (_cv: CvData) => true);
  const aoNavegar = vi.fn();
  const pedirSugestaoExperiencia = vi.fn(async (_cv: CvData, _id: string) => [
    "Desenvolvi APIs",
  ]);
  const pedirSugestaoHabilidades = vi.fn(async (_cv: CvData) => [
    { nome: "Python", categoria: "tecnica" as const },
  ]);

  render(
    <FormularioCliente
      cvInicial={novoCv("s1")}
      etapaInicial="pessoal"
      salvar={salvar}
      aoNavegar={aoNavegar}
      pedirSugestaoExperiencia={pedirSugestaoExperiencia}
      pedirSugestaoHabilidades={pedirSugestaoHabilidades}
      {...overrides}
    />,
  );

  return { salvar, aoNavegar, pedirSugestaoExperiencia, pedirSugestaoHabilidades };
}

const cvPreenchido = (): CvData => ({
  ...novoCv("s1"),
  pessoal: { nome: "Ana Souza", cidade: "Belo Horizonte", email: "ana@exemplo.com" },
});

describe("navegação", () => {
  it("bloqueia o avanço quando a etapa obrigatória está incompleta", async () => {
    const { aoNavegar } = montar();

    await userEvent.click(screen.getByRole("button", { name: /continuar/i }));

    expect(aoNavegar).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeDefined();
  });

  it("avança quando a etapa está válida", async () => {
    const { aoNavegar } = montar({ cvInicial: cvPreenchido() });

    await userEvent.click(screen.getByRole("button", { name: /continuar/i }));

    expect(aoNavegar).toHaveBeenCalledWith("objetivo");
  });

  it("limpa os erros assim que a pessoa começa a corrigir", async () => {
    // Manter uma lista de erros que a pessoa já está corrigindo é ruído, e
    // dá a impressão de que a correção não adiantou.
    montar();

    await userEvent.click(screen.getByRole("button", { name: /continuar/i }));
    expect(screen.queryByRole("alert")).not.toBeNull();

    await userEvent.type(screen.getByLabelText(/nome completo/i), "A");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("voltar não valida nada", async () => {
    // Exigir validade para voltar prenderia a pessoa num campo que ela quer
    // revisar depois de conferir o anterior.
    const { aoNavegar } = montar({ etapaInicial: "objetivo" });

    await userEvent.click(screen.getByRole("button", { name: /^voltar$/i }));

    expect(aoNavegar).toHaveBeenCalledWith("pessoal");
  });

  it("não oferece voltar na primeira etapa", () => {
    montar({ etapaInicial: "boas-vindas" });
    expect(screen.queryByRole("button", { name: /^voltar$/i })).toBeNull();
  });

  it("o botão diz 'Pular' quando a etapa opcional está vazia", () => {
    // Quem está no primeiro emprego precisa VER que pode seguir.
    montar({ cvInicial: cvPreenchido(), etapaInicial: "experiencias" });

    expect(screen.getByRole("button", { name: /pular esta etapa/i })).toBeDefined();
  });

  it("o botão vira 'Continuar' quando a etapa opcional tem conteúdo", () => {
    montar({
      cvInicial: {
        ...cvPreenchido(),
        experiencias: [novaExperiencia({ id: "e1", cargo: "Dev", empresa: "Acme" })],
      },
      etapaInicial: "experiencias",
    });

    expect(screen.getByRole("button", { name: /continuar/i })).toBeDefined();
  });
});

describe("autosave ligado ao formulário", () => {
  it("grava o que foi digitado", async () => {
    const { salvar } = montar();

    await userEvent.type(screen.getByLabelText(/nome completo/i), "Ana");

    await waitFor(
      () => {
        expect(salvar).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );

    const ultimo = salvar.mock.calls.at(-1)?.[0] as CvData;
    expect(ultimo.pessoal.nome).toBe("Ana");
  });

  it("mostra o estado do salvamento", async () => {
    montar();
    await userEvent.type(screen.getByLabelText(/nome completo/i), "A");

    await waitFor(
      () => {
        expect(screen.getByRole("status").textContent).toBe("Salvo");
      },
      { timeout: 3000 },
    );
  });

  it("falha ao salvar não derruba o formulário", async () => {
    montar({ salvar: vi.fn(async () => false) });

    await userEvent.type(screen.getByLabelText(/nome completo/i), "A");

    await waitFor(
      () => {
        expect(screen.getByRole("status").textContent).toContain("continuam aqui na tela");
      },
      { timeout: 3000 },
    );

    // E o campo continua editável.
    expect(screen.getByLabelText(/nome completo/i)).toHaveProperty("disabled", false);
  });
});

describe("sugestão da IA no fluxo", () => {
  const comExperiencia = (): CvData => ({
    ...cvPreenchido(),
    experiencias: [
      novaExperiencia({
        id: "e1",
        cargo: "Dev",
        empresa: "Acme",
        descricaoOriginal: "cuidei das apis",
      }),
    ],
  });

  it("pede a sugestão e mostra a comparação", async () => {
    const { pedirSugestaoExperiencia } = montar({
      cvInicial: comExperiencia(),
      etapaInicial: "experiencias",
    });

    await userEvent.click(
      screen.getByRole("button", { name: /organizar com ajuda da ia/i }),
    );

    await waitFor(() => {
      expect(screen.getByText("Desenvolvi APIs")).toBeDefined();
    });

    expect(pedirSugestaoExperiencia).toHaveBeenCalled();

    // O original continua visível AO LADO da sugestão. A busca é escopada à
    // seção de comparação porque o mesmo texto também está no textarea que a
    // pessoa digitou — e é isso que se quer: ela vê os dois.
    const comparacao = screen.getByRole("region", {
      name: /comparar sua descrição com a sugestão/i,
    });
    expect(within(comparacao).getByText("cuidei das apis")).toBeDefined();
    expect(within(comparacao).getByText("Desenvolvi APIs")).toBeDefined();
  });

  it("falha da IA vira aviso, e o fluxo continua", async () => {
    // O planejamento é explícito: a IA nunca bloqueia a geração do currículo.
    montar({
      cvInicial: comExperiencia(),
      etapaInicial: "experiencias",
      pedirSugestaoExperiencia: vi.fn(async () => {
        throw new Error("provider fora do ar");
      }),
    });

    await userEvent.click(
      screen.getByRole("button", { name: /organizar com ajuda da ia/i }),
    );

    await waitFor(() => {
      expect(screen.getByText(/seu texto continua valendo/i)).toBeDefined();
    });

    // E dá para seguir em frente mesmo assim.
    expect(screen.getByRole("button", { name: /continuar/i })).toBeDefined();
  });

  it("a sugestão só entra no currículo com clique explícito", async () => {
    const { salvar } = montar({
      cvInicial: comExperiencia(),
      etapaInicial: "experiencias",
    });

    await userEvent.click(
      screen.getByRole("button", { name: /organizar com ajuda da ia/i }),
    );
    await waitFor(() => screen.getByRole("button", { name: /usar sugestão/i }));

    // Antes do clique, nada foi aplicado.
    const antes = salvar.mock.calls.at(-1)?.[0] as CvData | undefined;
    expect(antes?.experiencias[0]?.bullets ?? []).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: /usar sugestão/i }));

    await waitFor(
      () => {
        const depois = salvar.mock.calls.at(-1)?.[0] as CvData;
        expect(depois.experiencias[0]?.bullets).toEqual(["Desenvolvi APIs"]);
      },
      { timeout: 3000 },
    );
  });

  it("aplicar a sugestão preserva o texto original", async () => {
    const { salvar } = montar({
      cvInicial: comExperiencia(),
      etapaInicial: "experiencias",
    });

    await userEvent.click(
      screen.getByRole("button", { name: /organizar com ajuda da ia/i }),
    );
    await waitFor(() => screen.getByRole("button", { name: /usar sugestão/i }));
    await userEvent.click(screen.getByRole("button", { name: /usar sugestão/i }));

    await waitFor(
      () => {
        const depois = salvar.mock.calls.at(-1)?.[0] as CvData;
        expect(depois.experiencias[0]?.descricaoOriginal).toBe("cuidei das apis");
      },
      { timeout: 3000 },
    );
  });
});
