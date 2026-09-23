import type { CodigoErroCompilacao, ErroCompilacao } from "@cv-express/schema";

/**
 * Erro que atravessa a fronteira HTTP.
 *
 * Carrega a mensagem SEGURA (a que o usuário vê) e o status. Detalhes ficam
 * no log do servidor, correlacionados pelo requestId — o cliente recebe o id
 * e pode citá-lo no suporte sem que nada da topologia do servidor vaze.
 */
export class ErroDeCompilacao extends Error {
  constructor(
    public readonly codigo: CodigoErroCompilacao,
    mensagem: string,
    public readonly requestId: string,
    public readonly status: number,
  ) {
    super(mensagem);
    this.name = "ErroDeCompilacao";
  }

  paraCorpo(): ErroCompilacao {
    return {
      codigo: this.codigo,
      mensagem: this.message,
      requestId: this.requestId,
    };
  }
}
