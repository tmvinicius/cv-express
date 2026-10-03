/**
 * O prazo do link, como a pessoa lê: "sexta-feira, 08/10, às 14:30".
 *
 * Formatado à mão, e não com `Intl.DateTimeFormat`, por um motivo concreto:
 * o mesmo texto sai no e-mail (Node) e na tela (renderizada no servidor e
 * hidratada no navegador). O resultado do Intl depende da versão do ICU de
 * cada lado — "às", vírgula, abreviação do dia —, e uma diferença de um
 * caractere entre o HTML do servidor e o render do navegador vira erro de
 * hidratação. Aritmética simples dá o mesmo texto em qualquer lugar.
 *
 * Fuso: horário de Brasília, UTC−3 FIXO. O Brasil aboliu o horário de verão
 * em 2019 (Decreto 9.772/2019). Se ele voltar, é aqui que se muda — e o
 * teste que fixa o deslocamento vai acusar.
 */

const DESLOCAMENTO_BRASILIA_MS = -3 * 60 * 60 * 1000;

const DIAS = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
] as const;

const doisDigitos = (n: number) => String(n).padStart(2, "0");

export function formatarPrazo(instante: Date | string): string {
  const utc = typeof instante === "string" ? new Date(instante) : instante;
  // Desloca e lê com os getters UTC: o fuso da máquina não entra na conta.
  const local = new Date(utc.getTime() + DESLOCAMENTO_BRASILIA_MS);

  const dia = DIAS[local.getUTCDay()] ?? "";
  const data = `${doisDigitos(local.getUTCDate())}/${doisDigitos(local.getUTCMonth() + 1)}`;
  const hora = `${doisDigitos(local.getUTCHours())}:${doisDigitos(local.getUTCMinutes())}`;

  return `${dia}, ${data}, às ${hora}`;
}
