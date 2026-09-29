import { describe, it, expect } from "vitest";
import { novaFormacao, type Formacao, type Periodo } from "@cv-express/schema";

import {
  diagnosticarPeriodo,
  diagnosticarFormacao,
  temErro,
} from "../coerencia";

/**
 * O defeito que esta suíte impede: o formulário aceitar um período incoerente
 * sem dizer nada.
 *
 * Hoje quem inverte as datas não vê aviso nenhum na tela, o botão "Continuar"
 * responde com "fim: A data de término não pode ser anterior à de início." no
 * rodapé, E o autosave para de gravar em silêncio, porque `salvarEtapa`
 * também recusa o período invertido.
 *
 * O relógio entra por parâmetro em todos os casos: um teste de data que
 * depende de `new Date()` passa hoje e falha em janeiro.
 */

const AGORA = new Date("2026-09-28T12:00:00Z");

const periodo = (inicio: Periodo["inicio"], fim: Periodo["fim"]): Periodo => ({
  inicio,
  fim,
});

describe("diagnosticarPeriodo", () => {
  it("não reclama de um período coerente", () => {
    const d = diagnosticarPeriodo(
      periodo({ ano: 2020, mes: 3 }, { ano: 2024, mes: 6 }),
      AGORA,
    );
    expect(d).toEqual([]);
  });

  it("não reclama de período em aberto", () => {
    // "atual" é o caso mais comum do formulário: o emprego de agora.
    expect(diagnosticarPeriodo(periodo({ ano: 2024, mes: 1 }, "atual"), AGORA)).toEqual(
      [],
    );
  });

  it("aceita começar e terminar no mesmo mês", () => {
    // Contrato de um mês existe, e é o valor que o checkbox de "atual"
    // desmarcado produz.
    const mesmo = { ano: 2024, mes: 5 };
    expect(diagnosticarPeriodo(periodo(mesmo, { ...mesmo }), AGORA)).toEqual([]);
  });

  it("aponta término anterior ao início, com as duas datas escritas", () => {
    const d = diagnosticarPeriodo(
      periodo({ ano: 2024, mes: 6 }, { ano: 2020, mes: 3 }),
      AGORA,
    );

    expect(d).toHaveLength(1);
    expect(d[0]?.severidade).toBe("erro");
    // Citar as datas evita o "qual das duas está errada?" — e são escritas
    // como o PDF as escreve.
    expect(d[0]?.mensagem).toContain("mar/2020");
    expect(d[0]?.mensagem).toContain("jun/2024");
    expect(d[0]?.sugestao).toMatch(/trocadas/i);
  });

  it("avisa sobre início no futuro sem chamar de erro", () => {
    // Combinado de emprego assinado para o mês que vem é caso real. Bloquear
    // seria errar contra quem está certo.
    const d = diagnosticarPeriodo(periodo({ ano: 2027, mes: 1 }, "atual"), AGORA);

    expect(d).toHaveLength(1);
    expect(d[0]?.severidade).toBe("aviso");
    expect(temErro(d)).toBe(false);
  });

  it("avisa que o término escolhido ainda não chegou, e ensina o caminho certo", () => {
    const d = diagnosticarPeriodo(
      periodo({ ano: 2024, mes: 1 }, { ano: 2027, mes: 5 }),
      AGORA,
    );

    expect(d.map((x) => x.severidade)).toEqual(["aviso"]);
    // O caminho para período em aberto é o checkbox, não uma data no futuro:
    // data futura congela, "atual" continua verdadeiro no ano que vem.
    expect(d[0]?.sugestao).toMatch(/marque a caixa/i);
  });

  it("desconfia de período implausível — o suspeito é o ano digitado errado", () => {
    // 1968 em vez de 2018: o erro de digitação mais comum num select de ano.
    const d = diagnosticarPeriodo(
      periodo({ ano: 1968, mes: 2 }, { ano: 2024, mes: 2 }),
      AGORA,
    );

    expect(d.some((x) => x.mensagem.includes("56 anos"))).toBe(true);
    expect(temErro(d)).toBe(false);
  });

  it("um período longo em aberto também é medido até hoje", () => {
    // Sem contar "atual" como hoje, o aviso nunca apareceria no caso mais
    // fácil de digitar errado: 1970 – atual.
    const d = diagnosticarPeriodo(periodo({ ano: 1970, mes: 1 }, "atual"), AGORA);
    expect(d.some((x) => x.mensagem.match(/\d+ anos/))).toBe(true);
  });

  it("toda mensagem vem com um caminho de ação", () => {
    // Aviso sem o que fazer vira culpa, não ajuda — a mesma regra do aviso de
    // páginas.
    const d = diagnosticarPeriodo(
      periodo({ ano: 2027, mes: 6 }, { ano: 2027, mes: 1 }),
      AGORA,
    );

    expect(d.length).toBeGreaterThan(1);
    for (const x of d) expect(x.sugestao.length).toBeGreaterThan(0);
  });
});

