/**
 * Reexporta as fixtures do pacote de templates.
 *
 * Duplicá-las aqui criaria duas versões do "currículo completo" que
 * divergiriam na primeira mudança de schema. O worker e o motor precisam
 * concordar sobre o que é um currículo válido — é o mesmo contrato.
 */
export { cvMinimo, cvCompleto, cvExtremo } from "@cv-express/templates/fixtures";
