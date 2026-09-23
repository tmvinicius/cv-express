import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
    // Cada arquivo sobe seu próprio PGlite; rodar em paralelo multiplicaria
    // a memória sem ganho real numa suíte deste tamanho.
    fileParallelism: false,
  },
});
