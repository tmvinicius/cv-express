# @cv-express/ai

A camada de IA do CV Express. Ela faz duas coisas, e as duas são de
**organização, nunca de criação**:

- **Experiências:** transforma a descrição que a pessoa escreveu em tópicos
  claros (`polirExperiencia`).
- **Habilidades:** corrige capitalização, tira duplicatas, agrupa por
  categoria e descarta o que não é habilidade (`normalizarHabilidades`).

O produto inteiro se apoia em uma promessa: nada entra no currículo que a
pessoa não escreveu. Este pacote é onde essa promessa é cumprida, e ela é
cumprida em **código**, não em prompt.

---

## As duas camadas

```
apps/web  ──usa──▶  CvAiService           (servico.ts)   fala de currículo
                        │
                        ▼
                    LlmProvider            (porta.ts)     fala de texto e JSON
                        │
          ┌─────────────┼──────────────────┐
     AnthropicAdapter  OpenAiCompativelAdapter  MockAdapter
```

**O resto do projeto nunca sabe que existe um LLM.** `apps/web` importa só o
`CvAiService`, cujas assinaturas não mencionam prompt, modelo, temperatura nem
token. Trocar de provider não toca em nenhum arquivo fora deste pacote. Esse é
o critério de aceite, não uma aspiração: se uma troca exigir mudar um import
de `apps/web`, a fronteira está no lugar errado.

A porta `LlmProvider` é mínima de propósito: recebe sistema, usuário e o
schema esperado, e devolve texto e uso de tokens. Tudo o que é comum (extrair
o JSON, validar com Zod, tentar de novo uma vez, aplicar os guardrails) fica
**acima** dela, em `servico.ts`. Um adapter que validasse do seu jeito
mudaria o rigor da checagem junto com o provider, sem ninguém notar.

## Guardrails

Ficam em `guardrails.ts`, rodam sobre a saída de qualquer provider e não
dependem de o modelo obedecer ao prompt:

| Regra | O que recusa |
| --- | --- |
| Número inventado | Qualquer número na saída que não estava na entrada ("aumentei as vendas em 40%") |
| Habilidade inventada | Toda habilidade da saída precisa ter correspondente na entrada, comparando de forma normalizada |
| Teto de expansão | Saída maior que 1,5× o original (piso de 200 caracteres para textos curtos) |
| Formato | O Zod valida tudo; uma saída fora do schema ganha uma nova tentativa com o erro anexado, e depois vira `SAIDA_INVALIDA` |

Um modelo menor ou mais "criativo" não enfraquece nenhuma dessas regras:
ele só falha mais vezes, e a falha cai na degradação graciosa (o texto da
pessoa continua valendo). **Não afrouxe um guardrail para um provider
passar no contrato.** O contrato existe para reprovar o provider, não a
regra.

## Configuração

Por variável de ambiente, lida em `config.ts`:

| Variável | Para quê |
| --- | --- |
| `AI_PROVIDER` | `anthropic` (padrão), `openai-compativel` ou `mock` |
| `AI_API_KEY` | Chave explícita. Com `anthropic`, o SDK também aceita `ANTHROPIC_API_KEY`. Opcional em modelo local |
| `AI_MODEL` | Id do modelo. Obrigatório com `openai-compativel`. Com `anthropic`, o padrão é `MODELO_PADRAO`, em `adapters/anthropic.ts` |
| `AI_BASE_URL` | Só com `openai-compativel`. Ex.: `http://localhost:11434/v1` |
| `AI_SUPORTE_JSON` | Só com `openai-compativel`: `nativo` (padrão), `modo_json` ou `nenhum`. Ver a tabela de falhas abaixo |

`capacidadeIa()` responde se a configuração está completa sem fazer chamada
de rede. É o que permite ao formulário nascer com o botão de IA desligado, e
o motivo escrito, em vez de falhar no clique.

As **cotas** ficam em dois lugares. A que vale está no app web
(`apps/web/src/acoes/cotas.ts`): sessão conferida no banco, contadores no
Postgres e teto diário global. A `Cota` em memória de `servico.ts` é uma
segunda linha, por processo.

---

## Trocar de provider: o roteiro

A suíte de contrato (`src/__tests__/contrato.ts`) tem as mesmas asserções
para qualquer adapter: respeitou o schema, não inventou número nem
habilidade, respeitou o teto de expansão e tratou a tentativa de injeção como
texto. Ela roda de dois jeitos:

- **`pnpm test`**, a cada execução e no CI, contra o `MockAdapter` nos três
  modos de JSON. Não usa rede e não custa nada.
- **`pnpm contrato:real`**, só quando alguém pede, contra o provider que o
  ambiente configurar. Cada execução faz cerca de 6 chamadas (mais as novas
  tentativas, quando houver). Nunca entra no CI.

