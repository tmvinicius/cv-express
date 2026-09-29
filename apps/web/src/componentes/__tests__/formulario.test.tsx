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
import type { ResultadoCompilacao } from "../../acoes/compilar";
import type { ResultadoIa } from "../../acoes/ia";

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
  const pedirSugestaoExperiencia = vi.fn(
    async (_cv: CvData, _id: string): Promise<ResultadoIa<string[]>> => ({
      ok: true,
      dados: ["Desenvolvi APIs"],
    }),
  );
  const pedirSugestaoHabilidades = vi.fn(
    async (
      _cv: CvData,
    ): Promise<ResultadoIa<{ nome: string; categoria: "tecnica" }[]>> => ({
      ok: true,
      dados: [{ nome: "Python", categoria: "tecnica" }],
    }),
  );
  const compilar = vi.fn(async (_cv: CvData): Promise<ResultadoCompilacao> => ({
    ok: true,
    resposta: respostaDoWorker(1),
  }));
  const apagarTudo = vi.fn(async () => true);

  render(
    <FormularioCliente
      cvInicial={novoCv("s1")}
      etapaInicial="pessoal"
      capacidades={{ ia: { disponivel: true } }}
      salvar={salvar}
      aoNavegar={aoNavegar}
      pedirSugestaoExperiencia={pedirSugestaoExperiencia}
      pedirSugestaoHabilidades={pedirSugestaoHabilidades}
      compilar={compilar}
      apagarTudo={apagarTudo}
      {...overrides}
    />,
  );

  return {
    salvar,
    aoNavegar,
    pedirSugestaoExperiencia,
    pedirSugestaoHabilidades,
    compilar,
    apagarTudo,
  };
}

/** Resposta do worker com um PDF de mentira e a contagem de páginas pedida. */
function respostaDoWorker(paginas: number): CompilarResposta {
  return {
    contentHash: "a".repeat(64),
    templateId: "classico",
    templateVersao: "1",
    pageCount: paginas,
    pdf: btoa("%PDF-1.7 falso"),
    posicoes: [],
    duracaoMs: 5,
    doCache: false,
  };
}

const cvPreenchido = (): CvData => ({
  ...novoCv("s1"),
  pessoal: { nome: "Ana Souza", cidade: "Belo Horizonte", email: "ana@exemplo.com" },
});

/**
 * Currículo que de fato pode virar PDF: dados pessoais MAIS objetivo.
 *
 * A separação importa. Os testes de geração usavam `cvPreenchido()`, que não
 * tem objetivo, e passavam — porque `opcional: false` na etapa era decorativo
 * e `prontoParaGerar` não olhava o campo. A fixture escondia a mesma lacuna
 * que o produto tinha.
 */
