import { defineConfig } from "vitest/config";

/**
 * Configuração só da suíte de contrato contra provider real
 * (`pnpm contrato:real`). Separada da padrão para que `pnpm test` e o CI
 * nunca a peguem: cada execução custa chamadas pagas.
 */
export default defineConfig({
  test: {
    include: ["src/__tests__/contrato.real.ts"],
    // Modelo local em CPU leva dezenas de segundos por resposta, e o serviço
    // pode fazer uma nova tentativa (30 s de limite cada).
    testTimeout: 120_000,
    // Uma chamada por vez: não disputar o modelo local nem o rate limit da API.
    fileParallelism: false,
  },
});
