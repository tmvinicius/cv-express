import type { TipoDeUso } from "./contraste";

/**
 * A paleta, como DADO.
 *
 * Declarada em TypeScript e não só em CSS para que o teste de contraste possa
 * lê-la. Os valores aqui e os de tokens.css precisam bater — há um teste que
 * verifica isso, porque duas fontes de verdade que divergem em silêncio são
 * pior que uma fonte ruim.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * A INTENÇÃO
 *
 * Quem usa este produto costuma estar desempregado ou buscando recolocação,
 * travado diante da folha em branco, muitas vezes no celular. A paleta
 * responde a isso:
 *
 * - Um azul-petróleo dessaturado como cor principal. Azul é a cor que o
 *   mercado de trabalho já usa e passa competência sem esforço; dessaturado
 *   evita o tom de banco, que soa frio para quem está vulnerável.
 * - Fundos quentes e claros em vez de branco puro. Branco puro em tela
 *   cansa a vista numa sessão de vinte minutos de digitação.
 * - Vermelho de erro escuro o bastante para passar em AA sobre fundo claro.
 *   Erro que não se lê não é aviso, é decoração.
 * - Verde de sucesso discreto. "Salvo" não precisa comemorar; precisa
 *   tranquilizar.
 *
 * Nada de confete, medalha ou barra que enche com animação saltitante. O
 * planejamento é explícito: encorajar sem infantilizar. Quem monta currículo
 * não está jogando.
 * ─────────────────────────────────────────────────────────────────────────
 */

export const CLARO = {
  fundo: "#FCFCFB",
  superficie: "#F2F3F1",
  superficieElevada: "#FFFFFF",

  texto: "#1A1D1C",
  textoSuave: "#525A58",

  primaria: "#17535F",
  primariaHover: "#0F3C45",
  primariaSuave: "#E3EFF1",

  borda: "#CBD1CF",
  // Escolhido pelo teste, não pelo olho: #8D9693 parecia certo e dava 2,73:1
  // sobre a superfície — reprovado na 1.4.11. Escurecer até 3,55:1 é o que
  // mantém a borda do campo visível para quem tem baixa visão.
  bordaForte: "#79827F",

  erro: "#9E2A2A",
  erroFundo: "#FBEAEA",
  sucesso: "#1D5E43",
  sucessoFundo: "#E6F2EC",
  atencao: "#7A4E00",
  atencaoFundo: "#FBF0DC",

  foco: "#17535F",
} as const;

/**
 * O tema é o conjunto de CHAVES, não os valores literais.
 *
 * `typeof CLARO` sozinho daria `fundo: "#FCFCFB"` — um tipo que só o tema
 * claro satisfaz. O que precisa ser garantido é que os dois definam
 * exatamente as mesmas chaves, e é isso que este mapeamento expressa.
 */
export type Tema = { readonly [K in keyof typeof CLARO]: string };

/**
 * Tema escuro.
 *
 * Não é a paleta clara invertida. Cor saturada sobre fundo escuro "vibra" —
 * a borda parece tremer —, então as cores de destaque são clareadas e
 * dessaturadas. E o fundo é cinza-esverdeado escuro, não preto: preto puro
 * com texto branco produz halo em tela OLED e cansa mais que o cinza.
 */
export const ESCURO = {
  fundo: "#141817",
  superficie: "#1C2221",
  superficieElevada: "#242B29",

  texto: "#E8EDEB",
  textoSuave: "#A6B0AD",

  primaria: "#7FC4D2",
  primariaHover: "#A5D8E2",
  primariaSuave: "#1B3A40",

  borda: "#39423F",
  bordaForte: "#6C7874",

  erro: "#F2A0A0",
  erroFundo: "#3A1E1E",
  sucesso: "#8FD4B4",
  sucessoFundo: "#14312A",
  atencao: "#E4BC74",
  atencaoFundo: "#332714",

  foco: "#7FC4D2",

  // `satisfies` e não `:` — mantém os literais visíveis para o teste e
  // ainda assim reprova o build se faltar ou sobrar uma chave. Chave
  // faltando vira variável CSS indefinida, e o navegador cai para a cor
  // herdada: texto invisível, sem erro nenhum.
} as const satisfies Tema;