const cvProntoParaGerar = (): CvData => ({
  ...cvPreenchido(),
  objetivo: { texto: "Atuar como desenvolvedora backend." },
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
    // Monta em "pessoal", que é a etapa em que TODO MUNDO entra.
    //
    // A versão anterior montava em "boas-vindas" e passava — afirmando sobre
    // uma etapa em que ninguém entrava, enquanto "pessoal" exibia justamente
    // o botão que o teste dizia não existir. Clicar nele levava a uma tela em
    // branco. Teste verde sobre comportamento errado.
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
      pedirSugestaoExperiencia: vi.fn(
        async (): Promise<ResultadoIa<string[]>> => ({
          ok: false,
          motivo: "INDISPONIVEL",
        }),
      ),
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

describe("datas incoerentes", () => {
  /** Experiência com término ANTES do início — o dado que o banco recusa. */
  const comPeriodoInvertido = (): CvData => ({
    ...cvPreenchido(),
    experiencias: [
      novaExperiencia({
        id: "e1",
        cargo: "Dev",
        empresa: "Acme",
        periodo: { inicio: { ano: 2024, mes: 6 }, fim: { ano: 2020, mes: 3 } },
      }),
    ],
  });

  it("avisa no ato, colado no campo, sem esperar o clique em Continuar", async () => {
    /**
     * O defeito relatado: o formulário aceitava a data incoerente sem avisar.
     * O agravante: `salvarEtapa` recusa esse dado, então o autosave para e a
     * única pista é o indicador dizendo que os dados continuam na tela.
     */
    montar({ cvInicial: comPeriodoInvertido(), etapaInicial: "experiencias" });

    expect(
      screen.getByText(/o término \(mar\/2020\) é anterior ao início \(jun\/2024\)/i),
    ).toBeDefined();
    // E diz o que fazer, não só o que está errado.
    expect(screen.getByText(/trocadas/i)).toBeDefined();
  });

  it("marca os selects como inválidos para tecnologia assistiva", () => {
    montar({ cvInicial: comPeriodoInvertido(), etapaInicial: "experiencias" });

    expect(
      screen.getByLabelText(/término: ano/i).getAttribute("aria-invalid"),
    ).toBe("true");
  });

  it("corrigir a data faz o aviso sumir na hora", async () => {
    montar({ cvInicial: comPeriodoInvertido(), etapaInicial: "experiencias" });

    await userEvent.selectOptions(
      screen.getByLabelText(/término: ano/i),
      String(new Date().getFullYear()),
    );

    expect(screen.queryByText(/é anterior ao início/i)).toBeNull();
  });

  it("o avanço continua bloqueado enquanto a data é impossível", async () => {
    // Inline e imediato não significa permissivo: o schema e o banco recusam
    // esse período, e passar adiante só adiaria o erro.
    const { aoNavegar } = montar({
      cvInicial: comPeriodoInvertido(),
      etapaInicial: "experiencias",
    });

    await userEvent.click(screen.getByRole("button", { name: /continuar/i }));

    expect(aoNavegar).not.toHaveBeenCalled();
  });

  it("período em aberto diz como vai sair no currículo", () => {
    // "Atual" esconde dois campos; sem dizer o que colocou no lugar, o
    // checkbox parece ter apagado a informação.
    montar({
      cvInicial: {
        ...cvPreenchido(),
        experiencias: [
          novaExperiencia({
            id: "e1",
            cargo: "Dev",
            empresa: "Acme",
            periodo: { inicio: { ano: 2023, mes: 6 }, fim: "atual" },
          }),
        ],
      },
      etapaInicial: "experiencias",
    });

    expect(screen.getByText(/jun\/2023 – atual/i)).toBeDefined();
  });

  it("data plausível não gera ruído nenhum", () => {
    // Avisar demais ensina a ignorar avisos.
    montar({
      cvInicial: {
        ...cvPreenchido(),
        experiencias: [
          novaExperiencia({
            id: "e1",
            cargo: "Dev",
            empresa: "Acme",
            periodo: { inicio: { ano: 2020, mes: 3 }, fim: { ano: 2024, mes: 6 } },
          }),
        ],
      },
      etapaInicial: "experiencias",
    });

    expect(screen.queryByText(/anterior ao início/i)).toBeNull();
    expect(screen.queryByText(/ainda não chegou/i)).toBeNull();
  });
});

describe("trilha de etapas no formulário montado", () => {
  it("leva de volta a uma etapa anterior, sem validar a atual", async () => {
    const { aoNavegar } = montar({
      cvInicial: { ...cvPreenchido(), objetivo: { texto: "Backend." } },
      etapaInicial: "experiencias",
    });

    const trilha = screen.getByRole("navigation", { name: /etapas do formulário/i });
    await userEvent.click(within(trilha).getByRole("button", { name: /seus dados/i }));

    expect(aoNavegar).toHaveBeenCalledWith("pessoal");
  });

  it("barra e trilha contam a mesma coisa", async () => {
    /**
     * O defeito relatado: a barra não andava quando a etapa ficava vazia, mas
     * o "Etapa X de 6" andava sempre — dois indicadores se contradizendo. Aqui
     * os dois saem do mesmo cálculo, então a contagem exibida é a mesma.
     */
    montar({
      cvInicial: { ...cvPreenchido(), objetivo: { texto: "Backend." } },
      etapaInicial: "experiencias",
    });

    // Duas etapas preenchidas e válidas, nenhuma pulada ainda.
    expect(screen.getByText("2 de 6 etapas prontas")).toBeDefined();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("33");
    expect(screen.getByText(/etapa 3 de 6: experiências/i)).toBeDefined();
  });

  it("pular uma etapa opcional faz a contagem andar", async () => {
    // Quem está no primeiro emprego pula experiências de propósito: a barra
    // precisa reconhecer a decisão, não cobrá-la para sempre.
    montar({
      cvInicial: { ...cvPreenchido(), objetivo: { texto: "Backend." } },
      etapaInicial: "formacao",
    });

    expect(screen.getByText("3 de 6 etapas prontas")).toBeDefined();
  });
});

describe("ajuda de IA sem provider configurado", () => {
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

  it("o botão nasce desabilitado, com o motivo à vista", () => {
    // O defeito relatado: sem token, o botão existia e não entregava nada.
    montar({
      cvInicial: comExperiencia(),
      etapaInicial: "experiencias",
      capacidades: { ia: { disponivel: false } },
    });

    expect(
      screen.getByRole("button", { name: /organizar com ajuda da ia/i }),
    ).toHaveProperty("disabled", true);
    expect(screen.getByText(/desligada neste ambiente/i)).toBeDefined();
  });

  it("e o resto do formulário continua inteiro", () => {
    // A IA é acessório: sem ela o currículo sai igual, a partir do texto que a
    // pessoa escreveu.
    montar({
      cvInicial: comExperiencia(),
      etapaInicial: "experiencias",
      capacidades: { ia: { disponivel: false } },
    });

    expect(screen.getByLabelText(/o que você fazia lá/i)).toHaveProperty(
      "disabled",
      false,
    );
    expect(screen.getByRole("button", { name: /continuar/i })).toBeDefined();
  });

  it("falha em tempo de execução explica o que houve, e deixa tentar de novo", async () => {
    // Timeout é diferente de "não configurado", e a pessoa merece saber qual
    // dos dois foi — por isso o motivo viaja como dado, não como exceção.
    montar({
      cvInicial: comExperiencia(),
      etapaInicial: "experiencias",
      pedirSugestaoExperiencia: vi.fn(async () => ({
        ok: false as const,
        motivo: "TEMPO_ESGOTADO" as const,
      })),
    });

    await userEvent.click(
      screen.getByRole("button", { name: /organizar com ajuda da ia/i }),
    );

    expect(await screen.findByText(/demorando mais que o normal/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /tentar de novo/i })).toBeDefined();
  });

  it("guardrail acionado é explicado como proteção, não como defeito", async () => {
    /**
     * "A sugestão trouxe informação que você não escreveu, então descartamos"
     * é a promessa central do produto acontecendo à vista da pessoa. Antes,
     * este caso e um timeout produziam a mesma frase vaga.
     */
    montar({
      cvInicial: comExperiencia(),
      etapaInicial: "experiencias",
      pedirSugestaoExperiencia: vi.fn(async () => ({
        ok: false as const,
        motivo: "GUARDRAIL" as const,
      })),
    });

    await userEvent.click(
      screen.getByRole("button", { name: /organizar com ajuda da ia/i }),
    );

    expect(
      await screen.findByText(/informação que você não escreveu/i),
    ).toBeDefined();
  });

  it("não oferece 'tentar de novo' quando o ambiente não tem IA", async () => {
    // Um botão de repetir aqui seria o mesmo clique morto, uma tela depois.
    montar({
      cvInicial: comExperiencia(),
      etapaInicial: "experiencias",
      pedirSugestaoExperiencia: vi.fn(async () => ({
        ok: false as const,
        motivo: "sem_configuracao" as const,
      })),
    });

    await userEvent.click(
      screen.getByRole("button", { name: /organizar com ajuda da ia/i }),
    );

    await screen.findByText(/desligada neste ambiente/i);
    expect(screen.queryByRole("button", { name: /tentar de novo/i })).toBeNull();
  });
});

describe("geração do currículo", () => {
  /**
   * O jsdom não implementa URL.createObjectURL. Sem o dublê, o Preview trata
   * o PDF como corrompido e não mostra o link de download — e o teste não
   * conseguiria provar que o PDF chegou à tela.
   */
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:curriculo");
    URL.revokeObjectURL = vi.fn();
  });

  it("a última etapa mostra o PDF, e não o erro 'Esta é a última etapa'", async () => {
    // O defeito relatado: o preview só tinha a barra de progresso e um
    // "Continuar" que, clicado, respondia com esse erro.
    const { compilar } = montar({ cvInicial: cvProntoParaGerar(), etapaInicial: "preview" });

    expect(await screen.findByRole("link", { name: /baixar currículo/i })).toBeDefined();
    expect(compilar).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /continuar/i })).toBeNull();
    expect(screen.queryByText(/esta é a última etapa/i)).toBeNull();
  });

  it("o arquivo baixado leva o nome da pessoa, sem acento", async () => {
    montar({
      cvInicial: {
        ...cvProntoParaGerar(),
        pessoal: { nome: "João Conceição", cidade: "São Paulo", email: "j@exemplo.com" },
      },
      etapaInicial: "preview",
    });

    const link = await screen.findByRole("link", { name: /baixar currículo/i });
    expect(link.getAttribute("download")).toBe("curriculo-joao-conceicao.pdf");
  });

  it("'gerando' segue sozinho para o preview quando o PDF fica pronto", async () => {
    const { aoNavegar } = montar({ cvInicial: cvProntoParaGerar(), etapaInicial: "gerando" });

    await waitFor(() => expect(aoNavegar).toHaveBeenCalledWith("preview"));
  });

  it("sem os dados obrigatórios, não chama o worker e diz o que falta", async () => {
    // O worker recusaria com DADOS_INVALIDOS, e a pessoa veria um erro
    // genérico em vez de saber qual campo preencher.
    const { compilar } = montar({ cvInicial: novoCv("s1"), etapaInicial: "preview" });

    expect(screen.getByRole("alert").textContent).toMatch(/falta preencher/i);
    expect(compilar).not.toHaveBeenCalled();
  });

  it("erro do worker aparece com 'tentar de novo', e tentar de novo recompila", async () => {
    const compilar = vi
      .fn<(cv: CvData) => Promise<ResultadoCompilacao>>()
      .mockResolvedValueOnce({
        ok: false,
        codigo: "ERRO_INTERNO",
        mensagem: "O gerador de PDF não está disponível agora. Seu currículo está salvo.",
      })
      .mockResolvedValueOnce({ ok: true, resposta: respostaDoWorker(1) });

    montar({ cvInicial: cvProntoParaGerar(), etapaInicial: "preview", compilar });

    expect((await screen.findByRole("alert")).textContent).toMatch(/não está disponível/i);

    await userEvent.click(screen.getByRole("button", { name: /tentar de novo/i }));

    expect(await screen.findByRole("link", { name: /baixar currículo/i })).toBeDefined();
    expect(compilar).toHaveBeenCalledTimes(2);
  });

  it("Server Action que lança vira erro na tela, não página quebrada", async () => {
    const compilar = vi.fn(async (): Promise<ResultadoCompilacao> => {
      throw new Error("rede caiu");
    });

    montar({ cvInicial: cvProntoParaGerar(), etapaInicial: "preview", compilar });

    expect((await screen.findByRole("alert")).textContent).toMatch(/currículo está salvo/i);
  });

  it("avisa quando passa de uma página, sem bloquear o download", async () => {
    const compilar = vi.fn(
      async (): Promise<ResultadoCompilacao> => ({ ok: true, resposta: respostaDoWorker(2) }),
    );

    montar({ cvInicial: cvProntoParaGerar(), etapaInicial: "preview", compilar });

    expect(await screen.findByText(/ficou com 2 páginas/i)).toBeDefined();
    /**
     * `findBy` e não `getBy`: o aviso de páginas aparece assim que o PDF fica
     * pronto, mas o link só depois que o efeito do `URL.createObjectURL`
     * roda — um ciclo adiante. Consultar sem esperar passava na máquina
     * rápida e falhava na suíte inteira, que é o pior tipo de teste instável:
     * o que acusa defeito onde não há.
     */
    expect(await screen.findByRole("link", { name: /baixar currículo/i })).toBeDefined();
  });

  it("o painel de seções leva à etapa E ao item", async () => {
    // Antes só a etapa viajava: com cinco experiências na tela, clicar em
    // "Experiência 3" abria a lista inteira e a pessoa tinha de procurar de
    // novo qual ela mesma acabara de pedir.
    const { aoNavegar } = montar({
      cvInicial: {
        ...cvProntoParaGerar(),
        experiencias: [
          novaExperiencia({ id: "e1", cargo: "Dev", empresa: "Acme" }),
          novaExperiencia({ id: "e2", cargo: "Analista", empresa: "Beta" }),
        ],
      },
      etapaInicial: "preview",
    });

    const painel = screen.getByRole("navigation", { name: /seções do currículo/i });
    await userEvent.click(within(painel).getByRole("button", { name: /analista/i }));

    expect(aoNavegar).toHaveBeenCalledWith("experiencias", "e2");
  });

  it("o item pedido é o que recebe foco ao abrir a etapa", async () => {
    // A outra metade do caminho: levar o id adiante não adianta se a etapa
    // ignorar o id ao montar.
    montar({
      cvInicial: {
        ...cvProntoParaGerar(),
        experiencias: [
          novaExperiencia({ id: "e1", cargo: "Dev", empresa: "Acme" }),
          novaExperiencia({ id: "e2", cargo: "Analista", empresa: "Beta" }),
        ],
      },
      etapaInicial: "experiencias",
      itemEmFoco: "e2",
    });

    // O foco vai para o primeiro campo do item pedido, que é onde se edita.
    const focado = document.activeElement as HTMLInputElement | null;
    expect(focado?.value).toBe("Analista");
  });
});

