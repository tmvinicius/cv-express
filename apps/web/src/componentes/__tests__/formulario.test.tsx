import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  novoCv,
  novaExperiencia,
  type CompilarResposta,
  type CvData,
} from "@cv-express/schema";

import { FormularioCliente } from "../FormularioCliente";
import type { ResultadoIa } from "../../acoes/ia";
import type { ResultadoCompilacao } from "../../acoes/compilar";
import type { ResultadoConcluir } from "../../acoes/concluir";

afterEach(cleanup);

type Props = Parameters<typeof FormularioCliente>[0];
type HabilidadeSemId = { nome: string; categoria: "tecnica" | "comportamental" | "ferramenta" };

const RESPOSTA_PDF: CompilarResposta = {
  contentHash: "a".repeat(64),
  templateId: "classico",
  templateVersao: "1.0.0",
  pageCount: 1,
  pdf: "JVBERi0xLjUK", // "%PDF-1.5\n"
  posicoes: [],
  duracaoMs: 10,
  doCache: false,
};

/**
 * Monta o formulário e devolve os mocks já tipados.
 *
 * Os mocks são declarados fora do objeto de props porque espalhá-los junto
 * com os overrides alarga o tipo e faz `.mock` desaparecer para o TypeScript.
 */
function montar(overrides: Partial<Props> = {}) {
  const salvar = vi.fn(async (_cv: CvData) => true);
  const aoNavegar = vi.fn();
  const pedirSugestaoExperiencia = vi.fn(
    async (_cv: CvData, _id: string): Promise<ResultadoIa<string[]>> => ({
      ok: true,
      dados: ["Desenvolvi APIs"],
    }),
  );
  const pedirSugestaoHabilidades = vi.fn(
    async (_cv: CvData): Promise<ResultadoIa<HabilidadeSemId[]>> => ({
      ok: true,
      dados: [{ nome: "Python", categoria: "tecnica" }],
    }),
  );
  const concluir = vi.fn(
    async (_cv: CvData): Promise<ResultadoConcluir> => ({
      ok: true,
      envio: "novo",
      email: "ana@exemplo.com",
      expiraEm: "2026-10-08T17:30:00.000Z",
    }),
  );
  const apagarDados = vi.fn(async () => true);
  const compilar = vi.fn(
    async (_cv: CvData): Promise<ResultadoCompilacao> => ({ ok: true, resposta: RESPOSTA_PDF }),
  );

  render(
    <FormularioCliente
      cvInicial={novoCv("s1")}
      etapaInicial="pessoal"
      salvar={salvar}
      aoNavegar={aoNavegar}
      pedirSugestaoExperiencia={pedirSugestaoExperiencia}
      pedirSugestaoHabilidades={pedirSugestaoHabilidades}
      compilar={compilar}
      concluir={concluir}
      apagarDados={apagarDados}
      {...overrides}
    />,
  );

  return {
    salvar,
    aoNavegar,
    pedirSugestaoExperiencia,
    pedirSugestaoHabilidades,
    compilar,
    concluir,
    apagarDados,
  };
}

const cvPreenchido = (): CvData => ({
  ...novoCv("s1"),
  pessoal: { nome: "Ana Souza", cidade: "Belo Horizonte", email: "ana@exemplo.com" },
});

