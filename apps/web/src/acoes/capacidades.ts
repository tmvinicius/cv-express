import { capacidadeIa, type Ambiente } from "@cv-express/ai";

/**
 * O que este servidor consegue fazer.
 *
 * Calculado no servidor e entregue ao formulário como dado, para que a
 * interface não ofereça um recurso que vai falhar no clique. É o sinal seguro
 * de disponibilidade: só booleano atravessa a fronteira — nem a chave, nem o
 * nome do provider, nem a URL base.
 *
 * POR QUE PROP E NÃO `/api/capacidades`
 *
 * Um route handler seria superfície pública nova, com CORS, cache e
 * versionamento para manter, mais um estado de "carregando" na tela, para
 * responder uma pergunta que o servidor já sabe no momento em que desenha a
 * página. O componente de servidor lê aqui e passa adiante; a página nasce com
 * a resposta certa e o botão nunca pisca de habilitado para desabilitado.
 *
 * Quando isso deixa de bastar: se um dia a disponibilidade mudar DURANTE a
 * sessão (cota estourada no meio do preenchimento, por exemplo), aí sim vale o
 * endpoint — e ele deve devolver exatamente esta forma.
 */
export interface Capacidades {
  ia: { disponivel: boolean };
}

/**
 * Só o booleano sai daqui — e a função não registra nada.
 *
 * O motivo ("sem_chave", "config_incompleta") é informação de implantação:
 * para quem está preenchendo o currículo, o que importa é que a ajuda da IA
 * está desligada, e essa frase o componente já tem.
 *
 * Por que nem no log: esta função roda durante o render do componente de
 * servidor, e em desenvolvimento o Next repassa o `console` do servidor para o
 * navegador dentro do payload RSC — um `console.warn` aqui reapareceria no
 * console do cliente, que é justamente o que se quer evitar. Além disso, seria
 * uma linha de log por render. O motivo é registrado em `servidor.ts`, quando
 * alguém de fato tenta usar a IA: é ali que ele ajuda a diagnosticar.
 */
export function capacidadesDoAmbiente(env: Ambiente = process.env): Capacidades {
  return { ia: { disponivel: capacidadeIa(env).disponivel } };
}
