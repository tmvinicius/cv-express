%% ===========================================================================
%%  cvexpress.cls — template "clássico" do CV Express
%%
%%  TODA a estética do currículo mora neste arquivo: fontes, margens, cores,
%%  espaçamento e as macros de seção. O main.tex decide apenas a ORDEM e a
%%  PRESENÇA das seções.
%%
%%  Consequência prática dessa separação: mudar o visual do currículo é editar
%%  um arquivo que não contém nenhum dado do usuário e nenhuma lógica. Quem
%%  mexe aqui precisa saber LaTeX, não precisa saber TypeScript.
%% ===========================================================================
\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{cvexpress}[2026/01/01 CV Express - template classico]

\LoadClass[11pt,a4paper]{article}

%% --- Codificação e idioma --------------------------------------------------
%% fontspec + Unicode nativo: é o que faz "ç", "ã" e "õ" funcionarem sem
%% depender de inputenc nem de acentos combinantes. O texto já chega
%% normalizado em NFC pelo sanitizar.ts.
\RequirePackage{fontspec}
\RequirePackage{polyglossia}
\setdefaultlanguage{portuguese}

%% A fonte é embutida na imagem do worker. Nada é baixado em tempo de
%% compilação — o sandbox roda sem rede.
\setmainfont{Latin Modern Roman}
\setsansfont{Latin Modern Sans}

%% --- Geometria -------------------------------------------------------------
\RequirePackage[
  a4paper,
  top=1.6cm, bottom=1.6cm, left=1.8cm, right=1.8cm,
  footskip=0.8cm
]{geometry}

\RequirePackage{xcolor}
\RequirePackage{enumitem}
\RequirePackage{titlesec}
\RequirePackage{hyperref}
%% savepos: coordenadas absolutas   abspage: número absoluto de página
%% user:    \zlabel / \zref públicos (nada de comandos internos com @)
\RequirePackage[savepos,abspage,user]{zref}

%% --- Cores -----------------------------------------------------------------
\definecolor{cvTexto}{HTML}{1A1A1A}
\definecolor{cvSuave}{HTML}{5A5A5A}
\definecolor{cvDestaque}{HTML}{1F4E5F}
\definecolor{cvLinha}{HTML}{D4D4D4}

\color{cvTexto}

\hypersetup{
  colorlinks=true,
  urlcolor=cvDestaque,
  pdfborder={0 0 0},
  hidelinks=false
}

%% --- Comportamento geral ---------------------------------------------------
\pagestyle{empty}          % currículo não tem número de página
\setlength{\parindent}{0pt}
\setlength{\parskip}{0pt}
\raggedbottom
\raggedright               % sem justificar: evita rios de espaço em coluna estreita

%% ===========================================================================
%%  ÂNCORAS DE POSIÇÃO
%%
%%  \cvCampo{<fieldId>}{<conteúdo>} imprime o conteúdo e grava as coordenadas
%%  absolutas no .aux. O worker lê esse arquivo e devolve o mapa
%%  fieldId -> {página, x, y} junto com o PDF, para o preview desenhar as
%%  regiões clicáveis.
%%
%%  Se o mapa vier vazio ou incompleto, o preview cai para o painel lateral de
%%  seções: a edição por clique é aprimoramento, nunca requisito.
%%
%%  ATENÇÃO — NÃO VERIFICADO AINDA
%%  Esta macro é a única parte do pacote que não pôde ser exercitada: validá-la
%%  exige compilar de fato, e o Tectonic não estava disponível no ambiente em
%%  que o código foi escrito. O resto do caminho (CvData -> .tex) tem teste.
%%  Ao rodar a primeira compilação, confira no .aux se saíram três entradas por
%%  campo (@x, @y, @p). É o primeiro item a validar na Parte 4.
%%
%%  Usa só API pública do zref — nada de comandos internos com @, que exigiriam
%%  \makeatletter e quebrariam aqui.
%% ===========================================================================
\newcommand{\cvCampo}[2]{%
  \zsaveposx{#1@x}%
  \zsaveposy{#1@y}%
  \zlabel{#1@p}%
  #2%
}

%% ===========================================================================
%%  CABEÇALHO
%% ===========================================================================
\newcommand{\cvNome}[1]{%
  {\sffamily\bfseries\fontsize{22}{26}\selectfont\color{cvDestaque}#1\par}%
  \vspace{2pt}%
}

%% Linha de contatos, separados por ponto médio.
\newcommand{\cvContato}[1]{%
  {\small\color{cvSuave}#1\par}%
  \vspace{4pt}%
}
\newcommand{\cvSep}{\hspace{4pt}\textperiodcentered\hspace{4pt}}

\newcommand{\cvLink}[2]{\href{#1}{#2}}

%% ===========================================================================
%%  SEÇÕES
%% ===========================================================================
\newcommand{\cvSecao}[1]{%
  \vspace{10pt}%
  {\sffamily\bfseries\fontsize{12}{14}\selectfont\color{cvDestaque}\MakeUppercase{#1}}%
  \vspace{2pt}%
  \hrule height 0.6pt width \textwidth
  \vspace{6pt}%
}

%% Um item de experiência ou formação.
%%   #1 título (cargo / curso)
%%   #2 subtítulo (empresa / instituição)
%%   #3 período
\newcommand{\cvItem}[3]{%
  \vspace{4pt}%
  {\bfseries #1}\par
  {\small\color{cvSuave}#2\hfill #3\par}%
  \vspace{2pt}%
}

%% Parágrafo corrido — usado quando o usuário recusou a sugestão da IA e o
%% texto original entra como bloco único.
\newcommand{\cvParagrafo}[1]{%
  {\small #1\par}%
  \vspace{2pt}%
}

%% Lista de bullets de uma experiência.
\newenvironment{cvBullets}{%
  \begin{itemize}[
    leftmargin=12pt, topsep=2pt, itemsep=1pt, parsep=0pt,
    label=\textbullet, font=\small
  ]\small
}{%
  \end{itemize}%
  \vspace{2pt}%
}

%% Uma categoria de habilidades: rótulo em negrito, nomes em seguida.
\newcommand{\cvHabilidades}[2]{%
  {\small\textbf{#1:} #2\par}%
  \vspace{2pt}%
}

%% Um idioma e seu nível.
\newcommand{\cvIdioma}[2]{%
  {\small\textbf{#1} --- #2\par}%
  \vspace{1pt}%
}

\endinput
