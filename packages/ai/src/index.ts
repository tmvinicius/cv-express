/**
 * @cv-express/ai — camada de IA, agnóstica de provider.
 *
 * O resto do projeto importa daqui APENAS o CvAiService e os tipos de erro.
 * Nada fora deste pacote deve mencionar um modelo de linguagem — é o que
 * garante que trocar de provider não exija refatoração.
 */

export * from "./erros.js";
export * from "./servico.js";
export * from "./config.js";

// A porta e os adapters ficam disponíveis para quem monta o serviço na
// composição da aplicação — não para quem consome IA no dia a dia.
export * from "./porta.js";
export { AnthropicAdapter, MODELO_PADRAO } from "./adapters/anthropic.js";
export { OpenAiCompativelAdapter } from "./adapters/openaiCompativel.js";
export { MockAdapter } from "./adapters/mock.js";
