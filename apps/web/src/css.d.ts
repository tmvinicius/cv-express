/**
 * Declara CSS importado só pelo efeito colateral (`import "./x.css"`).
 *
 * O TypeScript 6 liga `noUncheckedSideEffectImports` por padrão e passa a
 * exigir declaração de tipo para esse tipo de import. Os tipos do Next 15 só
 * declaram `*.module.css`, então o CSS global de `app/layout.tsx` fica sem
 * nenhuma. O VS Code já usa o TS 6 embutido e mostra o erro TS2882, embora o
 * build com o TS 5.9 do projeto passe.
 *
 * Desligar a opção no tsconfig também resolveria, mas afrouxaria a checagem
 * de todos os outros imports de efeito colateral. Esta declaração vale só
 * para CSS. Um caminho de CSS digitado errado continua falhando no
 * `next build`.
 */
declare module "*.css";
