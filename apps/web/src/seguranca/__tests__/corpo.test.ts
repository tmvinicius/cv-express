// @vitest-environment node
import { describe, it, expect } from "vitest";
import { LIMITES } from "@cv-express/schema";

import configuracaoNext from "../../../next.config";

/**
 * O limite do corpo das Server Actions.
 *
 * Era 4 MB "por causa do PDF" — mas o limite é do que o navegador ENVIA, e
 * nenhuma Server Action recebe PDF. Medido no main: um autosave de 2 MB era
 * aceito e decodificado inteiro antes de a validação recusá-lo.
 */
describe("limite do corpo das Server Actions", () => {
  const limite = configuracaoNext.experimental?.serverActions?.bodySizeLimit;

  it("cabe o maior currículo válido, com folga para a mensagem amigável", () => {
    // Um pouco acima do limite do schema ainda precisa chegar à validação,
    // que explica o que passou; barrado antes, vira erro genérico.
    expect(typeof limite).toBe("number");
    expect(limite as number).toBeGreaterThanOrEqual(LIMITES.SESSAO_BYTES_MAX * 2);
  });

  it("não volta a aceitar megabytes", () => {
    expect(limite as number).toBeLessThanOrEqual(1024 * 1024);
  });
});
