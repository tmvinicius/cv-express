/**
 * Configuração do worker, lida do ambiente.
 *
 * Os padrões são os do planejamento (seção 5.2): 10s de tempo limite e
 * concorrência baixa. Ficam aqui, num lugar só, para que ajustar sob carga
 * não vire caça a números espalhados pelo código.
 */
export interface Config {
  porta: number;
  host: string;
  /** Token compartilhado entre web e worker. */
  tokenInterno: string;
  concorrencia: number;
  filaMaxima: number;
  timeoutCompilacaoMs: number;
  corpoMaximoBytes: number;
  cacheMaximo: number;
  cacheTtlMs: number;
}

function inteiro(nome: string, padrao: number): number {
  const bruto = process.env[nome];
  if (bruto === undefined || bruto === "") return padrao;
  const v = Number.parseInt(bruto, 10);
  if (!Number.isFinite(v) || v <= 0) {
    throw new Error(`${nome} precisa ser um inteiro positivo (recebido: ${bruto}).`);
  }
  return v;
}

export function carregarConfig(): Config {
  const token = process.env["WORKER_TOKEN"] ?? "";

  // Falhar na subida, e não na primeira requisição. Um worker sem token
  // aceitaria qualquer chamada — e como ele executa LaTeX, isso é grave.
  // Em produção não há padrão: ou o token existe, ou o processo não sobe.
  if (token === "" && process.env["NODE_ENV"] === "production") {
    throw new Error("WORKER_TOKEN é obrigatório em produção.");
  }

  return {
    porta: inteiro("PORT", 8080),
    host: process.env["HOST"] ?? "0.0.0.0",
    tokenInterno: token,
    concorrencia: inteiro("CONCORRENCIA", 2),
    filaMaxima: inteiro("FILA_MAXIMA", 50),
    timeoutCompilacaoMs: inteiro("TIMEOUT_COMPILACAO_MS", 10_000),
    corpoMaximoBytes: inteiro("CORPO_MAXIMO_BYTES", 512 * 1024),
    cacheMaximo: inteiro("CACHE_MAXIMO", 100),
    cacheTtlMs: inteiro("CACHE_TTL_MS", 30 * 60 * 1000),
  };
}
