# Design (rascunho) — migrate-workout-analysis-to-openai

Escrito para `consolidate-llm-on-openai` e movido para cá em 2026-11-15, quando aquela change virou
só a troca de rota de tradução e classificação para `simple`. Vale **se** o fallback for necessário
para a rota `complex`. Antes de implementar, aplicar os cortes do review ponytail (seção final).

## D1. Fallback no `ModelRouter`, por função — não por decorador de `ChatClient`

`ChatClient` é uma interface fluente (`prompt().system().user().call()...`); decorá-la para
interceptar falhas exige reimplementar a cadeia inteira. Em vez disso:

```java
<T> T executar(TaskComplexity rota, Function<ChatClient, T> chamada)
```

O `ModelRouter` roda `chamada` no cliente primário. Se a falha for elegível (D2), roda **a mesma
função** no cliente de fallback da rota e registra a métrica (D4). O call site passa só prompt e
schema; nunca opções de provider. O perfil de cada provider vive no `defaultOptions` do
`ChatModel` derivado (padrão de `migrate-openai-retired-models`, D1.1), então o fallback chega com
as opções da Anthropic (incluindo `cacheOptions` do system prompt) sem o chamador saber.

**Rotas e pares (propriedades novas em `app.llm.routing.<rota>.fallback`):**
`complex`: primária `gpt-6-luna`, fallback `claude-sonnet-4-6` (decidir no eval). As demais rotas
não têm fallback (propriedade ausente = sem fallback, comportamento atual).

**Risco aberto (verificar na task 2.1):** `RaceProjectionNarrativeGenerator` passa
`AnthropicChatOptions` (temperatura 0.2, 1000 tokens) por chamada. Opções por chamada **substituem**
as da rota, e para a Anthropic o `cacheOptions` default é `DISABLED` (javadoc de
`MultiModelConfig.opcoesAnthropicPorChamada`). A saída é pedir temperatura e teto de tokens como
propriedades da rota — se não bastar, o `executar` aceita um `Function<Provider, ChatOptions>`.

## D2. O que aciona o fallback

| Falha na primária | Fallback? | Motivo |
|---|---|---|
| HTTP 5xx, 429 | sim | transitório, falha rápida (ADR-0008) |
| Timeout de leitura/conexão | sim, **sem retry na primária** | ADR-0008: "timeout vai direto para o fallback da rota" |
| HTTP 400, 401, 403, 404, 422 | **não** | erro nosso (payload, chave, modelo); a Anthropic repetiria o mesmo erro e esconderia o bug |
| Resposta que não parseia (`entity()`) | **não** nesta change | é problema de prompt/schema, não de disponibilidade |

A classificação mora em um único `LlmFalhaClassificador`, testado contra as exceções reais do
Spring AI 1.1.6 (`NonTransientAiException`, `TransientAiException`, `ResourceAccessException`,
`HttpServerErrorException`) — não contra strings de mensagem.

**Orçamento de tempo:** pior caso = `timeout_primária + timeout_fallback` (30 s + 30 s na
`standard`). Cada tentativa tem seu teto; não há retry dentro do fallback. Sem circuit breaker
(ADR-0008): o gatilho de reavaliação é "mais de um caminho repetindo chamadas em rajada". O
processamento em lote de análises passa a ser esse segundo caminho? — verificar na task 3.4; se
for, abrir a decisão antes de mergear em vez de adotar Resilience4j por padrão.

## D3. Sem migration

`tb_llm_call.model` já guarda o modelo que respondeu (`LlmCallLedger`), o que identifica o provider.
O fallback não precisa de coluna nova: o ledger registra uma linha por chamada lógica com o modelo
real, e a métrica traz o motivo. Se o ledger gravar hoje o modelo **configurado** em vez do
**retornado**, a task 3.3 corrige isso.

## D4. Métricas

`llm_fallback_total{rota,de,para,motivo}` (contador; `motivo` ∈ `http_5xx|http_429|timeout`).
Sem tag de alta cardinalidade. Alerta sugerido: razão fallback/chamadas da rota > 5% em 1 h.

## D5. Eval da tradução

Reaproveita o harness do bake-off (`EvalRunnerTest.construirChatClientReal`) com um grader novo e
pequeno: campo vazio, idioma (heurística PT-BR) e preservação de números e unidades. A comparação
é Haiku × Luna `none` nos mesmos 20 textos, mais revisão cega do coach (CA6). **Não** usa juiz LLM
como evidência principal (mesma regra do `plan-generation-eval-set`).

## D6. Rollback

Reverter o commit de configuração da rota `standard` (modelo primário volta a `claude-haiku`, sem
`fallback`). O código do mecanismo permanece, inerte sem propriedade `fallback`. Ensaiar o revert
em `develop` antes de mergear em `main`.

## D7. Rejeitado

- **Decorar `ChatClient`:** custo alto, frágil a mudança de versão do Spring AI.
- **Resilience4j:** viola o ADR-0008; gatilho não atingido.
- **`Advisor` de fallback:** o advisor roda dentro da cadeia de uma requisição já montada com as
  opções do provider primário; reconstruir a requisição para o outro provider é pior que re-executar
  a função.

## Cortes do review ponytail (2026-11-15) — aplicar antes de implementar

- **Sem `llm_fallback_total` nem alerta (D4):** `tb_llm_call` já grava o modelo **retornado**
  (`CostTrackingAdvisor.Medicao.model`, de `metadata.getModel()`) e `llm.*{model,route}` já existe.
  A fatia de fallback sai de `SELECT route, model, count(*) FROM tb_llm_call GROUP BY 1, 2`.
- **D3 resolvido:** a verificação "o ledger grava o modelo retornado" já é verdade no código.
- **Sem validação de boot própria do fallback:** basta o modelo de fallback entrar na checagem do
  `LlmPricingRegistry`, que já se recusa a subir com modelo roteado sem preço.
- **Sem smoke test `eval-real` do fallback:** a chave Anthropic segue viva enquanto houver rota
  Anthropic em produção (`standard` com a narrativa de projeção).
- **Gatilho do ADR-0008 (lote em rajada):** pergunta, não task; responder numa frase aqui.
- **Fallback só para `complex`**, não genérico por rota, até existir uma segunda rota que precise.
- **Bug de spec:** o `RetryTemplate` de `LlmRetryConfig` retenta `TransientAiException` (5xx, 429)
  até `spring.ai.retry.max-attempts` **antes** de a exceção chegar ao fallback. Testes não podem
  esperar "1 chamada na primária" para 5xx/429; só para timeout (não retentado).
