import { criarServidor } from "./servidor.js";
import { carregarConfig } from "./config.js";
import { TectonicReal } from "./tectonic.js";

const config = carregarConfig();
const app = criarServidor({ executor: new TectonicReal(), config });

/**
 * Encerramento limpo.
 *
 * O orquestrador manda SIGTERM e espera. Sem tratar, as compilações em voo
 * morrem no meio e o cliente recebe conexão cortada em vez de resposta —
 * e o diretório temporário do Tectonic fica para trás.
 */
for (const sinal of ["SIGTERM", "SIGINT"] as const) {
  process.on(sinal, () => {
    app.log.info({ sinal }, "encerrando");
    void app.close().then(() => process.exit(0));
  });
}

try {
  await app.listen({ port: config.porta, host: config.host });
} catch (e) {
  app.log.error(e, "falha ao subir o worker");
  process.exit(1);
}
