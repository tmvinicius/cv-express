import type { ZodType } from "zod";
import type { CategoriaHabilidade } from "@cv-express/schema";

import { AiError, type Resultado } from "./erros.js";
import type { LlmProvider, PedidoLlm } from "./porta.js";
import { extrairJson } from "./json.js";
import {
  jsonSchemaExperiencia,
  jsonSchemaHabilidades,
  saidaExperienciaSchema,
  saidaHabilidadesSchema,
} from "./esquemas.js";
import * as prompts from "./prompts.js";
import { verificarExperiencia, verificarHabilidades } from "./guardrails.js";

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  CAMADA 1 — O SERVIÇO DE DOMÍNIO                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * A ÚNICA coisa que o resto do projeto importa desta camada.
 *
 * Repare no que não aparece nas assinaturas: prompt, modelo, temperatura,
 * token, provider. Fala de currículo. É isso que garante a ausência de
 * refatoração ao trocar de provider — nenhum arquivo fora de packages/ai
 * menciona um LLM, então nenhum precisa mudar.
 */

export interface EntradaExperiencia {
  cargo: string;
  descricao: string;
}

export interface EntradaHabilidades {
  texto: string;
}

export interface HabilidadeSugerida {
  nome: string;
  categoria: CategoriaHabilidade;
}

export interface CvAiService {
  polirExperiencia(
    entrada: EntradaExperiencia,
    sessaoId?: string,
  ): Promise<Resultado<{ bullets: string[] }>>;

  normalizarHabilidades(
    entrada: EntradaHabilidades,
    sessaoId?: string,
  ): Promise<Resultado<{ itens: HabilidadeSugerida[] }>>;
}

export interface OpcoesServico {
  /** Chamadas permitidas por sessão dentro da janela. */
  chamadasPorSessao?: number;
  janelaMs?: number;
  maxTokens?: number;
  timeoutMs?: number;
  /** Tentativas extras quando a saída não valida. */
  tentativasExtras?: number;
}

const PADROES = {
  chamadasPorSessao: 15,
  janelaMs: 60 * 60 * 1000,
  maxTokens: 2_000,
  timeoutMs: 30_000,
  tentativasExtras: 1,
} as const;

/**
 * Limitador por sessão.
 *
 * O produto é gratuito, então a IA é a única despesa que escala com o uso.
 * Sem teto, uma aba aberta num laço de reprocessamento gasta dinheiro real
 * sem ninguém perceber até a fatura.
 */
class Cota {
  private readonly uso = new Map<string, number[]>();

  constructor(
    private readonly limite: number,
    private readonly janelaMs: number,
  ) {}

  permite(sessaoId: string, agora: number = Date.now()): boolean {
    const recentes = (this.uso.get(sessaoId) ?? []).filter(
      (t) => agora - t < this.janelaMs,
    );

    if (recentes.length >= this.limite) {
      this.uso.set(sessaoId, recentes);
      return false;
    }

    recentes.push(agora);
    this.uso.set(sessaoId, recentes);
    return true;
  }
}

