import {
  campo,
  ordenarPorPeriodoDesc,
  type CvData,
  type Experiencia,
  type Formacao,
} from "@cv-express/schema";
import { formatadoresPara } from "./formatadores.js";

/**
 * O ViewModel: tudo já calculado, nada por decidir no template.
 *
 * Esta separação é o que faz o motor poder ser burro. Ordenação, formatação
 * de período, escolha entre bullets e texto original, agrupamento de
 * habilidades e montagem de fieldId acontecem aqui, em TypeScript tipado e
 * testável. O template só interpola e decide se a seção existe.
 *
 * É também o que cumpre a exigência do planejamento de que "toda formatação
 * acontece em helper, nunca no template" — sem precisar de helpers no motor.
 */

export interface VmLink {
  rotulo: string;
  /** URL crua. O template a interpola com {{& url }}, nunca com {{ url }}. */
  url: string;
}

export interface VmExperiencia {
  campoCargo: string;
  campoEmpresa: string;
  campoPeriodo: string;
  cargo: string;
  empresa: string;
  cidade?: string;
  periodo: string;
  /**
   * Sinalizador separado da lista, e não `bullets.length > 0` no template.
   *
   * Um bloco sobre uma LISTA itera; um bloco sobre um booleano renderiza uma
   * vez. Para abrir o ambiente `cvBullets` uma única vez e só então percorrer
   * os itens, são necessárias as duas coisas — testar com a própria lista
   * produziria um `\begin{cvBullets}` por bullet.
   */
  temBullets: boolean;
  bullets: string[];
  /** Preenchido quando NÃO há bullets — o fallback da seção 3.3. */
  descricao?: string;
}

export interface VmFormacao {
  campoCurso: string;
  curso: string;
  instituicao: string;
  nivel: string;
  status: string;
  periodo: string;
}

export interface VmIdioma {
  campoIdioma: string;
  idioma: string;
  nivel: string;
}

export interface VmGrupoHabilidades {
  rotulo: string;
  /** Já juntos por vírgula: o template não faz junção. */
  nomes: string;
}

export interface ViewModel {
  /**
   * Presença de cada seção, como booleano.
   *
   * O arquivo-mestre usa estes sinalizadores para decidir se inclui o partial.
   * Não dá para testar a própria lista ali: um bloco sobre lista ITERA e troca
   * o contexto para o item, e o partial perderia o acesso a `secoes` e ao
   * resto do ViewModel. O booleano renderiza uma vez, preservando o contexto.
   */
  tem: {
    objetivo: boolean;
    experiencias: boolean;
    formacao: boolean;
    habilidades: boolean;
    idiomas: boolean;
  };
  secoes: Record<string, string>;
  pessoal: {
    campoNome: string;
    nome: string;
    cidade: string;
    email: string;
    telefone?: string;
    links: VmLink[];
  };
  objetivo?: { campoTexto: string; texto: string };
  experiencias: VmExperiencia[];
  formacao: VmFormacao[];
  idiomas: VmIdioma[];
  habilidades: VmGrupoHabilidades[];
}

function montarExperiencia(
  exp: Experiencia,
  fmt: ReturnType<typeof formatadoresPara>,
): VmExperiencia {
  /**
   * A decisão bullets × descrição original (seção 3.3 do planejamento).
   *
   * O critério é a existência de bullets, e não o statusIa. Os dois quase
   * sempre concordam, mas quando divergem — statusIa "applied" com bullets
   * apagados à mão, por exemplo — o que importa é o que existe para imprimir.
   * Confiar no status deixaria a experiência sair vazia do PDF, e o
   * planejamento é explícito: não existe estado em que a experiência suma.
   */
  const temBullets = exp.bullets.length > 0;

  const base = {
    campoCargo: campo.experiencia(exp.id, "cargo"),
    campoEmpresa: campo.experiencia(exp.id, "empresa"),
    campoPeriodo: campo.experiencia(exp.id, "periodo"),
    cargo: exp.cargo,
    empresa: exp.empresa,
    periodo: fmt.periodo(exp.periodo),
    temBullets,
    bullets: temBullets ? [...exp.bullets] : [],
  };

  // `exactOptionalPropertyTypes` está ligado: a chave só entra quando há valor,
  // em vez de existir com `undefined`. É o que permite ao template usar
  // {{# descricao }} como teste de existência confiável.
  return {
    ...base,
    ...(exp.cidade !== undefined ? { cidade: exp.cidade } : {}),
    ...(!temBullets && exp.descricaoOriginal !== ""
      ? { descricao: exp.descricaoOriginal }
      : {}),
  };
}

function montarFormacao(
  f: Formacao,
  fmt: ReturnType<typeof formatadoresPara>,
): VmFormacao {
  return {
    campoCurso: campo.formacao(f.id, "curso"),
    curso: f.curso,
    instituicao: f.instituicao,
    nivel: fmt.nivelFormacao(f.nivel),
    status: fmt.statusFormacao(f.status),
    periodo: fmt.periodo(f.periodo),
  };
}

export function construirViewModel(cv: CvData): ViewModel {
  const fmt = formatadoresPara(cv.locale);

  const links: VmLink[] = [];
  if (cv.pessoal.linkedin) links.push({ rotulo: "LinkedIn", url: cv.pessoal.linkedin });
  if (cv.pessoal.github) links.push({ rotulo: "GitHub", url: cv.pessoal.github });
  if (cv.pessoal.portfolio) links.push({ rotulo: "Portfólio", url: cv.pessoal.portfolio });

  const gruposHabilidades = fmt.habilidades(cv.habilidades.itens);

  return {
    tem: {
      objetivo: cv.objetivo.texto !== "",
      experiencias: cv.experiencias.length > 0,
      formacao: cv.formacao.length > 0,
      habilidades: gruposHabilidades.length > 0,
      idiomas: cv.idiomas.length > 0,
    },

    secoes: fmt.dic.secoes,

    pessoal: {
      campoNome: campo.pessoal("nome"),
      nome: cv.pessoal.nome,
      cidade: cv.pessoal.cidade,
      email: cv.pessoal.email,
      ...(cv.pessoal.telefone !== undefined
        ? { telefone: cv.pessoal.telefone }
        : {}),
      links,
      // Note o que NÃO está aqui: idade. Ela é coletada e fica no CvData, mas
      // não entra no ViewModel, então não tem como chegar ao PDF nem por
      // engano de template. A decisão "coletar sem imprimir" é aplicada
      // estruturalmente, e não por disciplina.
    },

    ...(cv.objetivo.texto !== ""
      ? { objetivo: { campoTexto: campo.objetivo(), texto: cv.objetivo.texto } }
      : {}),

    // Ordenadas do mais recente para o mais antigo, com desempate
    // determinístico — requisito do cache por contentHash.
    experiencias: ordenarPorPeriodoDesc(cv.experiencias).map((e) =>
      montarExperiencia(e, fmt),
    ),

    formacao: ordenarPorPeriodoDesc(cv.formacao).map((f) => montarFormacao(f, fmt)),

    idiomas: cv.idiomas.map((i) => ({
      campoIdioma: campo.idioma(i.id, "idioma"),
      idioma: i.idioma,
      nivel: fmt.nivelIdioma(i.nivel),
    })),

    habilidades: gruposHabilidades.map((g) => ({
      rotulo: g.rotulo,
      nomes: g.nomes.join(", "),
    })),
  };
}
