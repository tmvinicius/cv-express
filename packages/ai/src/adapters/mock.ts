import { AiError } from "../erros.js";
import type { LlmProvider, PedidoLlm, RespostaLlm, SuporteJson } from "../porta.js";

/**
 * Adapter falso, para testes e desenvolvimento local.
 *
 * Sem rede, sem custo, sem chave. Serve a dois propósitos:
 *
 * 1. Rodar o app inteiro com o polimento por IA funcionando, sem gastar.
 * 2. Exercitar os caminhos difíceis de provocar com provider real — JSON
 *    embrulhado em markdown, resposta truncada, saída que viola guardrail.
 *    É a única forma prática de testar a extração tolerante.
 */

export interface OpcoesMock {
  /** Respostas em fila. A última se repete quando a fila acaba. */
  respostas?: string[];
  erro?: AiError;
  suporteJson?: SuporteJson;
  atrasoMs?: number;
}

export class MockAdapter implements LlmProvider {
  readonly nome = "mock";
  readonly modelo = "mock";
  readonly suporteJson: SuporteJson;

  /** Pedidos recebidos, para os testes inspecionarem. */
  readonly pedidos: PedidoLlm[] = [];

  private readonly fila: string[];
  private indice = 0;

  constructor(private readonly opcoes: OpcoesMock = {}) {
    this.suporteJson = opcoes.suporteJson ?? "nativo";
    this.fila = opcoes.respostas ?? [];
  }

  get chamadas(): number {
    return this.pedidos.length;
  }

  async gerar(pedido: PedidoLlm): Promise<RespostaLlm> {
    this.pedidos.push(pedido);

    if (this.opcoes.atrasoMs) {
      await new Promise((r) => setTimeout(r, this.opcoes.atrasoMs));
    }
    if (this.opcoes.erro) throw this.opcoes.erro;

    const texto = this.proxima(pedido);

    return {
      texto,
      uso: { entrada: 100, saida: 50 },
    };
  }

  private proxima(pedido: PedidoLlm): string {
    if (this.fila.length > 0) {
      const i = Math.min(this.indice, this.fila.length - 1);
      this.indice++;
      return this.fila[i] as string;
    }
    return respostaPlausivel(pedido);
  }
}

/**
 * Resposta padrão quando nenhuma foi encaixada.
 *
 * Deriva do próprio pedido em vez de devolver texto fixo, para que o app
 * rodando com o mock mostre algo coerente com o que foi digitado — e para
 * que ela passe pelos guardrails, que é o comportamento esperado do caminho
 * feliz.
 */
function respostaPlausivel(pedido: PedidoLlm): string {
  const descricao = extrairMarcado(pedido.usuario, "descricao");
  if (descricao !== null) {
    const frases = descricao
      .split(/[.;\n]+/)
      .map((f) => f.trim())
      .filter((f) => f.length > 0)
      .slice(0, 4)
      .map((f) => f.charAt(0).toUpperCase() + f.slice(1));

    return JSON.stringify({ bullets: frases.length > 0 ? frases : [descricao] });
  }

  const habilidades = extrairMarcado(pedido.usuario, "habilidades");
  if (habilidades !== null) {
    const vistas = new Set<string>();
    const itens = habilidades
      .split(/[,;\n]+/)
      .map((h) => h.trim())
      .filter((h) => h.length > 0)
      .filter((h) => {
        const chave = h.toLowerCase();
        if (vistas.has(chave)) return false;
        vistas.add(chave);
        return true;
      })
      .map((nome) => ({ nome, categoria: "tecnica" as const }));

    return JSON.stringify({ itens });
  }

  return "{}";
}

function extrairMarcado(texto: string, rotulo: string): string | null {
  const m = new RegExp(`<${rotulo}>\\n([\\s\\S]*?)\\n</${rotulo}>`).exec(texto);
  return m?.[1] ?? null;
}
