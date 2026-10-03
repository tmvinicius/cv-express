import { redirect } from "next/navigation";
import { resgatarLinkMagico } from "@cv-express/db";
import Link from "next/link";
import { obterBanco } from "../../../acoes/banco";

/**
 * O destino do link do e-mail: `/retomar/<token>`.
 *
 * Válido, leva ao preview do currículo — a pessoa volta "para dentro do
 * arquivo", vê o PDF e edita pelo painel de seções. O token fica só nesta
 * URL: depois do redirecionamento, o endereço da barra é o do currículo, e
 * o token não vai junto em cabeçalho Referer de nada que a página carregar.
 *
 * GET com efeito colateral (registra o último uso) é aceitável AQUI porque o
 * link é reutilizável: os verificadores de link de clientes de e-mail, que
 * abrem cada link antes da pessoa, só atualizam um carimbo. Com o link de
 * uso único do planejamento, eles o queimariam antes de a pessoa clicar.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Voltar ao currículo — CV Express",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

const MENSAGENS = {
  expirado: {
    titulo: "Este link expirou",
    texto:
      "O link vale por 5 dias a partir de quando você concluiu o currículo, e esse prazo terminou. Se você baixou o PDF, ele continua sendo seu.",
  },
  revogado: {
    titulo: "Este link foi substituído",
    texto:
      "Enviamos um link mais recente — provavelmente para outro e-mail que você informou depois. Use o link do e-mail mais novo.",
  },
  invalido: {
    titulo: "Não encontramos este link",
    texto:
      "Confira se o endereço foi copiado inteiro. Links quebrados em duas linhas pelo programa de e-mail são o motivo mais comum.",
  },
} as const;

/** 32 bytes em base64url. Formato errado nem chega ao banco. */
const FORMATO_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export default async function Retomar({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const r = FORMATO_TOKEN.test(token)
    ? await resgatarLinkMagico(await obterBanco(), token)
    : ({ ok: false, motivo: "invalido" } as const);

  // Fora de try/catch: o redirect do Next funciona lançando.
  if (r.ok) redirect(`/cv/${r.sessionId}?etapa=preview`);

  const m = MENSAGENS[r.motivo];
  return (
    <main className="retomar">
      <h1>{m.titulo}</h1>
      <p>{m.texto}</p>
      <Link className="retomar__novo" href="/">
        Começar um currículo novo
      </Link>
    </main>
  );
}
