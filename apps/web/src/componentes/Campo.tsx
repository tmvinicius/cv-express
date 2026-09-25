import { useId } from "react";

export interface CampoProps {
  rotulo: string;
  valor: string;
  aoMudar: (valor: string) => void;
  /** Mensagem de erro, se houver. */
  erro?: string;
  /** Texto de apoio abaixo do campo. */
  ajuda?: string;
  tipo?: "text" | "email" | "tel" | "url";
  obrigatorio?: boolean;
  multilinha?: boolean;
  placeholder?: string;
  maxLength?: number;
}

/**
 * Campo de formulário com rótulo, ajuda e erro ligados por id.
 *
 * O ponto deste componente é a amarração de acessibilidade, que é fácil de
 * errar quando cada tela monta o seu:
 *
 * - `htmlFor`/`id` ligam rótulo e campo, então clicar no rótulo foca o campo
 *   e o leitor de tela anuncia os dois juntos.
 * - `aria-describedby` aponta para a ajuda E para o erro, que é o que faz o
 *   erro ser LIDO em voz alta em vez de só aparecer em vermelho.
 * - `aria-invalid` marca o estado para tecnologia assistiva.
 * - O erro tem `role="alert"`, para ser anunciado assim que surge.
 *
 * Sem isso, quem usa leitor de tela descobre que errou só quando o botão de
 * avançar não funciona, sem saber onde nem por quê.
 */
export function Campo({
  rotulo,
  valor,
  aoMudar,
  erro,
  ajuda,
  tipo = "text",
  obrigatorio = false,
  multilinha = false,
  placeholder,
  maxLength,
}: CampoProps) {
  const id = useId();
  const idAjuda = `${id}-ajuda`;
  const idErro = `${id}-erro`;

  const descritoPor = [ajuda ? idAjuda : null, erro ? idErro : null]
    .filter(Boolean)
    .join(" ");

  const comuns = {
    id,
    value: valor,
    onChange: (e: { target: { value: string } }) => aoMudar(e.target.value),
    "aria-invalid": erro !== undefined,
    ...(descritoPor !== "" ? { "aria-describedby": descritoPor } : {}),
    ...(placeholder !== undefined ? { placeholder } : {}),
    ...(maxLength !== undefined ? { maxLength } : {}),
    required: obrigatorio,
  };

  return (
    <div className={`campo ${erro ? "campo--erro" : ""}`}>
      <label htmlFor={id} className="campo__rotulo">
        {rotulo}
        {/* aria-hidden no asterisco: `required` já informa a obrigatoriedade
            a quem usa leitor de tela, e ler "asterisco" seria ruído. */}
        {obrigatorio && <span aria-hidden="true"> *</span>}
      </label>

      {multilinha ? (
        <textarea {...comuns} className="campo__entrada" rows={5} />
      ) : (
        <input {...comuns} type={tipo} className="campo__entrada" />
      )}

      {ajuda && (
        <p id={idAjuda} className="campo__ajuda">
          {ajuda}
        </p>
      )}

      {erro && (
        <p id={idErro} className="campo__erro" role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}
