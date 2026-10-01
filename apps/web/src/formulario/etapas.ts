import {
  parseFieldId,
  dadosPessoaisSchema,
  objetivoSchema,
  experienciaSchema,
  formacaoSchema,
  idiomaSchema,
  habilidadesSchema,
  type CvData,
} from "@cv-express/schema";

/**
 * As 8 etapas do formulário, declarativas.
 *
 * Cada etapa sabe validar a si mesma reaproveitando o SUB-SCHEMA da sua seção,
 * que já existe em @cv-express/schema. Isso resolve um problema que aparece só
 * agora: `validarCv` exige o currículo inteiro, mas o formulário precisa
 * validar etapa por etapa — rascunho incompleto é estado legítimo, e travar o
 * avanço por causa de um campo que ainda nem foi mostrado seria absurdo.
 *
 * A alternativa seria escrever nove schemas novos, que sairiam de sincronia
 * com o schema canônico no primeiro campo acrescentado. Aqui não há schema
 * novo: só se escolhe qual pedaço do currículo validar.
 */

/**
 * DIVERGE DO PLANEJAMENTO, que previa 9 etapas começando por "boas-vindas".
 *
 * A etapa não existe aqui, e a razão está escrita em `app/page.tsx`: "sem tela
 * de login, sem 'criar conta', sem escolha nenhuma antes de começar. Cada
 * decisão a menos antes do primeiro campo é uma desistência a menos." Uma tela
 * que só diz o que vai acontecer e pede um clique é exatamente uma decisão a
 * mais antes do primeiro campo.
 *
 * Ela chegou a existir em `ETAPAS` sem bloco de renderização, e o efeito era
 * concreto: em `pessoal`, `voltar` devolvia "boas-vindas", o botão Voltar
 * aparecia, e o primeiro clique possível do produto levava a uma tela em
 * branco com uma barra de progresso. Com a etapa fora, `pessoal` é a primeira
 * e `voltar("pessoal")` devolve `null` sozinho — sem caso especial em lugar
 * nenhum.
 *
 * Se um dia a tela for construída, este é o ponto onde a decisão se reabre.
 */
export type IdEtapa =
  | "pessoal"
  | "objetivo"
  | "experiencias"
  | "formacao"
  | "idiomas"
  | "habilidades"
  | "gerando"
  | "preview";

export interface Etapa {
  id: IdEtapa;
  /** Posição na barra de progresso. */
  rotulo: string;
  /**
   * Etapa opcional pode ser pulada mesmo vazia.
   *
   * O planejamento pede que isso seja VISÍVEL para o usuário — alguém sem
   * segundo idioma não pode achar que travou.
   */
  opcional: boolean;
  /**
   * Conta para a barra de progresso.
   *
   * "gerando" e preview não contam: vêm depois do preenchimento. Incluí-las
   * faria a barra chegar a 100% antes de a pessoa terminar — animador e falso.
   */
  contaNoProgresso: boolean;
  /** Erros desta etapa, ou lista vazia. Nunca olha o resto do currículo. */
  validar: (cv: CvData) => string[];
  /** A pessoa já mexeu nesta etapa? Usado para marcar o progresso. */
  preenchida: (cv: CvData) => boolean;
}

/** Extrai mensagens legíveis de um resultado do Zod. */
function errosDe(resultado: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }): string[] {
  if (resultado.success || !resultado.error) return [];
  return resultado.error.issues.map((i) =>
    i.path.length > 0 ? `${i.path.join(".")}: ${i.message}` : i.message,
  );
}

/** Valida cada item de uma lista e devolve os erros com o índice na frente. */
function errosDaLista<T>(
  itens: readonly T[],
  valida: (item: T) => { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } },
  nomeItem: string,
): string[] {
  return itens.flatMap((item, i) =>
    errosDe(valida(item)).map((e) => `${nomeItem} ${i + 1} — ${e}`),
  );
}