describe("apagar meus dados (LGPD)", () => {
  /**
   * O defeito que estes testes impedem: a ação existir e ninguém chamá-la.
   *
   * `acaoApagarTudo` apagava em cascata e tinha teste desde o começo, mas
   * nenhum componente a chamava — o produto prometia no README um direito
   * legal que não tinha como ser exercido.
   *
   * O segundo teste é tão importante quanto o primeiro: o apagamento é
   * DELETE, sem desfazer. Um botão que apaga no primeiro clique é pior do que
   * botão nenhum.
   */
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:curriculo");
    URL.revokeObjectURL = vi.fn();
  });

  it("um clique só NÃO apaga nada", async () => {
    const { apagarTudo } = montar({
      cvInicial: cvProntoParaGerar(),
      etapaInicial: "preview",
    });

    await userEvent.click(await screen.findByRole("button", { name: /apagar meus dados/i }));

    expect(apagarTudo).not.toHaveBeenCalled();
    // E a consequência tem de estar escrita na tela antes da confirmação.
    expect(screen.getByRole("alertdialog")).toBeDefined();
    expect(screen.getByText(/não dá para desfazer/i)).toBeDefined();
  });

  it("apaga depois da confirmação explícita", async () => {
    const { apagarTudo } = montar({
      cvInicial: cvProntoParaGerar(),
      etapaInicial: "preview",
    });

    await userEvent.click(await screen.findByRole("button", { name: /apagar meus dados/i }));
    await userEvent.click(screen.getByRole("button", { name: /sim, apagar tudo/i }));

    expect(apagarTudo).toHaveBeenCalledTimes(1);
  });

  it("cancelar fecha sem apagar", async () => {
    const { apagarTudo } = montar({
      cvInicial: cvProntoParaGerar(),
      etapaInicial: "preview",
    });

    await userEvent.click(await screen.findByRole("button", { name: /apagar meus dados/i }));
    await userEvent.click(screen.getByRole("button", { name: /cancelar/i }));

    expect(apagarTudo).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("falha ao apagar não some com a tela nem com os dados", async () => {
    // Se o DELETE falhar, a pessoa precisa saber que os dados CONTINUAM lá —
    // o contrário faria alguém achar que já exerceu o direito.
    const falhou = vi.fn(async () => false);
    montar({
      cvInicial: cvProntoParaGerar(),
      etapaInicial: "preview",
      apagarTudo: falhou,
    });

    await userEvent.click(await screen.findByRole("button", { name: /apagar meus dados/i }));
    await userEvent.click(screen.getByRole("button", { name: /sim, apagar tudo/i }));

    expect(falhou).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/seus dados continuam aqui/i)).toBeDefined();
    // Continua sendo possível tentar de novo — a tela não virou beco.
    expect(screen.getByRole("button", { name: /sim, apagar tudo/i })).toBeDefined();
  });

  it("não aparece no meio do preenchimento", () => {
    // A saída de emergência não pode ficar no caminho de quem está
    // trabalhando.
    montar({ etapaInicial: "pessoal" });
    expect(screen.queryByRole("button", { name: /apagar meus dados/i })).toBeNull();
  });
});
