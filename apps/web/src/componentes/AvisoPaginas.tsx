"use client";
import type { SugestaoCorte } from "../preview/sugestoesDeCorte";

/**
 * Aviso de currículo com mais de uma página.
 *
 * INFORMATIVO, nunca bloqueante: o download continua disponível. A regra de
 * uma página é convenção forte no Brasil, não lei, e há currículos legítimos
 * mais longos.
 *
 * O tom importa tanto quanto a informação. Quem está montando currículo
 * costuma estar numa situação difícil, e um aviso que soe como reprovação
 * cobra um preço emocional sem oferecer nada em troca. Por isso o texto
 * explica o porquê e aponta onde mexer.
 */
export function AvisoPaginas({
  paginas,
  sugestoes,
  aoIrPara,
}: {
  paginas: number;
  sugestoes: readonly SugestaoCorte[];
  aoIrPara?: (fieldId: string) => void;
}) {
  if (paginas <= 1) return null;

  return (
    <aside className="aviso-paginas" role="note">
      <p className="aviso-paginas__titulo">
        Seu currículo ficou com {paginas} páginas.
      </p>
      <p className="aviso-paginas__corpo">
        Currículos de uma página só costumam ser mais bem vistos por
        recrutadores — mas isso é uma recomendação, não uma regra. Você pode
        baixar assim mesmo.
      </p>

      <ul className="aviso-paginas__sugestoes">
        {sugestoes.map((s) => (
          <li key={s.texto}>
            {s.fieldId && aoIrPara ? (
              <button type="button" onClick={() => aoIrPara(s.fieldId as string)}>
                {s.texto}
              </button>
            ) : (
              s.texto
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
