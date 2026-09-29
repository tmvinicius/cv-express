import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  novoCv,
  novaExperiencia,
  novaFormacao,
  anoMaximo,
  type CvData,
  type Formacao as FormacaoItem,
} from "@cv-express/schema";

import { DadosPessoais } from "../etapas/DadosPessoais";
import { Objetivo } from "../etapas/Objetivo";
import { Experiencias } from "../etapas/Experiencias";
import { Idiomas } from "../etapas/Idiomas";
import { AprovacaoIa } from "../AprovacaoIa";
import { Habilidades } from "../etapas/Habilidades";
import { Formacao } from "../etapas/Formacao";

afterEach(cleanup);

const cv = (extra: Partial<CvData> = {}): CvData => ({ ...novoCv("t"), ...extra });

describe("DadosPessoais", () => {
  it("mostra os campos e propaga as mudanças", async () => {
    const despachar = vi.fn();
    render(<DadosPessoais cv={cv()} despachar={despachar} />);

    await userEvent.type(screen.getByLabelText(/nome completo/i), "A");

    expect(despachar).toHaveBeenCalledWith({
      tipo: "pessoal",
      campo: "nome",
      valor: "A",
    });
  });

  it("deixa claro o que é opcional", () => {
    render(<DadosPessoais cv={cv()} despachar={vi.fn()} />);

    // Quem não tem LinkedIn não pode achar que travou. São três campos
    // opcionais, e todos precisam dizer isso.
    expect(screen.getAllByText(/opcional/i).length).toBeGreaterThanOrEqual(3);
  });

  it("exibe o erro ligado ao campo", () => {
    render(
      <DadosPessoais
        cv={cv()}
        despachar={vi.fn()}
        erros={{ email: "Confira o e-mail digitado" }}
      />,
    );

    const alerta = screen.getByRole("alert");
    expect(alerta.textContent).toBe("Confira o e-mail digitado");
    expect(
      screen.getByLabelText(/e-mail/i).getAttribute("aria-describedby"),
    ).toContain(alerta.id);
  });
});

describe("Objetivo", () => {
  it("oferece exemplos para matar a folha em branco", async () => {
    // Um campo vazio com "descreva seu objetivo profissional" é exatamente
    // onde a pessoa desiste.
    const despachar = vi.fn();
    render(<Objetivo cv={cv()} despachar={despachar} />);

    await userEvent.click(screen.getByText(/veja exemplos/i));
    const botoes = screen.getAllByRole("button", { name: /ponto de partida/i });
    expect(botoes.length).toBeGreaterThan(1);

    await userEvent.click(botoes[0]!);

    expect(despachar).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: "objetivo" }),
    );
  });

  it("o exemplo preenche o campo em vez de ser só leitura", async () => {
    const despachar = vi.fn();
    render(<Objetivo cv={cv()} despachar={despachar} />);

    await userEvent.click(screen.getByText(/veja exemplos/i));
    await userEvent.click(screen.getAllByRole("button", { name: /ponto de partida/i })[0]!);

    const acao = despachar.mock.calls[0]?.[0] as { texto: string };
    expect(acao.texto.length).toBeGreaterThan(20);
  });
});

describe("Experiencias", () => {
  it("o estado vazio tranquiliza quem está no primeiro emprego", () => {
    render(
      <Experiencias
        cv={cv()}
        despachar={vi.fn()}
        sugestoes={{}}
        aoPedirSugestao={vi.fn()}
      />,
    );

    expect(screen.getByText(/primeiro emprego/i)).toBeDefined();
  });

  it("adiciona experiência", async () => {
    const despachar = vi.fn();
    render(
      <Experiencias
        cv={cv()}
        despachar={despachar}
        sugestoes={{}}
        aoPedirSugestao={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /adicionar experiência/i }));
    expect(despachar).toHaveBeenCalledWith({ tipo: "exp:adicionar" });
  });

  it("o botão de remover diz o que está removendo", async () => {
    // "Remover" sozinho, repetido cinco vezes, é inútil para leitor de tela.
    const despachar = vi.fn();
    render(
      <Experiencias
        cv={cv({
          experiencias: [
            novaExperiencia({ id: "e1", cargo: "Desenvolvedor", empresa: "Acme" }),
          ],
        })}
        despachar={despachar}
        sugestoes={{}}
        aoPedirSugestao={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /remover desenvolvedor/i }));
    expect(despachar).toHaveBeenCalledWith({ tipo: "exp:remover", id: "e1" });
  });

  it("mostra os bullets aplicados como campos editáveis", () => {
    render(
      <Experiencias
        cv={cv({
          experiencias: [
            novaExperiencia({
              id: "e1",
              cargo: "Dev",
              empresa: "Acme",
              descricaoOriginal: "cuidei das apis",
              bullets: ["Desenvolvi APIs REST"],
              statusIa: "applied",
            }),
          ],
        })}
        despachar={vi.fn()}
        sugestoes={{}}
        aoPedirSugestao={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue("Desenvolvi APIs REST")).toBeDefined();
    expect(screen.getByRole("button", { name: /voltar ao meu texto/i })).toBeDefined();
  });
});