/**
 * Os pares que precisam passar no WCAG AA.
 *
 * Lista explícita, e não geração automática de todas as combinações: nem
 * todo par é usado na interface, e testar combinações que não existem
 * produziria reprovações sem significado — o tipo de ruído que faz uma
 * suíte ser ignorada.
 */
export interface ParDeContraste {
  nome: string;
  frente: keyof Tema;
  fundo: keyof Tema;
  uso: TipoDeUso;
}

export const PARES: readonly ParDeContraste[] = [
  { nome: "texto sobre fundo", frente: "texto", fundo: "fundo", uso: "textoNormal" },
  { nome: "texto sobre superfície", frente: "texto", fundo: "superficie", uso: "textoNormal" },
  { nome: "texto sobre superfície elevada", frente: "texto", fundo: "superficieElevada", uso: "textoNormal" },

  // Texto de apoio: ajuda de campo, resumo no painel de seções. Precisa
  // passar como texto normal — "secundário" não é desculpa para ilegível.
  { nome: "texto suave sobre fundo", frente: "textoSuave", fundo: "fundo", uso: "textoNormal" },
  { nome: "texto suave sobre superfície", frente: "textoSuave", fundo: "superficie", uso: "textoNormal" },

  { nome: "primária sobre fundo", frente: "primaria", fundo: "fundo", uso: "textoNormal" },
  { nome: "primária sobre superfície", frente: "primaria", fundo: "superficie", uso: "textoNormal" },
  { nome: "texto sobre primária (botão)", frente: "fundo", fundo: "primaria", uso: "textoNormal" },
  { nome: "primária sobre primária suave", frente: "primaria", fundo: "primariaSuave", uso: "textoNormal" },
  // A caixa "Concluir e salvar" tem fundo primária suave e leva explicação,
  // confirmação e erro. É ali que está escrito o prazo de 5 dias — o texto
  // que a pessoa mais precisa conseguir ler nesta tela.
  { nome: "texto suave sobre primária suave", frente: "textoSuave", fundo: "primariaSuave", uso: "textoNormal" },
  { nome: "sucesso sobre primária suave", frente: "sucesso", fundo: "primariaSuave", uso: "textoNormal" },
  { nome: "erro sobre primária suave", frente: "erro", fundo: "primariaSuave", uso: "textoNormal" },

  { nome: "erro sobre fundo", frente: "erro", fundo: "fundo", uso: "textoNormal" },
  // Botão "Sim, apagar tudo": o único preenchido com a cor de erro. Entra na
  // lista porque o par só existe a partir dele — e é o botão que a pessoa
  // mais precisa ler antes de apertar.
  { nome: "texto sobre erro (botão de apagar)", frente: "fundo", fundo: "erro", uso: "textoNormal" },
  { nome: "erro sobre fundo de erro", frente: "erro", fundo: "erroFundo", uso: "textoNormal" },
  { nome: "sucesso sobre fundo", frente: "sucesso", fundo: "fundo", uso: "textoNormal" },
  { nome: "sucesso sobre fundo de sucesso", frente: "sucesso", fundo: "sucessoFundo", uso: "textoNormal" },
  { nome: "atenção sobre fundo de atenção", frente: "atencao", fundo: "atencaoFundo", uso: "textoNormal" },

  // Bordas: 3:1 pela regra 1.4.11. Borda invisível torna o campo invisível,
  // mesmo com o texto de dentro legível.
  { nome: "borda forte sobre fundo", frente: "bordaForte", fundo: "fundo", uso: "componente" },
  { nome: "borda forte sobre superfície", frente: "bordaForte", fundo: "superficie", uso: "componente" },
  { nome: "anel de foco sobre fundo", frente: "foco", fundo: "fundo", uso: "componente" },
  { nome: "anel de foco sobre superfície", frente: "foco", fundo: "superficie", uso: "componente" },
] as const;