describe("diagnosticarFormacao", () => {
  const formacao = (extra: Partial<Formacao>): Formacao =>
    novaFormacao({
      curso: "Análise de Sistemas",
      instituicao: "IFMG",
      periodo: periodo({ ano: 2020, mes: 2 }, { ano: 2023, mes: 12 }),
      ...extra,
    });

  it("não reclama de concluído com término informado", () => {
    expect(diagnosticarFormacao(formacao({ status: "concluido" }), AGORA)).toEqual([]);
  });

  /**
   * ── Data futura em formação é PREVISÃO DE FORMATURA ──────────────────────
   *
   * A formação não tem o checkbox de período em aberto: "2022 – atual" não diz
   * quando a pessoa se forma, "2022 – dez/2027" diz. Logo, término no futuro é
   * o caso NORMAL de quem está cursando, e avisar sobre ele seria ruído em
   * cima do uso mais comum da etapa.
   */
  it("não reclama de previsão de formatura no futuro", () => {
    const d = diagnosticarFormacao(
      formacao({
        status: "em_andamento",
        periodo: periodo({ ano: 2024, mes: 2 }, { ano: 2028, mes: 12 }),
      }),
      AGORA,
    );

    expect(d).toEqual([]);
  });

  it("nem de curso que ainda vai começar", () => {
    // Matrícula feita para o semestre que vem é situação real.
    const d = diagnosticarFormacao(
      formacao({
        status: "em_andamento",
        periodo: periodo({ ano: 2027, mes: 2 }, { ano: 2030, mes: 12 }),
      }),
      AGORA,
    );

    expect(d).toEqual([]);
  });

  it("mas pega 'Concluído' com data que ainda não chegou", () => {
    /**
     * Aqui o problema não é a data futura: é ela ao lado de "Concluído", que é
     * o valor INICIAL do campo — ou seja, o erro fácil de cometer sem notar. O
     * PDF sairia com "Concluído · fev/2022 – dez/2028", e os dois lados são
     * impressos.
     */
    const d = diagnosticarFormacao(
      formacao({
        status: "concluido",
        periodo: periodo({ ano: 2022, mes: 2 }, { ano: 2028, mes: 12 }),
      }),
      AGORA,
    );

    expect(d).toHaveLength(1);
    expect(d[0]?.codigo).toBe("concluida_com_termino_futuro");
    expect(d[0]?.severidade).toBe("aviso");
    expect(d[0]?.sugestao).toMatch(/em andamento/i);
  });

  it("pede a data quando o currículo é antigo e tem período em aberto", () => {
    /**
     * Só chega aqui currículo gravado antes de a formação perder o checkbox. A
     * tela mostra o início no lugar do término, então pedir a data é mais
     * honesto do que gravar sozinho uma previsão que a pessoa não escolheu.
     */
    const d = diagnosticarFormacao(
      formacao({ status: "concluido", periodo: periodo({ ano: 2020, mes: 2 }, "atual") }),
      AGORA,
    );

    expect(d).toHaveLength(1);
    expect(d[0]?.codigo).toBe("formacao_sem_termino");
    expect(d[0]?.sugestao).toMatch(/previsão de formatura/i);
  });

  it("pega 'Em andamento' com término já vencido", () => {
    const d = diagnosticarFormacao(
      formacao({
        status: "em_andamento",
        periodo: periodo({ ano: 2018, mes: 2 }, { ano: 2022, mes: 12 }),
      }),
      AGORA,
    );

    expect(d).toHaveLength(1);
    expect(d[0]?.mensagem).toContain("dez/2022");
  });

  it("o aviso de 'Em andamento' vencido ensina a atualizar a previsão", () => {
    // Com o checkbox fora, mandar "marcar Ainda estou cursando" apontaria para
    // um controle que não existe mais.
    const d = diagnosticarFormacao(
      formacao({
        status: "em_andamento",
        periodo: periodo({ ano: 2018, mes: 2 }, { ano: 2022, mes: 12 }),
      }),
      AGORA,
    );

    expect(d[0]?.sugestao).toMatch(/previsão de formatura/i);
    expect(d[0]?.sugestao).not.toMatch(/cursando/i);
  });

  it("não inventa contradição para matrícula trancada com data", () => {
    expect(
      diagnosticarFormacao(formacao({ status: "trancado" }), AGORA),
    ).toEqual([]);
  });

  it("acumula o erro de data com o aviso de situação", () => {
    // Quem errou as duas coisas precisa ver as duas: mostrar uma só faria a
    // pessoa corrigir, clicar em Continuar e ser barrada de novo.
    const d = diagnosticarFormacao(
      formacao({
        status: "em_andamento",
        periodo: periodo({ ano: 2024, mes: 6 }, { ano: 2020, mes: 1 }),
      }),
      AGORA,
    );

    expect(d.map((x) => x.severidade)).toEqual(["erro", "aviso"]);
    expect(temErro(d)).toBe(true);
  });
});