describe("Idiomas", () => {
  it("o estado vazio não parece defeito", () => {
    render(<Idiomas cv={cv()} despachar={vi.fn()} />);
    expect(screen.getByText(/tudo bem seguir sem isso/i)).toBeDefined();
  });
});

describe("AprovacaoIa", () => {
  const props = {
    original: "cuidei das apis e do banco",
    aoPedir: vi.fn(),
    aoUsar: vi.fn(),
    aoManterOriginal: vi.fn(),
  };

  it("não oferece a IA para texto vazio", () => {
    render(<AprovacaoIa {...props} original="" estado={{ fase: "ocioso" }} />);

    expect(
      screen.getByRole("button", { name: /organizar com ajuda da ia/i }),
    ).toHaveProperty("disabled", true);
  });

  it("diz o que a IA faz e o que não faz", () => {
    render(<AprovacaoIa {...props} estado={{ fase: "ocioso" }} />);
    expect(screen.getByText(/não inventa nada/i)).toBeDefined();
  });

  /**
   * O teste que protege a promessa central do produto: nada entra no
   * currículo sem clique explícito.
   */
  it("NÃO aplica a sugestão sozinho ao recebê-la", () => {
    const aoUsar = vi.fn();
    render(
      <AprovacaoIa
        {...props}
        aoUsar={aoUsar}
        estado={{ fase: "pronta", bullets: ["Desenvolvi APIs REST"] }}
      />,
    );

    expect(aoUsar).not.toHaveBeenCalled();
  });

  it("mostra original e sugestão lado a lado", () => {
    render(
      <AprovacaoIa
        {...props}
        estado={{ fase: "pronta", bullets: ["Desenvolvi APIs REST"] }}
      />,
    );

    // Esconder o original transformaria a escolha em fé.
    expect(screen.getByText("cuidei das apis e do banco")).toBeDefined();
    expect(screen.getByText("Desenvolvi APIs REST")).toBeDefined();
  });

  it("aplica só no clique de usar", async () => {
    const aoUsar = vi.fn();
    render(
      <AprovacaoIa
        {...props}
        aoUsar={aoUsar}
        estado={{ fase: "pronta", bullets: ["Desenvolvi APIs REST"] }}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /usar sugestão/i }));
    expect(aoUsar).toHaveBeenCalledWith(["Desenvolvi APIs REST"]);
  });

  it("permite manter o texto próprio", async () => {
    const aoManterOriginal = vi.fn();
    render(
      <AprovacaoIa
        {...props}
        aoManterOriginal={aoManterOriginal}
        estado={{ fase: "pronta", bullets: ["Desenvolvi APIs"] }}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /manter o meu texto/i }));
    expect(aoManterOriginal).toHaveBeenCalled();
  });

  it("falha da IA não bloqueia nada", async () => {
    // O planejamento é explícito: a IA nunca pode impedir o usuário de
    // gerar o currículo.
    const aoPedir = vi.fn();
    render(
      <AprovacaoIa
        {...props}
        aoPedir={aoPedir}
        estado={{
          fase: "erro",
          mensagem: "Não conseguimos organizar agora.",
          tentavel: true,
        }}
      />,
    );

    const aviso = screen.getByRole("status");
    expect(within(aviso).getByText(/não conseguimos organizar agora/i)).toBeDefined();

    await userEvent.click(screen.getByRole("button", { name: /tentar de novo/i }));
    expect(aoPedir).toHaveBeenCalled();
  });

  it("anuncia o processamento de forma educada", () => {
    render(<AprovacaoIa {...props} estado={{ fase: "pensando" }} />);
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
  });

  /**
   * O defeito relatado: sem token de IA no servidor, o botão existia,
   * parecia funcionar e não entregava nada. Um botão morto custa mais
   * confiança do que a ausência do botão.
   */
  it("sem IA no servidor, o botão nasce desabilitado e diz por quê", () => {
    render(
      <AprovacaoIa {...props} iaDisponivel={false} estado={{ fase: "ocioso" }} />,
    );

    expect(
      screen.getByRole("button", { name: /organizar com ajuda da ia/i }),
    ).toHaveProperty("disabled", true);

    // O motivo em texto, e não só no `title`: botão desabilitado sai da ordem
    // de tabulação, e tooltip sozinho não chega a quem usa teclado.
    expect(screen.getByText(/desligada neste ambiente/i)).toBeDefined();
  });

  it("com IA no servidor e texto escrito, o botão funciona", () => {
    render(<AprovacaoIa {...props} iaDisponivel estado={{ fase: "ocioso" }} />);

    expect(
      screen.getByRole("button", { name: /organizar com ajuda da ia/i }),
    ).toHaveProperty("disabled", false);
  });

  it("não oferece 'tentar de novo' quando repetir não muda nada", () => {
    // Ambiente sem IA configurada: o botão de repetir seria o mesmo clique
    // morto, uma tela depois.
    render(
      <AprovacaoIa
        {...props}
        estado={{
          fase: "erro",
          mensagem: "A ajuda da IA está desligada neste ambiente.",
          tentavel: false,
        }}
      />,
    );

    expect(screen.queryByRole("button", { name: /tentar de novo/i })).toBeNull();
    expect(screen.getByRole("status").textContent).toMatch(/desligada/i);
  });
});

