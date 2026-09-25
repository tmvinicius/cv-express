import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["src/**/__tests__/**/*.test.{ts,tsx}"],
    // jsdom só para os testes de componente; a lógica pura não precisa, mas
    // separar em dois projetos custaria mais do que o ganho nesta escala.
    environment: "jsdom",
    globals: false,
    fileParallelism: false,
  },
});