### 1. Escolha e configure

**Modelo local com Ollama** (sem custo, sem chave):

```bash
ollama pull llama3.1
ollama serve                     # se não estiver rodando

export AI_PROVIDER=openai-compativel
export AI_BASE_URL=http://localhost:11434/v1
export AI_MODEL=llama3.1
```

**Anthropic:**

```bash
export AI_PROVIDER=anthropic
export AI_API_KEY=sk-ant-...     # ou ANTHROPIC_API_KEY
# export AI_MODEL=...            # opcional; o padrão é MODELO_PADRAO
```

**Outros endpoints compatíveis com a API da OpenAI**: mesmo adapter, só muda
a URL (e, quando houver, a chave):

| Serviço | `AI_BASE_URL` |
| --- | --- |
| vLLM | `http://localhost:8000/v1` |
| LM Studio | `http://localhost:1234/v1` |
| OpenRouter | `https://openrouter.ai/api/v1` |
| Groq | `https://api.groq.com/openai/v1` |
| Together | `https://api.together.xyz/v1` |

### 2. Rode o contrato

```bash
pnpm run build                               # o pacote importa @cv-express/schema do dist/
pnpm --filter @cv-express/ai contrato:real
```

Ele recusa rodar com `AI_PROVIDER=mock` ou com a configuração incompleta, e
diz o porquê: um verde contra o mock aqui seria falso.

### 3. Leia o resultado

**Passou:** está trocado. Suba o app com as mesmas variáveis e use os dois
botões de IA uma vez, com um texto seu.

**Falhou:** a mensagem traz o código do erro e o detalhe do provider.

| O que aparece | Causa provável | O que fazer |
| --- | --- | --- |
| `SAIDA_INVALIDA` com `400` no detalhe | O endpoint não aceita `response_format` com `json_schema` | `AI_SUPORTE_JSON=modo_json`; se continuar, `nenhum` |
| `SAIDA_INVALIDA` sem status | O modelo devolveu algo que nem a extração tolerante transformou em JSON válido, duas vezes | `AI_SUPORTE_JSON=nenhum` (o schema vai descrito no prompt), ou um modelo maior |
| `GUARDRAIL` | O modelo inventou número ou habilidade, ou escreveu demais | Um modelo maior ou mais obediente. **Não** mude o guardrail |
| `TEMPO_ESGOTADO` | Modelo local lento demais (o limite é de 30 s por chamada, em `OpcoesServico.timeoutMs`) | Um modelo menor, GPU, ou aumentar o limite na composição em `apps/web/src/acoes/servicoIa.ts` |
| `NAO_AUTORIZADO` | Chave ausente ou recusada (401/403) | Conferir `AI_API_KEY` |
| `LIMITE_EXCEDIDO` | Rate limit do provider (429) | Esperar e rodar de novo |
| `INDISPONIVEL` | Endpoint fora do ar ou URL errada (5xx, conexão recusada) | Conferir `AI_BASE_URL` e se o servidor está no ar |

Um modelo que passa com `nativo` é o caso ideal. Passar só com `nenhum`
também vale: o mesmo caminho de código atende, só com mais novas tentativas.

---

## Acrescentar um adapter

1. Implemente `LlmProvider` (`porta.ts`) em `src/adapters/`. Traduza toda
   falha do provider para a taxonomia de `AiError` (`erros.ts`). Exceção crua
   não pode sair do adapter.
2. Acrescente o caso em `criarProviderDoAmbiente` **e** em `capacidadeIa`
   (`config.ts`). As duas precisam concordar sobre o que é "configurado", e
   `capacidade.test.ts` cobra isso.
3. Acrescente a verificação estrutural em "os adapters implementam a porta",
   no `contrato.test.ts`.
4. Rode `pnpm contrato:real` apontando para ele.

Os prompts (`prompts.ts`) são escritos uma vez, para todos os providers. Se
um modelo precisar de ajuste, faça um override declarado no adapter, não uma
cópia do prompt: prompt duplicado por provider diverge em silêncio.

## O que foi verificado

- A suíte de contrato contra o `MockAdapter`, nos três modos de JSON, a cada
  `pnpm test` e no CI.
- O `contrato:real` contra um servidor **falso** compatível com a OpenAI,
  rodando localmente. Ele passou nos três modos de JSON, com as chamadas HTTP
  saindo de fato do adapter (18 nos três modos). Com o servidor devolvendo um
  número inventado, a suíte reprovou com `GUARDRAIL`. Isso prova a ligação
  (ambiente → adapter → HTTP → validação → guardrails), **não a qualidade de
  um modelo**.
- **Nunca rodou contra um modelo de verdade.** A primeira execução com a
  Anthropic ou com o Ollama é a prova que falta.
