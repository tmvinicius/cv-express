"use client";
import type { CvData } from "@cv-express/schema";
import { Campo } from "../Campo";
import type { Despachar } from "../../formulario/reducer";

export function DadosPessoais({
  cv,
  despachar,
  erros,
}: {
  cv: CvData;
  despachar: Despachar;
  erros?: Record<string, string>;
}) {
  const p = cv.pessoal;

  /**
   * Devolve as props do erro, já estreitadas.
   *
   * Com `exactOptionalPropertyTypes` ligado, `erro={talvezUndefined}` não
   * compila: a chave precisa NÃO EXISTIR quando não há erro, em vez de
   * existir valendo undefined. Concentrar isso aqui evita repetir o espalhamento
   * condicional em cada campo — e foi o que o build pegou quando a primeira
   * versão chamava o acessor duas vezes e impedia o estreitamento.
   */
  const propsErro = (campo: string): { erro: string } | Record<string, never> => {
    const mensagem = erros?.[campo];
    return mensagem !== undefined ? { erro: mensagem } : {};
  };

  return (
    <div className="etapa">
      <h2>Vamos começar pelo básico</h2>

      <Campo
        rotulo="Seu nome completo"
        valor={p.nome}
        aoMudar={(v) => despachar({ tipo: "pessoal", campo: "nome", valor: v })}
        obrigatorio
        {...propsErro("nome")}
      />

      <Campo
        rotulo="Cidade"
        valor={p.cidade}
        aoMudar={(v) => despachar({ tipo: "pessoal", campo: "cidade", valor: v })}
        ajuda="Onde você mora hoje. Só a cidade já basta."
        obrigatorio
        {...propsErro("cidade")}
      />

      <Campo
        rotulo="E-mail"
        tipo="email"
        valor={p.email}
        aoMudar={(v) => despachar({ tipo: "pessoal", campo: "email", valor: v })}
        ajuda="Aparece no currículo e serve para você voltar a editá-lo depois."
        obrigatorio
        {...propsErro("email")}
      />

      <Campo
        rotulo="Telefone"
        tipo="tel"
        valor={p.telefone ?? ""}
        aoMudar={(v) => despachar({ tipo: "pessoal", campo: "telefone", valor: v })}
        ajuda="Opcional. Com DDD."
      />

      <Campo
        rotulo="LinkedIn"
        tipo="url"
        valor={p.linkedin ?? ""}
        aoMudar={(v) => despachar({ tipo: "pessoal", campo: "linkedin", valor: v })}
        ajuda="Opcional. Cole o endereço completo do seu perfil."
        placeholder="https://linkedin.com/in/seu-perfil"
      />

      <Campo
        rotulo="GitHub"
        tipo="url"
        valor={p.github ?? ""}
        aoMudar={(v) => despachar({ tipo: "pessoal", campo: "github", valor: v })}
        ajuda="Opcional."
        placeholder="https://github.com/seu-usuario"
      />
    </div>
  );
}