describe("Habilidades", () => {
  const comTexto = (): CvData =>
    cv({ habilidades: { textoOriginal: "python, sql", itens: [], statusIa: "none" } });

  it("sem IA no servidor, desabilita a organização e explica", () => {
    render(
      <Habilidades
        cv={comTexto()}
        despachar={vi.fn()}
        estado={{ fase: "ocioso" }}
        iaDisponivel={false}
        aoPedirSugestao={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: /organizar com ajuda da ia/i }),
    ).toHaveProperty("disabled", true);
    expect(screen.getByText(/desligada neste ambiente/i)).toBeDefined();
  });

  it("o texto livre continua editável sem IA — o currículo sai igual", () => {
    // É esta a razão de a falha de IA nunca bloquear: o campo já é um
    // currículo válido.
    render(
      <Habilidades
        cv={comTexto()}
        despachar={vi.fn()}
        estado={{ fase: "ocioso" }}
        iaDisponivel={false}
        aoPedirSugestao={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/suas habilidades/i)).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("com IA e texto, o botão funciona", () => {
    render(
      <Habilidades
        cv={comTexto()}
        despachar={vi.fn()}
        estado={{ fase: "ocioso" }}
        iaDisponivel
        aoPedirSugestao={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: /organizar com ajuda da ia/i }),
    ).toHaveProperty("disabled", false);
  });
});

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  FORMAÇÃO: TÉRMINO SEMPRE, PORQUE É PREVISÃO DE FORMATURA                ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Decisão de produto: "2022 – atual" não diz quando a pessoa se forma, e é
 * exatamente isso que o recrutador quer saber. Então a formação não tem o
 * checkbox de período em aberto — quem ainda cursa declara pela Situação, que
 * já sai impressa no PDF — e o término aceita data no futuro.
 */
