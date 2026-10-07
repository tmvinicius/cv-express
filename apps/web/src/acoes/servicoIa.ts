import {
  capacidadeIa,
  criarServicoIa,
  criarProviderDoAmbiente,
  type Ambiente,
  type CvAiService,
  type OpcoesServico,
} from "@cv-express/ai";

/**
 * Resolução e REUSO do serviço de IA.
 *
 * Mora fora de `servidor.ts` porque precisa de teste: o arquivo de Server
 * Actions não roda sem o Next, e a regra deste projeto é que a lógica viva num
 * módulo que roda sem ele (AGENTS.md §3).
 *
 * POR QUE MEMORIZAR — e é a razão inteira deste arquivo existir.
 *
 * A cota por sessão mora DENTRO do serviço: `criarServicoIa` instancia uma
 * `Cota` nova a cada chamada. Enquanto cada Server Action criava o seu
 * serviço, o contador nascia zerado toda vez e o teto de 15 chamadas/hora
 * nunca era atingido — nem uma vez. O comentário de `servico.ts` diz o que
 * estava em jogo: "o produto é gratuito, então a IA é a única despesa que
 * escala com o uso. Sem teto, uma aba aberta num laço de reprocessamento gasta
 * dinheiro real sem ninguém perceber até a fatura."
 *
 * O TETO DE VERDADE NÃO É ESTE. A `Cota` do serviço é por processo: em
 * serverless cada instância tem a sua memória, e um reinício a zera. A cota
 * que vale — sessão conferida no banco, contadores no Postgres e teto diário
 * global — está em `cotas.ts` e roda ANTES de o serviço ser chamado. A daqui
 * fica como segunda linha, e nunca é a mais apertada: ela só vê as chamadas
 * que a primeira já deixou passar.
 */

let memorizado: CvAiService | null | undefined;

/**
 * O serviço, ou `null` se este ambiente não tem IA configurada.
 *
 * `null` também é memorizado: a configuração não muda durante a vida do
 * processo, e refazer a checagem por chamada só repetiria o mesmo aviso no log.
 *
 * `criarProviderDoAmbiente` LANÇA quando a configuração está incompleta — é
 * decisão dele, e boa: melhor falhar cedo. Mas aqui a exceção não pode subir:
 * ela derrubaria o clique num botão de ajuda opcional.
 */
export function obterServicoIa(
  env: Ambiente = process.env,
  opcoes: OpcoesServico = {},
): CvAiService | null {
  if (memorizado !== undefined) return memorizado;

  const capacidade = capacidadeIa(env);
  if (!capacidade.disponivel) {
    // O motivo é registrado AQUI, e não no cálculo das capacidades: aqui
    // acontece uma vez por processo, e não uma vez por render.
    console.warn("[ia] pedido recusado: ajuda desligada", {
      motivo: capacidade.motivo,
    });
    memorizado = null;
    return null;
  }

  try {
    memorizado = criarServicoIa(criarProviderDoAmbiente(env), opcoes);
  } catch {
    // `capacidadeIa` e `criarProviderDoAmbiente` discordaram: há teste em
    // packages/ai cobrando a concordância, então isto é rede de segurança.
    memorizado = null;
  }

  return memorizado;
}

/**
 * Descarta o serviço memorizado. Existe para o teste — sem isto, um teste
 * contaminaria o seguinte com a cota já consumida do anterior.
 */
export function esquecerServicoIa(): void {
  memorizado = undefined;
}
