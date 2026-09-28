import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  novoCv,
  novaExperiencia,
  novoIdioma,
  type CvData,
} from "@cv-express/schema";

import { sugerirCortes } from "../sugestoesDeCorte";
import { AvisoPaginas } from "../../componentes/AvisoPaginas";
import { PainelSecoes, listarSecoes } from "../../componentes/PainelSecoes";
import { Preview } from "../../componentes/Preview";

afterEach(cleanup);

const base = (extra: Partial<CvData> = {}): CvData => ({ ...novoCv("t"), ...extra });

describe("onde cortar", () => {
  /**
   * "Aviso sem caminho de ação vira culpa, não ajuda." Estes testes garantem
   * que o aviso sempre aponta algo concreto.
   */
  it("aponta a experiência mais longa", () => {
    const cv = base({
      experiencias: [
        novaExperiencia({
          id: "curta",
          cargo: "Estagiário",
          empresa: "A",
          descricaoOriginal: "ajudei o time",
        }),
        novaExperiencia({
          id: "longa",
          cargo: "Analista Sênior",
          empresa: "B",
          descricaoOriginal: "x".repeat(600),
        }),
      ],
    });

    const sugestoes = sugerirCortes(cv);
    expect(sugestoes[0]?.texto).toContain("Analista Sênior");
    expect(sugestoes[0]?.fieldId).toBe("experiencias.longa.cargo");
  });

  it("mede os bullets quando eles existem, não o texto original", () => {
    // Depois da IA, o que ocupa espaço no PDF são os bullets.
    const cv = base({
      experiencias: [
        novaExperiencia({
          id: "e1",
          cargo: "Dev",
          empresa: "A",
          descricaoOriginal: "curto",
          bullets: ["y".repeat(400)],
          statusIa: "applied",
        }),
      ],
    });

    expect(sugerirCortes(cv)[0]?.fieldId).toBe("experiencias.e1.cargo");
  });

  it("aponta a experiência mais antiga quando há várias", () => {
    const cv = base({
      experiencias: [
        novaExperiencia({
          id: "nova",
          cargo: "Atual",
          empresa: "A",
          descricaoOriginal: "z".repeat(500),
          periodo: { inicio: { ano: 2023, mes: 1 }, fim: "atual" },
        }),
        novaExperiencia({
          id: "media",
          cargo: "Do meio",
          empresa: "B",
          periodo: { inicio: { ano: 2018, mes: 1 }, fim: { ano: 2022, mes: 12 } },
        }),
        novaExperiencia({
          id: "antiga",
          cargo: "Primeiro emprego",
          empresa: "C",
          periodo: { inicio: { ano: 2014, mes: 1 }, fim: { ano: 2017, mes: 12 } },
        }),
      ],
    });

    const textos = sugerirCortes(cv).map((s) => s.texto).join(" ");
    expect(textos).toContain("Primeiro emprego");
  });

  it("aponta objetivo longo demais", () => {
    const cv = base({ objetivo: { texto: "a".repeat(500) } });
    const s = sugerirCortes(cv);
    expect(s.some((x) => x.fieldId === "objetivo")).toBe(true);
  });

  it("nunca devolve lista vazia", () => {
    // Silêncio seria pior: a pessoa ficaria sabendo do problema sem nenhuma
    // pista do que fazer.
    expect(sugerirCortes(base()).length).toBeGreaterThan(0);
  });
});

