export type EstadoAutosave = "ocioso" | "salvando" | "salvo" | "erro";

const TEXTO: Record<EstadoAutosave, string> = {
  ocioso: "",
  salvando: "Salvando…",
  salvo: "Salvo",
  erro: "Não conseguimos salvar. Suas respostas continuam aqui na tela.",
};

/**
 * Indicador de autosave.
 *
 * "Perder o preenchimento do usuário é o pior defeito possível neste produto"
 * — e a percepção de perda machuca quase tanto quanto a perda. Por isso o
 * estado de salvamento é visível, e não silencioso.
 *
 * `aria-live="polite"` faz o leitor de tela anunciar a mudança sem
 * interromper a digitação. "polite" e não "assertive": interromper alguém no
 * meio de uma frase para dizer "salvo" seria hostil.
 *
 * A mensagem de erro diz o que continua funcionando ("suas respostas
 * continuam aqui na tela") em vez de só anunciar a falha. Quem está preenchendo
 * currículo não precisa de mais um motivo para achar que perdeu tudo.
 */
export function IndicadorAutosave({ estado }: { estado: EstadoAutosave }) {
  return (
    <p
      className={`autosave autosave--${estado}`}
      role="status"
      aria-live="polite"
    >
      {TEXTO[estado]}
    </p>
  );
}
