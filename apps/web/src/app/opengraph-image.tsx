import { ImageResponse } from "next/og";

import { CLARO } from "../estilos/paleta";
import { TITULO_DO_SITE } from "../compartilhamento/metadados";

/**
 * A imagem da prévia do link (WhatsApp, LinkedIn, X, Slack).
 *
 * Gerada pelo Next a partir deste componente, e não um PNG desenhado à mão:
 * as cores vêm da MESMA paleta da interface (`estilos/paleta.ts`), então uma
 * mudança de identidade visual muda a prévia junto. Os pares de cor são os
 * que a suíte de contraste já mede (texto e texto suave sobre o fundo,
 * primária sobre o fundo).
 *
 * Os `style={{…}}` aqui NÃO contrariam a regra de "nada de estilo inline"
 * da interface: isto não é DOM, é a entrada do gerador de imagem (Satori),
 * que só aceita estilo assim. Não há CSS a reaproveitar.
 *
 * A fonte é a Noto Sans que acompanha o Next — cobre ç, ã, é. Ela vem só no
 * peso regular, por isso a hierarquia é por tamanho, não por negrito.
 */
export const alt = TITULO_DO_SITE;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function ImagemDeCompartilhamento() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: CLARO.fundo,
          borderLeft: `24px solid ${CLARO.primaria}`,
          padding: "72px 80px",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 700 }}>
          <div style={{ fontSize: 36, color: CLARO.primaria, letterSpacing: 2 }}>CV Express</div>
          <div style={{ fontSize: 76, lineHeight: 1.1, color: CLARO.texto, marginTop: 28 }}>
            Seu currículo pronto em minutos
          </div>
          <div style={{ fontSize: 30, lineHeight: 1.4, color: CLARO.textoSuave, marginTop: 32 }}>
            Responda perguntas curtas e receba um PDF com cara de profissional. Sem cadastro.
          </div>
        </div>

        {/* Uma folha de currículo estilizada: título e linhas de texto. */}
        <div
          style={{
            width: 260,
            height: 360,
            display: "flex",
            flexDirection: "column",
            background: CLARO.superficieElevada,
            border: `2px solid ${CLARO.borda}`,
            borderRadius: 12,
            padding: 36,
          }}
        >
          <div style={{ width: 150, height: 22, background: CLARO.primaria, borderRadius: 4 }} />
          <div style={{ width: 120, height: 12, background: CLARO.borda, borderRadius: 4, marginTop: 14 }} />
          {[160, 188, 140, 188, 120, 170, 188, 130].map((largura, i) => (
            <div
              key={i}
              style={{
                width: largura,
                height: 10,
                background: i % 4 === 0 ? CLARO.primariaSuave : CLARO.superficie,
                borderRadius: 4,
                marginTop: i % 4 === 0 ? 30 : 12,
              }}
            />
          ))}
        </div>
      </div>
    ),
    size,
  );
}
