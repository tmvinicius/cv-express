import {
  novoCv,
  novaExperiencia,
  novaFormacao,
  novoIdioma,
  novaHabilidade,
  LIMITES,
  type CvData,
} from "@cv-express/schema";

/**
 * As três fixtures exigidas pelo planejamento (seções 3.1 e 11).
 *
 * Ids fixos e escritos à mão, nunca gerados: nanoid produziria ids diferentes
 * a cada execução, e como o fieldId entra no .tex, os snapshots mudariam
 * sozinhos a cada rodada.
 */

/** Mínimo válido: só o cabeçalho. Prova que seções vazias somem. */
export function cvMinimo(): CvData {
  return {
    ...novoCv("fixture-minimo"),
    atualizadoEm: "2026-01-15T10:00:00.000Z",
    pessoal: {
      nome: "Ana Souza",
      cidade: "Belo Horizonte",
      email: "ana@exemplo.com",
    },
  };
}

/** Completo: todas as seções preenchidas, com acentuação e caracteres especiais. */
export function cvCompleto(): CvData {
  return {
    ...novoCv("fixture-completo"),
    atualizadoEm: "2026-01-15T10:00:00.000Z",
    pessoal: {
      nome: "João Conceição d'Ávila",
      idade: 34, // coletada — não deve aparecer no .tex
      cidade: "São Paulo",
      email: "joao@exemplo.com.br",
      telefone: "(11) 98888-7777",
      linkedin: "https://linkedin.com/in/joao_avila",
      github: "https://github.com/joao-avila",
    },
    objetivo: {
      texto:
        "Atuar como desenvolvedor backend em times que valorizem qualidade & entrega contínua.",
    },
    experiencias: [
      novaExperiencia({
        id: "exp-1",
        cargo: "Desenvolvedor Backend Sênior",
        empresa: "Acme & Cia",
        cidade: "São Paulo",
        periodo: { inicio: { ano: 2022, mes: 3 }, fim: "atual" },
        descricaoOriginal: "cuidei das apis",
        bullets: [
          "Desenvolvi APIs REST atendendo 100% das metas de disponibilidade",
          "Reduzi o custo de infraestrutura em R$ 50 mil/ano",
        ],
        statusIa: "applied",
      }),
      novaExperiencia({
        id: "exp-2",
        cargo: "Desenvolvedor Júnior",
        empresa: "Startup XYZ",
        periodo: { inicio: { ano: 2019, mes: 1 }, fim: { ano: 2022, mes: 2 } },
        // Sem bullets: exercita o fallback para descricaoOriginal.
        descricaoOriginal:
          "Trabalhei com manutenção de sistemas legados e integração de APIs de terceiros.",
        statusIa: "rejected",
      }),
    ],
    formacao: [
      novaFormacao({
        id: "form-1",
        curso: "Ciência da Computação",
        instituicao: "Universidade Federal de Minas Gerais",
        nivel: "graduacao",
        status: "concluido",
        periodo: { inicio: { ano: 2015, mes: 2 }, fim: { ano: 2018, mes: 12 } },
      }),
    ],
    idiomas: [
      novoIdioma({ id: "idi-1", idioma: "Inglês", nivel: "avancado" }),
      novoIdioma({ id: "idi-2", idioma: "Espanhol", nivel: "intermediario" }),
    ],
    habilidades: {
      textoOriginal: "python, sql, docker, trabalho em equipe",
      itens: [
        { ...novaHabilidade("Python", "tecnica"), id: "hab-1" },
        { ...novaHabilidade("SQL", "tecnica"), id: "hab-2" },
        { ...novaHabilidade("Docker", "ferramenta"), id: "hab-3" },
        { ...novaHabilidade("Trabalho em equipe", "comportamental"), id: "hab-4" },
      ],
      statusIa: "applied",
    },
  };
}

/**
 * Extremo: conteúdo hostil em todo campo de texto.
 *
 * Não é um currículo plausível — é o pior caso que o schema aceita. Se o .tex
 * gerado a partir daqui estiver íntegro, o escape está fazendo seu trabalho
 * no caminho completo, e não só em teste unitário isolado.
 */
export function cvExtremo(): CvData {
  const veneno = "\\input{/etc/passwd} } { $ & # ^ _ ~ % 100%";

  return {
    ...novoCv("fixture-extremo"),
    atualizadoEm: "2026-01-15T10:00:00.000Z",
    pessoal: {
      nome: veneno,
      cidade: veneno,
      email: "hostil@exemplo.com",
      telefone: veneno,
      linkedin: "https://exemplo.com/a_b%c#d",
    },
    objetivo: { texto: veneno },
    experiencias: [
      novaExperiencia({
        id: "exp-x",
        cargo: veneno,
        empresa: veneno,
        cidade: veneno,
        periodo: { inicio: { ano: 2020, mes: 1 }, fim: "atual" },
        descricaoOriginal: veneno,
        bullets: [veneno, "\\write18{rm -rf /}"],
        statusIa: "applied",
      }),
    ],
    formacao: [
      novaFormacao({
        id: "form-x",
        curso: veneno,
        instituicao: veneno,
        nivel: "mestrado",
        status: "em_andamento",
        periodo: { inicio: { ano: 2021, mes: 2 }, fim: { ano: 2023, mes: 6 } },
      }),
    ],
    idiomas: [{ id: "idi-x", idioma: veneno, nivel: "nativo" }],
    habilidades: {
      textoOriginal: veneno,
      itens: [
        { id: "hab-x1", nome: veneno.slice(0, LIMITES.HABILIDADE_MAX), categoria: "tecnica" },
        { id: "hab-x2", nome: "\\catcode`\\@=0", categoria: "ferramenta" },
      ],
      statusIa: "applied",
    },
  };
}
