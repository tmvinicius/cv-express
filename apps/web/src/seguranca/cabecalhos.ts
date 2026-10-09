/**
 * Cabeçalhos de segurança HTTP.
 *
 * O site recebe nome, e-mail, telefone e a trajetória profissional de quem
 * preenche, e o endereço do currículo é a chave dele. Estes cabeçalhos são a
 * camada que o navegador aplica por conta própria: não substituem o escape do
 * React nem o do LaTeX, mas limitam o estrago se um deles falhar.
 *
 * Duas partes, por um motivo técnico:
 *
 *   - os FIXOS (`CABECALHOS_FIXOS`) são iguais em toda resposta e vão no
 *     `next.config.ts`;
 *   - a CSP leva um nonce NOVO por requisição, então é montada no middleware
 *     (`politicaDeConteudo`). Um nonce fixo seria uma senha publicada no HTML
 *     de toda página.
 */

export interface Cabecalho {
  key: string;
  value: string;
}

export const CABECALHOS_FIXOS: readonly Cabecalho[] = [
  // Ninguém precisa abrir o formulário dentro de um <iframe> de outro site.
  // Bloquear é o que impede o clickjacking: um site que sobrepõe o botão
  // "Apagar meus dados" a um "Clique aqui" invisível. A CSP diz o mesmo com
  // `frame-ancestors`; este cabeçalho é para navegadores que não leem aquela.
  { key: "X-Frame-Options", value: "DENY" },
  // O navegador não "adivinha" que um arquivo é HTML ou script quando o
  // servidor disse outra coisa.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // O endereço do currículo é a chave dele. Para outro site, só a origem — o
  // caminho com o id nunca sai daqui. As páginas de currículo e do link vão
  // além (`no-referrer`, nos metadados delas).
  //
  // NÃO use `no-referrer` aqui: com ele o navegador manda `Origin: null` no
  // POST de formulário, e o Next recusa a Server Action. Medido no Chromium:
  // o botão "Começar" sem JavaScript passou a responder 500.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Recursos do navegador que o produto não usa ficam desligados, inclusive
  // para qualquer script que um dia consiga rodar aqui.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  // Uma janela aberta a partir daqui não alcança `window.opener`.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Só HTTPS por um ano. Sem `includeSubDomains` de propósito: o domínio do
  // app pode ser subdomínio de alguém que ainda serve algo em HTTP, e esse
  // cabeçalho não se desfaz rápido. Em HTTP (localhost), o navegador o ignora.
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];

/**
 * A Content-Security-Policy de uma resposta.
 *
 * O que ela permite, e por quê:
 *
 *   - script: só os que levam o nonce desta resposta. `strict-dynamic` deixa
 *     esses scripts carregarem os pedaços do bundle do Next sem listar cada
 *     arquivo. Sem `unsafe-inline`: um `<script>` injetado no HTML não roda.
 *   - style: arquivos do próprio site. `style-src-attr 'unsafe-inline'`
 *     libera só ATRIBUTOS `style` — a barra de progresso desenha a largura
 *     assim —, e não elementos `<style>`, que são o vetor de injeção de CSS.
 *   - frame: o preview do PDF é um <iframe> com URL `blob:` criada aqui.
 *     Sem `blob:`, o Chromium recusa o iframe e o preview fica vazio
 *     (medido). `object-src 'none'` não atrapalha: o leitor de PDF abriu o
 *     documento normalmente com ele.
 *   - connect: as Server Actions são `fetch` para a mesma origem.
 *   - form-action: o botão "Começar" funciona sem JavaScript, como POST de
 *     formulário para a própria página.
 *   - frame-ancestors: o mesmo que `X-Frame-Options: DENY`.
 *
 * Em desenvolvimento, o Next precisa de `eval` e WebSocket (recarga a
 * quente) e injeta o CSS em `<style>`; em produção, nada disso — e é a de
 * produção que o E2E e o CI exercitam.
 */
export function politicaDeConteudo(
  nonce: string,
  { desenvolvimento = false }: { desenvolvimento?: boolean } = {},
): string {
  const diretivas: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(desenvolvimento ? ["'unsafe-eval'"] : []),
    ],
    // Em desenvolvimento o Next injeta o CSS como <style> sem nonce (é a
    // recarga a quente); sem `unsafe-inline` a página sai sem estilo
    // nenhum (medido). O nonce fica de fora em dev porque, presente, ele
    // anula o `unsafe-inline`.
    "style-src": desenvolvimento
      ? ["'self'", "'unsafe-inline'"]
      : ["'self'", `'nonce-${nonce}'`],
    "style-src-attr": ["'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...(desenvolvimento ? ["ws:"] : [])],
    "frame-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };

  return Object.entries(diretivas)
    .map(([nome, valores]) => `${nome} ${valores.join(" ")}`)
    .join("; ");
}

/**
 * Um nonce novo: 128 bits do gerador criptográfico, em base64.
 *
 * Web Crypto, e não `node:crypto`: o middleware roda no runtime de borda da
 * Vercel, onde os módulos do Node não existem.
 */
export function gerarNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}
