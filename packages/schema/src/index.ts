/**
 * @cv-express/schema — o contrato central do projeto.
 *
 * O CvData é a única fonte de verdade (PLANEJAMENTO.md, seção 1). O .tex e o
 * .pdf são artefatos derivados, descartáveis e sempre reconstruíveis a partir
 * daqui. Nenhum outro pacote define a forma do currículo.
 */

export * from "./limites.js";
export * from "./data.js";
export * from "./cv.js";
export * from "./campo.js";
export * from "./fabricas.js";
