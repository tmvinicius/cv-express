import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { novoCv, novaExperiencia, type CvData } from "@cv-express/schema";

import { DadosPessoais } from "../etapas/DadosPessoais";
import { Objetivo } from "../etapas/Objetivo";
import { Experiencias } from "../etapas/Experiencias";
import { Idiomas } from "../etapas/Idiomas";
import { AprovacaoIa } from "../AprovacaoIa";

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
        estado={{ fase: "erro", mensagem: "Não conseguimos organizar agora." }}
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
});
