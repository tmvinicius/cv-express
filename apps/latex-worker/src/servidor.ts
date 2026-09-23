import Fastify, { type FastifyInstance } from "fastify";
import { timingSafeEqual } from "node:crypto";

import { ServicoCompilacao, type Registrador } from "./compilar.js";
import { ErroDeCompilacao } from "./erros.js";
import type { ExecutorTectonic } from "./tectonic.js";
import type { Config } from "./config.js";

/**
 * Comparação de token em tempo constante.
 *
 * `a === b` em string sai no primeiro byte diferente, e a diferença de tempo
 * entre "errou no primeiro caractere" e "errou no último" é mensurável pela
 * rede. Com tempo constante, o atacante não aprende nada tentando.
 *
 * O comprimento vaza de qualquer jeito (e `timingSafeEqual` exige buffers do
 * mesmo tamanho), o que é aceitável: saber o tamanho de um token de 32 bytes
 * aleatórios não ajuda a adivinhá-lo.
 */
function tokenConfere(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido, "utf8");
  const b = Buffer.from(esperado, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface OpcoesServidor {
  executor: ExecutorTectonic;
  config: Config;
  /** Nível de log. Os testes passam "silent" para não poluir a saída. */
  nivelLog?: string;
}

export function criarServidor({
  executor,
  config,
  nivelLog,
}: OpcoesServidor): FastifyInstance {
  const nivel = nivelLog ?? process.env["LOG_LEVEL"] ?? "info";

  const app = Fastify({
    logger: nivel === "silent" ? false : { level: nivel },
    // Teto do corpo da requisição. O CvData tem teto próprio no schema; este
    // é a barreira anterior, que rejeita antes de gastar CPU com o parse.
    bodyLimit: config.corpoMaximoBytes,
  });

  const registrador: Registrador = {
    info: (dados, msg) => app.log.info(dados, msg),
    erro: (dados, msg) => app.log.error(dados, msg),
  };

  const servico = new ServicoCompilacao(executor, config, registrador);

  /**
   * Autenticação em hook, e não por rota.
   *
   * Em hook global, acrescentar uma rota nova não exige lembrar de protegê-la.
   * A lista de rotas públicas é explícita e curta — o padrão é exigir token,
   * e a exceção é que precisa ser escrita.
   */
  const ROTAS_PUBLICAS = new Set(["/saude"]);

  app.addHook("onRequest", async (req, resposta) => {
    if (ROTAS_PUBLICAS.has(req.url.split("?")[0] ?? "")) return;

    // Sem token configurado, só em desenvolvimento (config.ts barra em
    // produção). Permitir aqui mantém o worker utilizável localmente.
    if (config.tokenInterno === "") return;

    const cabecalho = req.headers["x-worker-token"];
    const recebido = Array.isArray(cabecalho) ? cabecalho[0] : cabecalho;

    if (!recebido || !tokenConfere(recebido, config.tokenInterno)) {
      await resposta.status(401).send({
        codigo: "ERRO_INTERNO",
        mensagem: "Não autorizado.",
        requestId: req.id,
      });
    }
  });

  app.get("/saude", async () => ({
    estado: "ok",
    ...servico.estado,
  }));

  app.post("/compilar", async (req, resposta) => {
    const corpo = req.body as { cv?: unknown; contentHashEsperado?: string } | undefined;

    if (!corpo || typeof corpo !== "object" || corpo.cv === undefined) {
      return resposta.status(400).send({
        codigo: "DADOS_INVALIDOS",
        mensagem: 'O corpo precisa conter o campo "cv".',
        requestId: req.id,
      });
    }

    try {
      const saida = await servico.compilar(corpo.cv, corpo.contentHashEsperado);
      return resposta.status(200).send(saida);
    } catch (e) {
      if (e instanceof ErroDeCompilacao) {
        return resposta.status(e.status).send(e.paraCorpo());
      }
      // Rede de segurança. O serviço já traduz tudo o que conhece; chegar
      // aqui significa defeito nosso, e o cliente não pode ver o detalhe.
      req.log.error({ erro: String(e) }, "erro não traduzido");
      return resposta.status(500).send({
        codigo: "ERRO_INTERNO",
        mensagem: "Algo deu errado do nosso lado.",
        requestId: req.id,
      });
    }
  });

  return app;
}
