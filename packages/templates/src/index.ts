/**
 * @cv-express/templates — geração do .tex a partir do CvData.
 *
 * Esta é a fronteira de segurança do projeto: todo dado do usuário atravessa
 * este pacote a caminho do LaTeX, e é aqui que ele deixa de ser perigoso.
 */

export * from "./sanitizar.js";
export * from "./escape.js";
