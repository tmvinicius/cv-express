"use client";

import { useState } from "react";
import type { ResultadoConcluir } from "../acoes/concluir";
import { formatarPrazo } from "../formulario/prazo";

type Motivo = Extract<ResultadoConcluir, { ok: false }>["motivo"];

/**
 * O que a pessoa lê quando o envio não dá certo.
 *
 * Mesma regra das mensagens da IA: nunca culpar quem está lendo, sempre dizer
 * que o currículo continua salvo, nenhum detalhe técnico.
 */
const MENSAGENS: Record<Motivo, string> = {
  sem_configuracao:
    "O envio de e-mail está desligado neste ambiente. Seu currículo continua salvo, e você pode baixar o PDF agora.",
  dados_incompletos:
    "Precisamos de um e-mail válido em “Seus dados” para enviar o link. Seu currículo continua salvo.",
  sessao_ausente:
    "Este currículo não está mais disponível para edição — o prazo pode ter terminado.",
  limite_de_envios:
    "Já enviamos o link várias vezes para este currículo. Confira a caixa de entrada e o spam do último e-mail informado.",
  falha_envio:
    "Não conseguimos enviar o e-mail agora. Seu currículo está salvo; tente de novo em instantes.",
};

type Estado =
  | { fase: "ocioso" }
  | { fase: "enviando" }
  | { fase: "feito"; envio: "novo" | "ja_enviado"; email: string; expiraEm: string }
  | { fase: "erro"; motivo: Motivo };

/**
 * "Concluir e salvar": grava a versão final e manda para o e-mail do
 * currículo um link para voltar e editar.
 *
 * O prazo aparece por escrito em todos os estados em que ele existe. A regra
 * — 5 dias, contados da primeira conclusão, que editar não renova — é
 * contraintuitiva para quem está acostumado a "salvar renova", e uma regra
 * contraintuitiva que não está escrita na tela vira surpresa no sexto dia.
 */
export function ConcluirESalvar({
  disponivel,
  prazo,
  aoConcluir,
  aoConcluido,
  aoCorrigirEmail,
}: {
  /** O servidor consegue enviar e-mail? Só ele sabe; a página repassa. */
  disponivel: boolean;
  /** ISO do prazo, se o currículo já foi concluído antes. */
  prazo: string | null;
  aoConcluir: () => Promise<ResultadoConcluir>;
  /** Avisa o formulário do prazo, para o cabeçalho passar a mostrá-lo. */
  aoConcluido: (expiraEm: string) => void;
  aoCorrigirEmail: () => void;
}) {
  const [estado, setEstado] = useState<Estado>({ fase: "ocioso" });

  async function concluir() {
    setEstado({ fase: "enviando" });
    let r: ResultadoConcluir;
    try {
      r = await aoConcluir();
    } catch {
      // A Server Action lança quando a rede cai no caminho.
      r = { ok: false, motivo: "falha_envio" };
    }

    if (r.ok) {
      setEstado({ fase: "feito", envio: r.envio, email: r.email, expiraEm: r.expiraEm });
      aoConcluido(r.expiraEm);
    } else {
      setEstado({ fase: "erro", motivo: r.motivo });
    }
  }

  return (
    <section className="concluir" aria-labelledby="concluir-titulo">
      <h3 id="concluir-titulo" className="concluir__titulo">
        Quer voltar depois para ajustar?
      </h3>

      {estado.fase !== "feito" && (
        <p className="concluir__explicacao">
          {prazo
            ? `Você já concluiu este currículo, e o link enviado por e-mail vale até ${formatarPrazo(prazo)}. Concluir de novo salva as mudanças; o prazo continua o mesmo.`
            : "Ao concluir, enviamos para o seu e-mail um link para voltar e editar o currículo durante 5 dias. Editar não muda esse prazo."}
        </p>
      )}

      {/* role="status": o resultado é anunciado sem roubar o foco de quem
          está no botão. */}
      <div role="status" aria-live="polite" className="concluir__status">
        {estado.fase === "feito" && <Feito estado={estado} />}
        {estado.fase === "erro" && <p className="concluir__erro">{MENSAGENS[estado.motivo]}</p>}
      </div>

      <div className="concluir__acoes">
        <button
          type="button"
          className="concluir__botao"
          onClick={() => void concluir()}
          disabled={!disponivel || estado.fase === "enviando"}
        >
          {estado.fase === "enviando" ? "Salvando e enviando…" : "Concluir e salvar"}
        </button>

        {estado.fase === "erro" && estado.motivo === "dados_incompletos" && (
          <button type="button" onClick={aoCorrigirEmail}>
            Corrigir o e-mail
          </button>
        )}
      </div>

      {/* Botão desabilitado sai da ordem de tabulação; o motivo precisa estar
          escrito, e não só num tooltip. */}
      {!disponivel && <p className="concluir__explicacao">{MENSAGENS.sem_configuracao}</p>}
    </section>
  );
}

function Feito({
  estado,
}: {
  estado: Extract<Estado, { fase: "feito" }>;
}) {
  const prazo = formatarPrazo(estado.expiraEm);

  if (estado.envio === "novo") {
    return (
      <p className="concluir__ok">
        Pronto! Enviamos para <strong>{estado.email}</strong> um link para você voltar
        e editar. Ele vale até <strong>{prazo}</strong> (horário de Brasília) — editar
        não muda esse prazo. Não achou? Confira a caixa de spam.
      </p>
    );
  }

  return (
    <p className="concluir__ok">
      Salvo. O link que enviamos para <strong>{estado.email}</strong> continua valendo
      até <strong>{prazo}</strong> (horário de Brasília).
    </p>
  );
}
