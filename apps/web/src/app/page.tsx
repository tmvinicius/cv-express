import { redirect } from "next/navigation";
import { criarConexao } from "@cv-express/db";
import { iniciarSessao } from "../acoes/sessao";

/**
 * Nunca pré-renderizar.
 *
 * Não é detalhe de build: esta página CRIA uma sessão no banco. Gerada
 * estaticamente, ela criaria uma sessão no momento do build e serviria o
 * mesmo id para todo mundo — cada visitante cairia no currículo do anterior.
 */
export const dynamic = "force-dynamic";


/**
 * Entrada do produto: cria uma sessão anônima e redireciona.
 *
 * Sem tela de login, sem "criar conta", sem escolha nenhuma antes de começar.
 * Cada decisão a menos antes do primeiro campo é uma desistência a menos.
 */
export default async function Home() {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL não configurada.");

  const db = await criarConexao(url);
  const sessao = await iniciarSessao(db);

  redirect(`/cv/${sessao.id}`);
}
