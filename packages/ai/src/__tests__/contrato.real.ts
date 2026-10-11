import { describe, it } from "vitest";

import { capacidadeIa, criarProviderDoAmbiente } from "../config.js";
import { criarServicoIa } from "../servico.js";
import { rodarContrato } from "./contrato.js";

/**
 * A suíte de contrato contra o provider de VERDADE que o ambiente configurar.
 *
 * Não roda no `pnpm test` nem no CI: cada execução faz chamadas pagas (ou
 * exige um modelo local no ar). Roda só quando alguém pede:
 *
 *     AI_PROVIDER=openai-compativel AI_BASE_URL=http://localhost:11434/v1 \
 *     AI_MODEL=llama3.1 pnpm --filter @cv-express/ai contrato:real
 *
 * É o critério de aceite da troca de provider (planejamento §4.8): se passar,
 * está trocado — sem tocar em nenhum arquivo fora de `packages/ai`. O roteiro
 * completo, com o que fazer quando falha, está no README do pacote.
 *
 * As asserções são as MESMAS do `contrato.test.ts` (moram em `contrato.ts`).
 */

const ambiente = process.env;
const capacidade = capacidadeIa(ambiente);
const escolha = ambiente["AI_PROVIDER"] ?? "anthropic";

if (escolha === "mock") {
  // O mock já roda a cada `pnpm test`. Aqui ele só daria um verde falso para
  // quem esqueceu de exportar as variáveis do provider de verdade.
  describe("contrato com provider real", () => {
    it("precisa de um provider de verdade — AI_PROVIDER=mock não serve aqui", () => {
      throw new Error("Defina AI_PROVIDER=anthropic ou openai-compativel (ver README do pacote).");
    });
  });
} else if (!capacidade.disponivel) {
  describe("contrato com provider real", () => {
    it(`configuração incompleta para AI_PROVIDER=${escolha}`, () => {
      throw new Error(
        `A IA não está configurada (${capacidade.motivo}). Confira as variáveis no README do pacote.`,
      );
    });
  });
} else {
  const provider = criarProviderDoAmbiente(ambiente);
  rodarContrato(
    `${provider.nome} · ${provider.modelo} (suporteJson=${provider.suporteJson})`,
    // Um serviço novo por teste, como no mock: a cota em memória do serviço
    // não pode recusar a quinta asserção da suíte.
    () => criarServicoIa(criarProviderDoAmbiente(ambiente)),
  );
}