export function criarServicoIa(
  provider: LlmProvider,
  opcoes: OpcoesServico = {},
): CvAiService {
  const cfg = { ...PADROES, ...opcoes };
  const cota = new Cota(cfg.chamadasPorSessao, cfg.janelaMs);

  /**
   * Caminho comum: pede, extrai, valida, tenta de novo uma vez.
   *
   * Todos os adapters passam por aqui. Se cada um validasse do seu jeito,
   * trocar de provider poderia mudar o rigor da checagem sem ninguém notar.
   */
  async function pedir<T>(
    base: Omit<PedidoLlm, "usuario"> & { usuario: string },
    schema: ZodType<T>,
  ): Promise<Resultado<T>> {
    let usuario = base.usuario;
    let ultimoErro = "";
    let entradaTotal = 0;
    let saidaTotal = 0;

    for (let tentativa = 0; tentativa <= cfg.tentativasExtras; tentativa++) {
      let resposta;
      try {
        resposta = await provider.gerar({ ...base, usuario });
      } catch (e) {
        // O adapter já traduziu para AiError; qualquer outra coisa é defeito
        // nosso e vira INDISPONIVEL em vez de vazar para cima.
        return {
          ok: false,
          erro:
            e instanceof AiError
              ? e
              : new AiError("INDISPONIVEL", "Falha ao chamar o provider.", String(e)),
        };
      }

      entradaTotal += resposta.uso.entrada;
      saidaTotal += resposta.uso.saida;

      const bruto = extrairJson(resposta.texto);
      if (bruto === null) {
        ultimoErro = "A resposta não continha JSON válido.";
        usuario = base.usuario + prompts.correcao(ultimoErro);
        continue;
      }

      // O Zod é o juiz, em qualquer adapter.
      const validado = schema.safeParse(bruto);
      if (!validado.success) {
        const issue = validado.error.issues[0];
        ultimoErro = issue
          ? `Campo "${issue.path.join(".")}": ${issue.message}`
          : "Formato inesperado.";
        usuario = base.usuario + prompts.correcao(ultimoErro);
        continue;
      }

      return {
        ok: true,
        dados: validado.data,
        uso: { entrada: entradaTotal, saida: saidaTotal },
      };
    }

    return {
      ok: false,
      erro: new AiError(
        "SAIDA_INVALIDA",
        "O modelo não devolveu o formato esperado.",
        ultimoErro,
      ),
    };
  }

  function semCota(sessaoId: string | undefined): Resultado<never> | null {
    if (sessaoId === undefined) return null;
    if (cota.permite(sessaoId)) return null;

    return {
      ok: false,
      erro: new AiError(
        "COTA_DA_SESSAO",
        "Você já usou o polimento várias vezes. Tente de novo em alguns minutos.",
      ),
    };
  }

  return {
    async polirExperiencia(entrada, sessaoId) {
      const descricao = entrada.descricao.trim();

      // Entrada vazia não vai ao modelo. Economiza a chamada e, mais
      // importante, elimina o pior caso de invenção: pedir para organizar
      // nada convida o modelo a escrever alguma coisa.
      if (descricao === "") {
        return {
          ok: true,
          dados: { bullets: [] },
          uso: { entrada: 0, saida: 0 },
        };
      }

      const bloqueio = semCota(sessaoId);
      if (bloqueio) return bloqueio;

      const resultado = await pedir(
        {
          sistema: prompts.SISTEMA_EXPERIENCIA,
          usuario: prompts.usuarioExperiencia({ ...entrada, descricao }),
          schema: saidaExperienciaSchema,
          jsonSchema: jsonSchemaExperiencia,
          nomeSchema: "bullets_experiencia",
          maxTokens: cfg.maxTokens,
          timeoutMs: cfg.timeoutMs,
        },
        saidaExperienciaSchema,
      );

      if (!resultado.ok) return resultado;

      // Guardrails ACIMA do adapter: valem igual para qualquer provider.
      const violacao = verificarExperiencia(descricao, resultado.dados.bullets);
      if (violacao) {
        return {
          ok: false,
          erro: new AiError(
            "GUARDRAIL",
            "A sugestão não respeitou o texto original e foi descartada.",
            violacao.mensagem,
          ),
        };
      }

      return { ...resultado, dados: { bullets: resultado.dados.bullets } };
    },

    async normalizarHabilidades(entrada, sessaoId) {
      const texto = entrada.texto.trim();

      if (texto === "") {
        return { ok: true, dados: { itens: [] }, uso: { entrada: 0, saida: 0 } };
      }

      const bloqueio = semCota(sessaoId);
      if (bloqueio) return bloqueio;

      const resultado = await pedir(
        {
          sistema: prompts.SISTEMA_HABILIDADES,
          usuario: prompts.usuarioHabilidades({ texto }),
          schema: saidaHabilidadesSchema,
          jsonSchema: jsonSchemaHabilidades,
          nomeSchema: "habilidades_normalizadas",
          maxTokens: cfg.maxTokens,
          timeoutMs: cfg.timeoutMs,
        },
        saidaHabilidadesSchema,
      );

      if (!resultado.ok) return resultado;

      const violacao = verificarHabilidades(texto, resultado.dados.itens);
      if (violacao) {
        return {
          ok: false,
          erro: new AiError(
            "GUARDRAIL",
            "A sugestão trouxe habilidades que você não informou e foi descartada.",
            violacao.mensagem,
          ),
        };
      }

      return { ...resultado, dados: { itens: resultado.dados.itens } };
    },
  };
}