describe("Formacao", () => {
  const comFormacao = (extra: Partial<FormacaoItem> = {}): CvData =>
    cv({
      formacao: [
        novaFormacao({
          id: "f1",
          curso: "Análise de Sistemas",
          instituicao: "IFMG",
          periodo: { inicio: { ano: 2024, mes: 2 }, fim: { ano: 2027, mes: 12 } },
          ...extra,
        }),
      ],
    });

  it("não oferece 'ainda estou cursando' — isso é a Situação", () => {
    render(<Formacao cv={comFormacao()} despachar={vi.fn()} />);

    expect(screen.queryByLabelText(/cursando/i)).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    // E a Situação explica que é ela quem carrega essa informação.
    expect(screen.getByLabelText(/situação/i)).toBeDefined();
    expect(screen.getByText(/em andamento.*previsão de formatura/i)).toBeDefined();
  });

  it("o término se chama pelo que é: conclusão ou previsão", () => {
    render(<Formacao cv={comFormacao()} despachar={vi.fn()} />);
    expect(screen.getByLabelText(/conclusão \(ou previsão\): ano/i)).toBeDefined();
  });

  it("oferece anos à frente, até o teto que o schema aceita", () => {
    // Sem isso não há como registrar previsão de formatura: a lista ia só do
    // ano corrente para trás.
    render(<Formacao cv={comFormacao()} despachar={vi.fn()} />);

    const anos = screen.getByLabelText(/conclusão \(ou previsão\): ano/i);
    const opcoes = Array.from(anos.querySelectorAll("option")).map((o) => o.value);
    const teto = String(anoMaximo());

    expect(opcoes).toContain(teto);
    // Nada além do teto: opção oferecida que a validação recusa é armadilha.
    expect(Number(opcoes[0])).toBe(anoMaximo());
  });

  it("previsão no futuro não gera aviso nenhum", () => {
    render(<Formacao cv={comFormacao({ status: "em_andamento" })} despachar={vi.fn()} />);

    expect(screen.queryByText(/ainda não chegou/i)).toBeNull();
    expect(screen.queryByText(/está no futuro/i)).toBeNull();
  });

  it("'Concluído' com data futura continua avisando", () => {
    // O problema não é a data: é ela ao lado de "Concluído", que é o valor
    // inicial do campo.
    render(<Formacao cv={comFormacao({ status: "concluido" })} despachar={vi.fn()} />);

    expect(screen.getByText(/marcou "Concluído"/i)).toBeDefined();
  });

  it("currículo antigo com período em aberto não quebra a tela, e pede a data", () => {
    /**
     * `fim: "atual"` só existe em currículo gravado antes desta mudança. O
     * select mostra o início no lugar do término — mostrar a string deixaria o
     * campo descontrolado — e o aviso pede a data em vez de gravar sozinho uma
     * previsão que ninguém escolheu.
     */
    render(
      <Formacao
        cv={comFormacao({ periodo: { inicio: { ano: 2020, mes: 2 }, fim: "atual" } })}
        despachar={vi.fn()}
      />,
    );

    expect(
      screen.getByLabelText(/conclusão \(ou previsão\): ano/i),
    ).toHaveProperty("value", "2020");
    expect(screen.getByText(/falta a data de conclusão/i)).toBeDefined();
  });

  it("mostra o período como ele vai sair impresso", () => {
    /**
     * A linha de resumo usa o MESMO formatador do documento. É o que permite
     * conferir o período sem montar a frase de cabeça a partir de quatro
     * listas suspensas — e o que dá utilidade ao "atual", que antes sumia com
     * dois campos sem dizer o que tinha colocado no lugar.
     */
    render(<Formacao cv={comFormacao()} despachar={vi.fn()} />);
    expect(screen.getByText("fev/2024 – dez/2027")).toBeDefined();
  });

  it("os meses aparecem por extenso, não abreviados", () => {
    // "jan" é a convenção do DOCUMENTO e está certa no PDF. Numa lista
    // suspensa, onde há espaço, ela só parece formulário inacabado.
    render(<Formacao cv={comFormacao()} despachar={vi.fn()} />);

    const meses = screen.getAllByLabelText(/início: mês/i)[0]!;
    const opcoes = Array.from(meses.querySelectorAll("option")).map(
      (o) => o.textContent,
    );

    expect(opcoes).toContain("Fevereiro");
    expect(opcoes).not.toContain("fev");
    expect(opcoes).toHaveLength(12);
  });

  it("período invertido aparece inline, como na experiência", () => {
    render(
      <Formacao
        cv={comFormacao({
          periodo: { inicio: { ano: 2024, mes: 6 }, fim: { ano: 2020, mes: 1 } },
        })}
        despachar={vi.fn()}
      />,
    );

    expect(screen.getByText(/é anterior ao início/i)).toBeDefined();
  });
});
