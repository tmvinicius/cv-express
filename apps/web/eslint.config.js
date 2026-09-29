// @ts-check
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * ESLint do apps/web — existe por UMA regra.
 *
 * O projeto tem 600 testes e não tinha análise estática nenhuma: o script
 * `lint` da raiz era `pnpm -r run lint`, nenhum pacote definia `lint`, e o
 * comando terminava com sucesso sem verificar uma linha. Pior, os dois hooks
 * mais delicados do app carregavam
 * `// eslint-disable-next-line react-hooks/exhaustive-deps` — um `disable`
 * para uma regra que nunca rodava, sugerindo uma proteção inexistente.
 *
 * A regra é `react-hooks/exhaustive-deps`, e ela vale a instalação porque
 * `useAutosave` tem um bloco de comentário descrevendo um laço infinito de
 * reagendamento que JÁ ACONTECEU ("a gravação nunca acontecia, e o indicador
 * ficava eternamente em 'salvando'"), e `useCompilacao` repete a mesma manobra
 * de dependência por conteúdo. As duas exclusões estão certas — o que faltava
 * era alguém avisar quando um `useEffect` novo chegasse com dependência
 * faltando.
 *
 * Deliberadamente enxuto: nada de regras de estilo. Formatação é discussão que
 * o projeto não está tendo, e transformar o portão numa lista de preferências
 * é o jeito mais rápido de fazer todo mundo rodar `--fix` sem ler.
 */
export default tseslint.config(
  {
    ignores: [".next/**", "dist/**", "node_modules/**", "next-env.d.ts"],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      // Aviso, e não erro, por decisão: as duas exclusões existentes são
      // corretas e justificadas em comentário. Elevar a erro obrigaria a
      // silenciá-las de novo a cada arquivo tocado, e o custo cairia sobre
      // quem escreveu o comentário certo.
      "react-hooks/exhaustive-deps": "warn",
    },
  },
);