describe("AvisoPaginas", () => {
  it("não aparece com uma página", () => {
    const { container } = render(
      <AvisoPaginas paginas={1} sugestoes={[{ texto: "qualquer" }]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("deixa claro que é recomendação, não impedimento", () => {
    render(<AvisoPaginas paginas={2} sugestoes={[{ texto: "Encurte X" }]} />);

    expect(screen.getByText(/2 páginas/)).toBeDefined();
    // O tom importa: quem monta currículo costuma estar numa situação
    // difícil, e um aviso que soe como reprovação cobra um preço sem
    // oferecer nada.
    expect(screen.getByText(/pode baixar assim mesmo/i)).toBeDefined();
  });

  it("leva a pessoa até o campo sugerido", async () => {
    const aoIrPara = vi.fn();
    render(
      <AvisoPaginas
        paginas={2}
        sugestoes={[{ texto: "Encurte a experiência X", fieldId: "experiencias.e1.cargo" }]}
        aoIrPara={aoIrPara}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /encurte/i }));
    expect(aoIrPara).toHaveBeenCalledWith("experiencias.e1.cargo");
  });
});

describe("PainelSecoes — o caminho de edição que funciona", () => {
  /**
   * O "plano B" da seção 7 é o caminho principal desta versão. A edição por
   * clique no PDF depende de coordenadas do .aux e é aprimoramento: se o mapa
   * vier vazio, o produto continua inteiro por aqui.
   */
  const cv = base({
    pessoal: { nome: "Ana Souza", cidade: "BH", email: "ana@exemplo.com" },
    objetivo: { texto: "Atuar com desenvolvimento backend em times ágeis." },
    experiencias: [
      novaExperiencia({ id: "e1", cargo: "Desenvolvedora", empresa: "Acme" }),
    ],
    idiomas: [novoIdioma({ id: "i1", idioma: "Inglês", nivel: "avancado" })],
  });

  it("lista uma entrada por trecho editável", () => {
    const secoes = listarSecoes(cv);
    const ids = secoes.map((s) => s.id);

    expect(ids).toContain("pessoal");
    expect(ids).toContain("objetivo");
    expect(ids).toContain("experiencias.e1");
    expect(ids).toContain("idiomas");
  });

  it("omite seções vazias", () => {
    const ids = listarSecoes(base()).map((s) => s.id);
    expect(ids).toEqual(["pessoal"]);
  });

  it("identifica cada item pelo conteúdo, não por número", () => {
    // "Experiência 2" não ajuda ninguém a achar o que quer corrigir.
    render(<PainelSecoes cv={cv} aoEscolher={vi.fn()} />);

    expect(screen.getByText("Desenvolvedora")).toBeDefined();
    expect(screen.getByText("Acme")).toBeDefined();
  });

  it("avisa quando um item está sem título", () => {
    const semCargo = base({
      experiencias: [novaExperiencia({ id: "e1", cargo: "", empresa: "Acme" })],
    });
    render(<PainelSecoes cv={semCargo} aoEscolher={vi.fn()} />);

    expect(screen.getByText(/sem cargo/i)).toBeDefined();
  });

  it("leva à seção escolhida", async () => {
    const aoEscolher = vi.fn();
    render(<PainelSecoes cv={cv} aoEscolher={aoEscolher} />);

    await userEvent.click(screen.getByText("Desenvolvedora"));
    expect(aoEscolher).toHaveBeenCalledWith("experiencias.e1");
  });

  it("marca a seção ativa para tecnologia assistiva", () => {
    render(<PainelSecoes cv={cv} secaoAtiva="objetivo" aoEscolher={vi.fn()} />);

    const ativo = screen
      .getAllByRole("button")
      .find((b) => b.getAttribute("aria-current") === "true");
    expect(ativo?.textContent).toContain("Objetivo");
  });
});

describe("Preview", () => {
  it("anuncia a geração de forma educada", () => {
    render(<Preview estado={{ fase: "gerando" }} nomeArquivo="cv.pdf" />);

    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toContain("Montando");
  });

  it("no erro, diz que o currículo continua salvo", async () => {
    // A pessoa acabou de preencher tudo. Uma tela de erro sem essa frase
    // faria parecer que o trabalho se perdeu.
    const aoTentarDeNovo = vi.fn();
    render(
      <Preview
        estado={{ fase: "erro", mensagem: "Não conseguimos montar o PDF." }}
        nomeArquivo="cv.pdf"
        aoTentarDeNovo={aoTentarDeNovo}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain("continua salvo");

    await userEvent.click(screen.getByRole("button", { name: /tentar de novo/i }));
    expect(aoTentarDeNovo).toHaveBeenCalled();
  });

  it("base64 corrompido não derruba a página", () => {
    // Preferível mostrar o estado vazio a estourar a árvore do React inteira.
    expect(() =>
      render(
        <Preview
          estado={{ fase: "pronto", pdfBase64: "isso não é base64 %%%", paginas: 1 }}
          nomeArquivo="cv.pdf"
        />,
      ),
    ).not.toThrow();
  });
});
