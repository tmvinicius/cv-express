"use client";

import { useEffect, useRef, useState } from "react";
import type { CvData } from "@cv-express/schema";
import type { EstadoAutosave } from "../componentes/IndicadorAutosave";

/**
 * Autosave com debounce.
 *
 * "Perder o preenchimento do usuário é o pior defeito possível neste produto."
 * Este hook é o que sustenta isso, e as decisões abaixo existem porque cada
 * uma cobre um jeito específico de perder dado.
 */

export interface OpcoesAutosave {
  salvar: (cv: CvData) => Promise<boolean>;
  /** Espera entre a última tecla e a gravação. */
  esperaMs?: number;
}

export function useAutosave(cv: CvData, opcoes: OpcoesAutosave) {
  const { salvar, esperaMs = 800 } = opcoes;

  const [estado, setEstado] = useState<EstadoAutosave>("ocioso");

  /**
   * O conteúdo da última TENTATIVA, bem-sucedida ou não.
   *
   * Marcar a tentativa, e não só o sucesso, resolve dois problemas de uma
   * vez. Evita regravar quando o React re-renderiza sem mudança de conteúdo.
   * E, mais importante, impede o laço infinito de nova tentativa: quando a
   * gravação falha, o conteúdo continua diferente do último gravado, então o
   * efeito rodaria de novo, falharia de novo, e ficaria martelando o servidor
   * enquanto o indicador piscava entre "salvando" e "erro".
   *
   * Falhou? O estado fica em "erro" e assim permanece até a pessoa digitar
   * algo — o que muda o conteúdo e dispara uma tentativa legítima.
   */
  const ultimoProcessado = useRef<string | null>(null);

  /**
   * Guarda a versão mais recente para o temporizador ler.
   *
   * Sem esta ref, o `setTimeout` gravaria o currículo que existia quando ele
   * foi agendado — a pessoa digitaria mais três campos durante a espera e
   * esses três se perderiam silenciosamente.
   */
  const maisRecente = useRef(cv);
  maisRecente.current = cv;

  const emVoo = useRef(false);
  const pendente = useRef(false);

  /**
   * A função de gravar também vai para uma ref.
   *
   * Se ela entrasse nas dependências do efeito, um pai que a recriasse a cada
   * render (o caso comum, sem `useCallback`) reagendaria o autosave
   * indefinidamente — o mesmo problema de identidade descrito abaixo.
   */
  const salvarRef = useRef(salvar);
  salvarRef.current = salvar;

  /**
   * O efeito depende do CONTEÚDO serializado, não da identidade do objeto.
   *
   * Esta linha corrigiu um defeito sério. Com `cv` na lista de dependências,
   * a sequência era: efeito roda → `setEstado("salvando")` → re-render → o pai
   * entrega um CvData novo (mesmo conteúdo, outra referência) → a limpeza
   * cancela o `setTimeout` → o efeito reagenda. Para sempre. A gravação nunca
   * acontecia, e o indicador ficava eternamente em "salvando" — sem erro, sem
   * aviso, com o trabalho da pessoa só na tela.
   *
   * Comparar por conteúdo também dispensa o `useCallback` de quem usa o hook:
   * o custo é um JSON.stringify por render, irrelevante para um documento
   * limitado a 200KB.
   */
  const serializado = assinaturaDoConteudo(cv);

  useEffect(() => {
    if (serializado === ultimoProcessado.current) return;

    setEstado("salvando");

    const relogio = setTimeout(() => {
      void executar();
    }, esperaMs);

    return () => clearTimeout(relogio);

    async function executar(): Promise<void> {
      /**
       * Uma gravação por vez.
       *
       * Gravações concorrentes podem chegar fora de ordem, e a mais ANTIGA
       * sobrescreveria a mais nova — a pessoa veria o próprio texto voltar
       * ao que era. Se chegar alteração durante a gravação, ela fica marcada
       * como pendente e roda logo depois.
       */
      if (emVoo.current) {
        pendente.current = true;
        return;
      }

      emVoo.current = true;
      const tentativa = maisRecente.current;
      // Marca ANTES de tentar: é o que impede a repetição em laço.
      ultimoProcessado.current = assinaturaDoConteudo(tentativa);

      try {
        const ok = await salvarRef.current(tentativa);

        setEstado(ok ? "salvo" : "erro");
      } catch {
        // Rede caiu, aba em segundo plano, servidor reiniciando. Nada disso
        // pode derrubar o formulário: o texto continua na tela.
        setEstado("erro");
      } finally {
        emVoo.current = false;

        if (pendente.current) {
          pendente.current = false;
          await executar();
        }
      }
    }
    // `cv` e `salvar` ficam de fora de propósito: ambos são lidos por ref,
    // e incluí-los reintroduziria o laço de reagendamento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serializado, esperaMs]);

  return { estado };
}

/**
 * Assinatura do CONTEÚDO do currículo, ignorando metadado do servidor.
 *
 * `atualizadoEm` é gravado pelo servidor a cada salvamento e não é conteúdo
 * do usuário. Incluí-lo na comparação faz o autosave enxergar mudança onde
 * não houve: a gravação atualiza o carimbo, o carimbo muda a assinatura, e a
 * mudança dispara outra gravação — um laço que só para quando a aba fecha.
 *
 * Isso apareceu primeiro como falha de teste, com o currículo sendo recriado
 * a cada render, mas a armadilha é a mesma em produção assim que o servidor
 * devolver o documento com o carimbo atualizado.
 */
function assinaturaDoConteudo(cv: CvData): string {
  const { atualizadoEm: _ignorado, ...conteudo } = cv;
  return JSON.stringify(conteudo);
}