/** Dados pessoais e objetivo — o mínimo para gerar o PDF. */
const cvProntoParaGerar = (): CvData => ({
  ...cvPreenchido(),
  objetivo: { texto: "Atuar com desenvolvimento backend." },
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
    montar({ etapaInicial: "pessoal" });
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

  it("mostra a trilha das etapas e deixa voltar direto a uma delas", async () => {
    // A trilha existia com teste próprio, mas nenhuma tela a renderizava.
    const { aoNavegar } = montar({ cvInicial: cvProntoParaGerar(), etapaInicial: "formacao" });

    const trilha = screen.getByRole("navigation", { name: /etapas do formulário/i });
    await userEvent.click(within(trilha).getByRole("button", { name: /^objetivo/i }));

    expect(aoNavegar).toHaveBeenCalledWith("objetivo");
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

  const comparacao = () =>
    screen.queryByRole("region", { name: /comparar sua descrição com a sugestão/i });

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
    const secao = comparacao();
    expect(secao).not.toBeNull();
    expect(within(secao!).getByText("cuidei das apis")).toBeDefined();
    expect(within(secao!).getByText("Desenvolvi APIs")).toBeDefined();
  });

  it("falha da IA vira aviso, e o fluxo continua", async () => {
    // O planejamento é explícito: a IA nunca bloqueia a geração do currículo.
    // Aqui a Server Action LANÇA (rede caiu no caminho), o pior caso.
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

  it("o motivo da falha chega como código e vira a mensagem certa", async () => {
    // O contrato mudou para resultado com código; o formulário ainda esperava
    // exceção, e todo motivo caía na mesma frase genérica.
    montar({
      cvInicial: comExperiencia(),
      etapaInicial: "experiencias",
      pedirSugestaoExperiencia: vi.fn(
        async (): Promise<ResultadoIa<string[]>> => ({ ok: false, motivo: "GUARDRAIL" }),
      ),
    });

    await userEvent.click(
      screen.getByRole("button", { name: /organizar com ajuda da ia/i }),
    );

    await waitFor(() => {
      expect(screen.getByText(/informação que você não escreveu/i)).toBeDefined();
    });
  });

  it("não oferece 'tentar de novo' quando repetir não muda nada", async () => {
    montar({
      cvInicial: comExperiencia(),
      etapaInicial: "experiencias",
      pedirSugestaoExperiencia: vi.fn(
        async (): Promise<ResultadoIa<string[]>> => ({ ok: false, motivo: "NAO_AUTORIZADO" }),
      ),
    });

    await userEvent.click(
      screen.getByRole("button", { name: /organizar com ajuda da ia/i }),
    );
    await waitFor(() => screen.getByText(/não está liberada/i));

    expect(screen.queryByRole("button", { name: /tentar de novo/i })).toBeNull();
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

  it("'Manter o meu texto' tira a comparação da tela", async () => {
    // Antes, a decisão era gravada mas a sugestão continuava visível — o
    // botão parecia não funcionar.
    montar({ cvInicial: comExperiencia(), etapaInicial: "experiencias" });

    await userEvent.click(
      screen.getByRole("button", { name: /organizar com ajuda da ia/i }),
    );
    await waitFor(() => expect(comparacao()).not.toBeNull());

    await userEvent.click(screen.getByRole("button", { name: /manter o meu texto/i }));

    expect(comparacao()).toBeNull();
    expect(screen.getByRole("button", { name: /organizar com ajuda da ia/i })).toBeDefined();
  });

  it("editar a descrição descarta a sugestão do texto antigo", async () => {
    /**
     * O defeito que isto impede: a sugestão pendente sobrevivia à edição, e
     * "Usar sugestão" gravava tópicos gerados a partir de um texto que a
     * pessoa já tinha reescrito. O redutor limpa os bullets quando a
     * descrição muda justamente para isso não acontecer — a sugestão
     * pendente passava por fora dele.
     */
    const { salvar } = montar({ cvInicial: comExperiencia(), etapaInicial: "experiencias" });

    await userEvent.click(
      screen.getByRole("button", { name: /organizar com ajuda da ia/i }),
    );
    await waitFor(() => expect(comparacao()).not.toBeNull());

    await userEvent.type(screen.getByLabelText(/o que você fazia lá/i), " e do banco");

    expect(comparacao()).toBeNull();
    expect(screen.queryByRole("button", { name: /usar sugestão/i })).toBeNull();

    await waitFor(
      () => {
        const ultimo = salvar.mock.calls.at(-1)?.[0] as CvData;
        expect(ultimo.experiencias[0]?.descricaoOriginal).toBe("cuidei das apis e do banco");
        expect(ultimo.experiencias[0]?.bullets).toEqual([]);
      },
      { timeout: 3000 },
    );
  });

  it("resposta que chega depois de a pessoa editar o texto é ignorada", async () => {
    let responder: (r: ResultadoIa<string[]>) => void = () => {};
    montar({
      cvInicial: comExperiencia(),
      etapaInicial: "experiencias",
      pedirSugestaoExperiencia: vi.fn(
        () => new Promise<ResultadoIa<string[]>>((r) => (responder = r)),
      ),
    });

    await userEvent.click(
      screen.getByRole("button", { name: /organizar com ajuda da ia/i }),
    );
    // Enquanto a IA pensa, a pessoa reescreve o texto.
    await userEvent.type(screen.getByLabelText(/o que você fazia lá/i), " e do banco");

    responder({ ok: true, dados: ["Tópico do texto antigo"] });

    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("Tópico do texto antigo")).toBeNull();
  });

  it("habilidades: 'Manter o meu texto' volta ao estado inicial", async () => {
    montar({
      cvInicial: {
        ...cvPreenchido(),
        habilidades: { textoOriginal: "python", itens: [], statusIa: "none" },
      },
      etapaInicial: "habilidades",
    });

    await userEvent.click(
      screen.getByRole("button", { name: /organizar com ajuda da ia/i }),
    );
    await waitFor(() => screen.getByRole("button", { name: /usar sugestão/i }));

    await userEvent.click(screen.getByRole("button", { name: /manter o meu texto/i }));

    expect(screen.queryByRole("button", { name: /usar sugestão/i })).toBeNull();
  });
});

describe("o fim do fluxo entrega o PDF", () => {
  /**
   * Até esta correção, nenhuma tela renderizava "gerando" nem "preview":
   * Preview, AvisoPaginas, PainelSecoes e a compilação existiam, com teste,
   * e ninguém os usava. Quem terminava o formulário não recebia currículo.
   */
  beforeEach(() => {
    // O jsdom não implementa blob URL.
    URL.createObjectURL = vi.fn(() => "blob:falso");
    URL.revokeObjectURL = vi.fn();
  });

  it("a última etapa de preenchimento leva a gerar", async () => {
    const { aoNavegar } = montar({ cvInicial: cvProntoParaGerar(), etapaInicial: "habilidades" });

    await userEvent.click(screen.getByRole("button", { name: /gerar o currículo/i }));

    expect(aoNavegar).toHaveBeenCalledWith("gerando");
  });

  it("'gerando' compila e segue sozinha para o preview", async () => {
    const { compilar, aoNavegar } = montar({
      cvInicial: cvProntoParaGerar(),
      etapaInicial: "gerando",
    });

    await waitFor(() => {
      // Substituindo a entrada do histórico: o Voltar do navegador não deve
      // parar numa tela de passagem.
      expect(aoNavegar).toHaveBeenCalledWith("preview", { substituir: true });
    });
    expect(compilar).toHaveBeenCalledTimes(1);
  });

  it("depois de editar, 'gerando' compila de novo e espera o PDF novo", async () => {
    // O ciclo que a pessoa faz de verdade: vê o PDF, volta para corrigir,
    // gera outra vez. O preview só pode abrir com o PDF da correção — o da
    // visita anterior não serve. A garantia de conteúdo fica no hook
    // (`emDia`, ver o teste de useCompilacao); aqui se prova o fluxo.
    let liberarSegunda: (r: ResultadoCompilacao) => void = () => {};
    const compilar = vi
      .fn<(cv: CvData) => Promise<ResultadoCompilacao>>()
      .mockResolvedValueOnce({ ok: true, resposta: RESPOSTA_PDF })
      .mockImplementationOnce(() => new Promise((r) => (liberarSegunda = r)));
    const aoNavegar = vi.fn();

    const props = {
      cvInicial: {
        ...cvProntoParaGerar(),
        habilidades: { textoOriginal: "python", itens: [], statusIa: "none" as const },
      },
      salvar: vi.fn(async () => true),
      aoNavegar,
      pedirSugestaoExperiencia: vi.fn(),
      pedirSugestaoHabilidades: vi.fn(),
      compilar,
      concluir: vi.fn(),
      apagarDados: vi.fn(),
    };

    const { rerender } = render(<FormularioCliente {...props} etapaInicial="preview" />);
    await screen.findByRole("link", { name: /baixar currículo/i });

    // Volta às habilidades, edita, e pede para gerar de novo.
    rerender(<FormularioCliente {...props} etapaInicial="habilidades" />);
    await userEvent.type(screen.getByLabelText(/suas habilidades/i), ", sql");
    rerender(<FormularioCliente {...props} etapaInicial="gerando" />);

    await waitFor(() => expect(compilar).toHaveBeenCalledTimes(2));
    expect(aoNavegar).not.toHaveBeenCalledWith("preview", { substituir: true });

    liberarSegunda({ ok: true, resposta: { ...RESPOSTA_PDF, contentHash: "b".repeat(64) } });

    await waitFor(() =>
      expect(aoNavegar).toHaveBeenCalledWith("preview", { substituir: true }),
    );
  });

  it("o preview mostra o PDF, o download e o painel de seções", async () => {
    montar({ cvInicial: cvProntoParaGerar(), etapaInicial: "preview" });

    const baixar = await screen.findByRole("link", { name: /baixar currículo/i });
    expect(baixar.getAttribute("download")).toBe("curriculo-ana-souza.pdf");
    expect(screen.getByRole("navigation", { name: /seções do currículo/i })).toBeDefined();

    // Sem "Continuar" aqui: não há próxima etapa, e a ação principal é baixar.
    expect(screen.queryByRole("button", { name: /continuar/i })).toBeNull();
  });

  it("clicar numa seção do painel leva direto ao item", async () => {
    const { aoNavegar } = montar({
      cvInicial: {
        ...cvProntoParaGerar(),
        experiencias: [novaExperiencia({ id: "e1", cargo: "Dev", empresa: "Acme" })],
      },
      etapaInicial: "preview",
    });

    const painel = screen.getByRole("navigation", { name: /seções do currículo/i });
    await userEvent.click(within(painel).getByRole("button", { name: /dev/i }));

    expect(aoNavegar).toHaveBeenCalledWith("experiencias", { item: "e1" });
  });

  it("do preview, Voltar leva às habilidades — e não à tela de passagem", async () => {
    const { aoNavegar } = montar({ cvInicial: cvProntoParaGerar(), etapaInicial: "preview" });

    await userEvent.click(screen.getByRole("button", { name: /^voltar$/i }));

    expect(aoNavegar).toHaveBeenCalledWith("habilidades");
  });

  it("sem o obrigatório, não chama o worker e aponta o que falta", async () => {
    // `?etapa=preview` é digitável. Chamar o worker aqui renderia um erro
    // técnico sobre um problema que a pessoa resolve em dez segundos.
    const { compilar, aoNavegar } = montar({
      cvInicial: cvPreenchido(), // sem objetivo
      etapaInicial: "preview",
    });

    await userEvent.click(screen.getByRole("button", { name: /completar “objetivo”/i }));

    expect(aoNavegar).toHaveBeenCalledWith("objetivo");
    expect(compilar).not.toHaveBeenCalled();
  });

  it("falha do worker mostra erro com 'tentar de novo', e não quebra a página", async () => {
    const compilar = vi
      .fn<(cv: CvData) => Promise<ResultadoCompilacao>>()
      .mockResolvedValueOnce({
        ok: false,
        codigo: "FALHA_LATEX",
        mensagem: "Não conseguimos montar o PDF do seu currículo.",
      })
      .mockResolvedValueOnce({ ok: true, resposta: RESPOSTA_PDF });

    montar({ cvInicial: cvProntoParaGerar(), etapaInicial: "preview", compilar });

    await userEvent.click(await screen.findByRole("button", { name: /tentar de novo/i }));

    expect(await screen.findByRole("link", { name: /baixar currículo/i })).toBeDefined();
    expect(compilar).toHaveBeenCalledTimes(2);
  });
});

describe("concluir e salvar", () => {
  /**
   * O botão depois do sexto passo: grava a versão da tela e manda um link
   * para o e-mail do currículo, válido por 5 dias que editar não renova.
   */
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:falso");
    URL.revokeObjectURL = vi.fn();
  });

  it("aparece no preview e envia a versão que está na tela", async () => {
    const { concluir } = montar({ cvInicial: cvProntoParaGerar(), etapaInicial: "preview" });

    await userEvent.click(screen.getByRole("button", { name: /^concluir e salvar$/i }));

    expect(concluir).toHaveBeenCalledTimes(1);
    expect((concluir.mock.calls[0]?.[0] as CvData).pessoal.nome).toBe("Ana Souza");

    // O e-mail e o prazo, por escrito — inclusive a regra que surpreende.
    const status = await screen.findByText(/enviamos para/i);
    expect(status.textContent).toContain("ana@exemplo.com");
    expect(status.textContent).toContain("quinta-feira, 08/10, às 14:30");
    expect(status.textContent).toMatch(/editar\s+não muda esse prazo/);
  });

  it("depois de concluir, o prazo passa a aparecer no cabeçalho", async () => {
    montar({ cvInicial: cvProntoParaGerar(), etapaInicial: "preview" });

    await userEvent.click(screen.getByRole("button", { name: /^concluir e salvar$/i }));

    expect(await screen.findByText(/disponível para edição até/i)).toBeDefined();
  });

  it("quem volta pelo link vê o prazo enquanto edita, em qualquer etapa", () => {
    montar({
      cvInicial: cvProntoParaGerar(),
      etapaInicial: "experiencias",
      prazoInicial: "2026-10-08T17:30:00.000Z",
    });

    expect(
      screen.getByText(/disponível para edição até quinta-feira, 08\/10, às 14:30/i),
    ).toBeDefined();
  });

  it("concluir de novo diz que o link anterior continua valendo", async () => {
    montar({
      cvInicial: cvProntoParaGerar(),
      etapaInicial: "preview",
      prazoInicial: "2026-10-08T17:30:00.000Z",
      concluir: vi.fn(
        async (): Promise<ResultadoConcluir> => ({
          ok: true,
          envio: "ja_enviado",
          email: "ana@exemplo.com",
          expiraEm: "2026-10-08T17:30:00.000Z",
        }),
      ),
    });

    await userEvent.click(screen.getByRole("button", { name: /^concluir e salvar$/i }));

    expect(await screen.findByText(/continua valendo/i)).toBeDefined();
  });

  it("sem e-mail configurado, o botão nasce desligado e diz por quê", () => {
    montar({
      cvInicial: cvProntoParaGerar(),
      etapaInicial: "preview",
      emailDisponivel: false,
    });

    expect(
      screen.getByRole("button", { name: /^concluir e salvar$/i }).hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.getByText(/envio de e-mail está desligado/i)).toBeDefined();
  });

  it("e-mail inválido oferece o caminho para corrigir", async () => {
    const { aoNavegar } = montar({
      cvInicial: cvProntoParaGerar(),
      etapaInicial: "preview",
      concluir: vi.fn(
        async (): Promise<ResultadoConcluir> => ({ ok: false, motivo: "dados_incompletos" }),
      ),
    });

    await userEvent.click(screen.getByRole("button", { name: /^concluir e salvar$/i }));
    await userEvent.click(await screen.findByRole("button", { name: /corrigir o e-mail/i }));

    expect(aoNavegar).toHaveBeenCalledWith("pessoal");
  });

  it("falha de rede vira mensagem, e o botão continua lá para tentar de novo", async () => {
    montar({
      cvInicial: cvProntoParaGerar(),
      etapaInicial: "preview",
      concluir: vi.fn(async () => {
        throw new Error("rede caiu");
      }),
    });

    await userEvent.click(screen.getByRole("button", { name: /^concluir e salvar$/i }));

    expect(await screen.findByText(/não conseguimos enviar o e-mail agora/i)).toBeDefined();
    expect(
      screen.getByRole("button", { name: /^concluir e salvar$/i }).hasAttribute("disabled"),
    ).toBe(false);
  });
});

describe("apagar meus dados (LGPD)", () => {
  it("está no rodapé de TODAS as etapas, com o link de privacidade", () => {
    // O direito vale a qualquer momento — inclusive para quem desistiu no
    // meio, e não só para quem chegou ao fim.
    for (const etapa of ["pessoal", "experiencias", "habilidades"] as const) {
      montar({ cvInicial: cvProntoParaGerar(), etapaInicial: etapa });
      expect(screen.getByRole("button", { name: /^apagar meus dados$/i })).toBeDefined();
      expect(screen.getByRole("link", { name: /privacidade/i }).getAttribute("href")).toBe(
        "/privacidade",
      );
      cleanup();
    }
  });

  it("pede confirmação, e só então apaga", async () => {
    const { apagarDados } = montar({ cvInicial: cvProntoParaGerar() });

    await userEvent.click(screen.getByRole("button", { name: /^apagar meus dados$/i }));
    expect(apagarDados).not.toHaveBeenCalled();
    // O foco nasce no Cancelar: quem abriu sem querer sai no Enter.
    expect(document.activeElement?.textContent).toBe("Cancelar");

    await userEvent.click(screen.getByRole("button", { name: /sim, apagar tudo/i }));
    expect(apagarDados).toHaveBeenCalledTimes(1);
  });

  it("se a rede cair no meio, diz que não apagou — em vez de travar em 'Apagando…'", async () => {
    // Sem o catch, a exceção da Server Action deixava o botão preso, e a
    // pessoa sem saber se os dados tinham sido apagados.
    montar({
      cvInicial: cvProntoParaGerar(),
      apagarDados: vi.fn(async () => {
        throw new Error("rede caiu");
      }),
    });

    await userEvent.click(screen.getByRole("button", { name: /^apagar meus dados$/i }));
    await userEvent.click(screen.getByRole("button", { name: /sim, apagar tudo/i }));

    expect(await screen.findByText(/não conseguimos apagar agora/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /sim, apagar tudo/i }).hasAttribute("disabled")).toBe(
      false,
    );
  });
});
