import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { novoCv, novaExperiencia, type CvData } from "@cv-express/schema";

import { TrilhaEtapas } from "../TrilhaEtapas";
import { calcularProgresso } from "../../formulario/maquina";
import { destinoDoCampo } from "../../formulario/etapas";

afterEach(cleanup);

/**
 * A trilha existe para responder três perguntas que o formulário antigo não
 * respondia: onde estou, quais são as outras etapas e o que já está pronto.
 *
 * Os testes consultam por papel e texto, como uma tecnologia assistiva
 * enxerga — a aparência vem dos tokens e vai mudar; o que não pode mudar é o
 * estado ficar legível sem depender de cor.
 */

const cvComPessoal = (): CvData => ({
  ...novoCv("t"),
  pessoal: { nome: "Ana Souza", cidade: "Belo Horizonte", email: "ana@exemplo.com" },
});

const cvComObjetivo = (): CvData => ({
  ...cvComPessoal(),
  objetivo: { texto: "Atuar com desenvolvimento backend." },
});

function montar(etapa: Parameters<typeof calcularProgresso>[0], cv: CvData) {
  const aoEscolher = vi.fn();
  render(
    <TrilhaEtapas progresso={calcularProgresso(etapa, cv)} aoEscolher={aoEscolher} />,
  );
  return { aoEscolher };
}

describe("TrilhaEtapas", () => {
  it("lista as seis etapas com nome", () => {
    montar("pessoal", novoCv("t"));

    const trilha = screen.getByRole("navigation", { name: /etapas do formulário/i });
    for (const rotulo of [
      "Seus dados",
      "Objetivo",
      "Experiências",
      "Formação",
      "Idiomas",
      "Habilidades",
    ]) {
      expect(within(trilha).getByText(rotulo)).toBeDefined();
    }
  });

  it("marca onde a pessoa está com aria-current", () => {
    // É o que faz o leitor de tela anunciar "etapa atual" em vez de deixar a
    // posição só na cor.
    montar("objetivo", cvComPessoal());

    const atual = document.querySelector('[aria-current="step"]');
    expect(atual?.textContent).toContain("Objetivo");
  });

  it("diz o estado em palavras, não só em cor", () => {
    /**
     * Cor sozinha não comunica para quem tem daltonismo (WCAG 1.4.1) nem para
     * quem usa leitor de tela. Cada etapa carrega o estado escrito.
     */
    montar("objetivo", cvComPessoal());

    expect(screen.getByText(/etapa 1, concluída/i)).toBeDefined();
    expect(screen.getByText(/onde você está/i)).toBeDefined();
  });

  it("deixa voltar a uma etapa anterior com um clique", async () => {
    // O caso de uso principal: corrigir uma coisa só, sem refazer o caminho.
    const { aoEscolher } = montar("habilidades", cvComObjetivo());

    await userEvent.click(screen.getByRole("button", { name: /seus dados/i }));

    expect(aoEscolher).toHaveBeenCalledWith("pessoal");
  });

  it("a etapa atual não é botão — clicar nela não teria efeito", () => {
    montar("objetivo", cvComPessoal());

    expect(screen.queryByRole("button", { name: /objetivo/i })).toBeNull();
    expect(screen.getByText("Objetivo")).toBeDefined();
  });

  it("etapa inalcançável não vira botão desabilitado: vira texto", () => {
    /**
     * Um botão cinza convida ao clique e não responde; desabilitado de
     * verdade, sai da ordem de tabulação sem dizer por quê. Sem afordância
     * não há clique morto — e o motivo fica escrito para quem não vê a trilha.
     */
    montar("pessoal", novoCv("t"));

    expect(screen.queryByRole("button", { name: /habilidades/i })).toBeNull();
    // Num currículo em branco, tudo depois de "Seus dados" está fora de
    // alcance — e cada uma dessas etapas diz por quê.
    expect(
      screen.getAllByText(/disponível depois das etapas anteriores/i),
    ).toHaveLength(5);
  });

  it("mostra que a etapa é opcional", () => {
    // Alguém sem segundo idioma não pode achar que travou.
    montar("experiencias", cvComObjetivo());
    expect(screen.getAllByText("opcional").length).toBeGreaterThanOrEqual(3);
  });

  it("etapa pulada aparece como resolvida, e não como falha", () => {
    // Pular é decisão legítima de quem está no primeiro emprego. O texto
    // precisa soar assim.
    montar("formacao", cvComObjetivo());
    expect(screen.getByText(/pulada, e está tudo bem/i)).toBeDefined();
  });

  it("o estado de cada etapa é o mesmo que a barra usa", () => {
    /**
     * O defeito relatado: barra e contador discordando. Aqui se prova que a
     * trilha não recalcula nada — ela desenha o que `calcularProgresso`
     * mandou, que é o mesmo insumo da barra.
     */
    const cv: CvData = {
      ...cvComObjetivo(),
      experiencias: [novaExperiencia({ cargo: "Dev", empresa: "Acme" })],
    };
    const progresso = calcularProgresso("formacao", cv);

    render(<TrilhaEtapas progresso={progresso} aoEscolher={vi.fn()} />);

    const concluidas = progresso.etapas.filter((e) => e.estado === "concluida");
    expect(concluidas).toHaveLength(3); // pessoal, objetivo, experiências
    for (const e of concluidas) {
      expect(
        screen.getByText(new RegExp(`etapa ${e.posicao}.*concluída`, "i")),
      ).toBeDefined();
    }
  });
});

describe("o clique leva o item, não só a etapa", () => {
  /**
   * O defeito que estes testes impedem: `PainelSecoes` emitir
   * `experiencias.<id>` e `sugestoesDeCorte` emitir
   * `experiencias.<id>.cargo`, e a navegação jogar fora tudo depois do
   * primeiro segmento. Clicar em "Experiência 3" abria a lista inteira e a
   * pessoa tinha de procurar de novo qual ela mesma pedira.
   */
  it("extrai o item do id do painel de seções", () => {
    expect(destinoDoCampo("experiencias.exp-1")).toEqual({
      etapa: "experiencias",
      itemId: "exp-1",
    });
  });

  it("extrai o item do id de uma sugestão de corte", () => {
    expect(destinoDoCampo("experiencias.exp-1.cargo")).toEqual({
      etapa: "experiencias",
      itemId: "exp-1",
    });
  });

  it("seções sem lista não inventam item", () => {
    // "objetivo" e "habilidades" são seção única: um itemId ali não
    // significaria nada e faria a lista procurar um id que não existe.
    expect(destinoDoCampo("objetivo")).toEqual({ etapa: "objetivo" });
    expect(destinoDoCampo("habilidades")).toEqual({ etapa: "habilidades" });
  });

  it("id desconhecido leva ao começo, sem item", () => {
    // Melhor levar a pessoa ao início do formulário do que um clique morto.
    expect(destinoDoCampo("inexistente.abc.def")).toEqual({ etapa: "pessoal" });
  });
});