export const ETAPAS: readonly Etapa[] = [
  {
    id: "pessoal",
    rotulo: "Seus dados",
    opcional: false,
    contaNoProgresso: true,
    validar: (cv) => errosDe(dadosPessoaisSchema.safeParse(cv.pessoal)),
    preenchida: (cv) => cv.pessoal.nome !== "" && cv.pessoal.email !== "",
  },
  {
    id: "objetivo",
    rotulo: "Objetivo",
    // Obrigatório — e a regra mora AQUI, de propósito.
    //
    // `objetivoSchema.texto` não tem `.min(1)`, e não pode ter: o mesmo schema
    // valida o autosave, que precisa aceitar rascunho vazio. Pôr a exigência
    // lá faria o formulário recusar gravar enquanto a pessoa ainda não
    // escreveu o objetivo — e o sintoma ("não salvou") apareceria longe da
    // causa. Quem quiser mexer nisso tem de mexer também em
    // VAZIO_PERMITIDO_EM_RASCUNHO (acoes/sessao.ts).
    //
    // Sem esta linha, `opcional: false` era decorativo: `validar` devolvia []
    // com texto vazio, `avancar` deixava passar e `prontoParaGerar` não
    // acusava pendência — enquanto `preenchida` exigia texto, então a barra
    // nunca chegava a 100% para quem pulou. O botão dizia "pode gerar" e a
    // barra dizia "falta coisa", sobre o mesmo campo.
    opcional: false,
    contaNoProgresso: true,
    validar: (cv) => {
      const erros = errosDe(objetivoSchema.safeParse(cv.objetivo));
      if (cv.objetivo.texto.trim() === "") {
        erros.push("Objetivo: escreva uma frase sobre o que você procura.");
      }
      return erros;
    },
    preenchida: (cv) => cv.objetivo.texto.trim() !== "",
  },
  {
    id: "experiencias",
    rotulo: "Experiências",
    // Opcional porque primeiro emprego existe. Exigir experiência de quem
    // está começando é justamente travar quem mais precisa do produto.
    opcional: true,
    contaNoProgresso: true,
    validar: (cv) =>
      errosDaLista(cv.experiencias, (e) => experienciaSchema.safeParse(e), "Experiência"),
    preenchida: (cv) => cv.experiencias.length > 0,
  },
  {
    id: "formacao",
    rotulo: "Formação",
    opcional: true,
    contaNoProgresso: true,
    validar: (cv) =>
      errosDaLista(cv.formacao, (f) => formacaoSchema.safeParse(f), "Formação"),
    preenchida: (cv) => cv.formacao.length > 0,
  },
  {
    id: "idiomas",
    rotulo: "Idiomas",
    opcional: true,
    contaNoProgresso: true,
    validar: (cv) => errosDaLista(cv.idiomas, (i) => idiomaSchema.safeParse(i), "Idioma"),
    preenchida: (cv) => cv.idiomas.length > 0,
  },
  {
    id: "habilidades",
    rotulo: "Habilidades",
    opcional: true,
    contaNoProgresso: true,
    validar: (cv) => errosDe(habilidadesSchema.safeParse(cv.habilidades)),
    preenchida: (cv) =>
      cv.habilidades.textoOriginal.trim() !== "" || cv.habilidades.itens.length > 0,
  },
  {
    id: "gerando",
    rotulo: "Gerando",
    opcional: false,
    contaNoProgresso: false,
    validar: () => [],
    preenchida: () => true,
  },
  {
    id: "preview",
    rotulo: "Seu currículo",
    opcional: false,
    contaNoProgresso: false,
    validar: () => [],
    preenchida: () => true,
  },
] as const;

/**
 * A string veio da URL e é mesmo uma etapa?
 *
 * `?etapa=` é texto que qualquer pessoa digita, cola ou guarda nos favoritos.
 * A página fazia `etapa as IdEtapa` sem conferir, e um valor desconhecido
 * chegava até `podeIrPara`, que lia `ETAPAS[-1].validar` e derrubava o
 * render com erro 500. O caso mais provável nem é malícia: é o link antigo
 * para "boas-vindas", uma etapa que existiu e foi removida.
 */
export function ehIdEtapa(valor: unknown): valor is IdEtapa {
  return typeof valor === "string" && ETAPAS.some((e) => e.id === valor);
}

/** A etapa pedida na URL, ou a primeira quando o pedido não vale. */
export function etapaDaUrl(valor: string | undefined): IdEtapa {
  return ehIdEtapa(valor) ? valor : "pessoal";
}

export function etapaPorId(id: IdEtapa): Etapa {
  const e = ETAPAS.find((x) => x.id === id);
  if (!e) throw new Error(`Etapa desconhecida: ${id}`);
  return e;
}

export function indiceDa(id: IdEtapa): number {
  return ETAPAS.findIndex((e) => e.id === id);
}

/** Seções cujo conteúdo é uma LISTA — as únicas em que "qual item" existe. */
const SECOES_DE_LISTA = new Set<IdEtapa>(["experiencias", "formacao", "idiomas"]);

export interface DestinoDeCampo {
  etapa: IdEtapa;
  /** O item específico, quando o id apontava para um. */
  itemId?: string;
}

/**
 * Para onde levar quem clicou num campo ou numa seção.
 *
 * Recebe os ids do painel de seções (`experiencias.<id>`) e das sugestões de
 * corte (`experiencias.<id>.cargo`), e devolve a etapa MAIS o item.
 *
 * O item é a razão de esta função existir. Antes só se lia o primeiro
 * segmento: clicar em "Experiência 3" levava à etapa de experiências sem
 * rolar até ela nem focar nada, e com cinco experiências na tela a pessoa
 * tinha de procurar qual ela mesma acabara de pedir. A sugestão de corte era
 * pior ainda — ela diz exatamente qual cargo encurtar, e o clique entregava a
 * lista inteira.
 *
 * Um id que não corresponde a etapa de dados cai em "pessoal": levar a pessoa
 * ao começo do formulário é melhor do que um clique que não faz nada.
 */
export function destinoDoCampo(fieldId: string): DestinoDeCampo {
  const partes = fieldId.split(".");
  const primeiro = partes[0];
  const etapa = ETAPAS.find((e) => e.id === primeiro && e.contaNoProgresso);
  if (!etapa) return { etapa: "pessoal" };

  if (!SECOES_DE_LISTA.has(etapa.id)) return { etapa: etapa.id };

  // Forma completa (`experiencias.<id>.cargo`): `parseFieldId` é quem sabe se
  // o campo existe de verdade, então ele decide. É o uso imediato que essa
  // função esperava desde que foi escrita.
  const ref = parseFieldId(fieldId);
  if (ref && "itemId" in ref) return { etapa: etapa.id, itemId: ref.itemId };

  // Forma curta (`experiencias.<id>`), que é a que o painel de seções emite.
  const itemId = partes[1];
  return itemId ? { etapa: etapa.id, itemId } : { etapa: etapa.id };
}

/** Só a etapa. Mantida porque a maioria dos chamadores não quer o item. */
export function etapaDoCampo(fieldId: string): IdEtapa {
  return destinoDoCampo(fieldId).etapa;
}
