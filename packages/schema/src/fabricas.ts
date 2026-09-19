import { nanoid } from "nanoid";
import type {
  CvData,
  Experiencia,
  Formacao,
  Habilidade,
  Idioma,
  CategoriaHabilidade,
  NivelIdioma,
  NivelFormacao,
  StatusFormacao,
} from "./cv.js";
import type { DataMesAno, FimPeriodo } from "./data.js";

/**
 * Fábricas de itens vazios.
 *
 * Existem para que frontend e testes criem estruturas válidas sem repetir a
 * forma do dado. Quando um campo novo entrar no schema, é aqui que ele ganha
 * o valor inicial — em um lugar, não espalhado por cada tela que cria um item.
 */

export function novoId(): string {
  return nanoid(12);
}

function mesAtual(agora: Date = new Date()): DataMesAno {
  return { ano: agora.getUTCFullYear(), mes: agora.getUTCMonth() + 1 };
}

export function novaExperiencia(
  parcial: Partial<Experiencia> = {},
  agora?: Date,
): Experiencia {
  const inicio = mesAtual(agora);
  return {
    id: novoId(),
    cargo: "",
    empresa: "",
    periodo: { inicio, fim: "atual" as FimPeriodo },
    descricaoOriginal: "",
    bullets: [],
    statusIa: "none",
    ...parcial,
  };
}

export function novaFormacao(
  parcial: Partial<Formacao> = {},
  agora?: Date,
): Formacao {
  const inicio = mesAtual(agora);
  return {
    id: novoId(),
    curso: "",
    instituicao: "",
    nivel: "graduacao" as NivelFormacao,
    status: "concluido" as StatusFormacao,
    periodo: { inicio, fim: inicio },
    ...parcial,
  };
}

export function novoIdioma(parcial: Partial<Idioma> = {}): Idioma {
  return {
    id: novoId(),
    idioma: "",
    nivel: "intermediario" as NivelIdioma,
    ...parcial,
  };
}

export function novaHabilidade(
  nome: string,
  categoria: CategoriaHabilidade = "tecnica",
): Habilidade {
  return { id: novoId(), nome, categoria };
}

/**
 * Currículo vazio — o estado inicial de uma sessão nova.
 *
 * Note que ele NÃO passa no schema completo: `pessoal.nome`, `cidade` e
 * `email` são obrigatórios e estão vazios. Isso é intencional. O formulário
 * valida etapa por etapa; o documento só precisa estar inteiro na hora de
 * compilar. Um rascunho incompleto é um estado legítimo do produto, e tratá-lo
 * como inválido obrigaria o usuário a preencher tudo antes de qualquer
 * autosave — exatamente o que o planejamento quer evitar.
 */
export function novoCv(id: string = novoId(), agora: Date = new Date()): CvData {
  return {
    id,
    locale: "pt-BR",
    templateId: "classico",
    atualizadoEm: agora.toISOString(),
    pessoal: {
      nome: "",
      cidade: "",
      email: "",
    },
    objetivo: { texto: "" },
    experiencias: [],
    formacao: [],
    idiomas: [],
    habilidades: { textoOriginal: "", itens: [], statusIa: "none" },
  };
}
