/**
 * Fila com concorrência limitada.
 *
 * Compilar LaTeX é CPU-bound e consome memória. Sem limite, dez requisições
 * simultâneas viram dez processos Tectonic brigando pelo mesmo núcleo: todas
 * ficam lentas, várias estouram o tempo limite, e o contêiner pode ser morto
 * por consumo de memória. Com limite, algumas esperam e todas terminam.
 *
 * O planejamento (seção 5.2) prevê BullMQ + Redis. Esta é a fila em memória
 * que o próprio planejamento indica como suficiente para o MVP. A troca é
 * local: só esta classe muda, porque o resto do worker só conhece `executar`.
 *
 * O limite de tamanho é tão importante quanto o de concorrência. Uma fila sem
 * teto não protege de nada sob carga — ela só troca "recusar rápido" por
 * "aceitar tudo e estourar a memória com requisições que já desistiram".
 * Recusar com SOBRECARGA é informação honesta para o cliente.
 */

export class FilaCheiaError extends Error {
  constructor(limite: number) {
    super(`Fila cheia (${limite} aguardando).`);
    this.name = "FilaCheiaError";
  }
}

interface Pendente<T> {
  tarefa: () => Promise<T>;
  resolver: (v: T) => void;
  rejeitar: (e: unknown) => void;
}

export interface OpcoesFila {
  /** Quantas tarefas rodam ao mesmo tempo. */
  concorrencia: number;
  /** Quantas podem aguardar antes de recusar novas. */
  tamanhoMaximo: number;
}

export class Fila {
  private emExecucao = 0;
  private readonly aguardando: Pendente<unknown>[] = [];

  constructor(private readonly opcoes: OpcoesFila) {
    if (opcoes.concorrencia < 1) {
      throw new Error("A concorrência precisa ser pelo menos 1.");
    }
  }

  get tamanho(): number {
    return this.aguardando.length;
  }

  get ativas(): number {
    return this.emExecucao;
  }

  executar<T>(tarefa: () => Promise<T>): Promise<T> {
    if (this.aguardando.length >= this.opcoes.tamanhoMaximo) {
      return Promise.reject(new FilaCheiaError(this.opcoes.tamanhoMaximo));
    }

    return new Promise<T>((resolver, rejeitar) => {
      this.aguardando.push({
        tarefa,
        resolver,
        rejeitar,
      } as Pendente<unknown>);
      this.avancar();
    });
  }

  private avancar(): void {
    if (this.emExecucao >= this.opcoes.concorrencia) return;

    const proxima = this.aguardando.shift();
    if (!proxima) return;

    this.emExecucao++;

    // `void` explícito: o resultado vai pela promessa do chamador, e um
    // `await` aqui serializaria a fila — exatamente o contrário do objetivo.
    void proxima
      .tarefa()
      .then(proxima.resolver, proxima.rejeitar)
      .finally(() => {
        this.emExecucao--;
        this.avancar();
      });
  }
}
