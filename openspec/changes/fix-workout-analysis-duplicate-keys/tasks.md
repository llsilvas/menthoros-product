# Tasks: fix-workout-analysis-duplicate-keys

TDD (teste primeiro). Em `apps/menthoros-backend`:

- **Inner loop:** `./mvnw clean test`
- **Gate de entrega:** `./mvnw clean verify`

Branch: `feature/fix-workout-analysis-duplicate-keys` (a partir de `develop`, base `cafb000`).

Plano refinado no `/implement init` (2026-09-27), após DoR com `spec-reviewer` (READY) e Codex
(NOT READY, 4 achados — todos verificados no código e incorporados abaixo).

---

## 1. Parse tolerante na análise de treino

Desenho: um `StructuredOutputConverter<AnaliseWorkoutRawDto>` próprio, passado em
`.call().entity(converter)`. O `getFormat()` delega a um `BeanOutputConverter` — **as instruções de
formato/schema continuam indo no prompt** (trocar `.entity()` por `.content()` as removeria). O
`convert()` remove cercas markdown, tenta o parse **estrito** (detecção de duplicata num parser
próprio, sem mexer no `ObjectMapper` compartilhado) e, se falhar por chave repetida, registra `WARN`
e refaz com `readTree` (último valor vence) + `treeToValue`.

- [x] 1.1 Teste primeiro (CA1): conversor aceita `execution_score` e `primary_cause` repetidos,
      inclusive com valores **divergentes**, e fica com o último valor de cada chave.
      verify: teste do conversor verde.
- [x] 1.2 Teste primeiro (CA2): sem duplicata, com e sem cerca ```json, resultado idêntico ao do
      `BeanOutputConverter`; `getFormat()` igual ao do `BeanOutputConverter`.
      verify: mesmo teste, casos de equivalência verdes.
- [x] 1.3 Teste primeiro (CA3): texto que não é JSON lança exceção.
      verify: mesmo teste, caso de erro verde.
- [x] 1.4 Teste primeiro: `WARN` emitido só quando há chave repetida (não na resposta normal).
      verify: asserção sobre o log no teste do conversor.
- [x] 1.5 Implementar o conversor e usá-lo no `WorkoutAnalysisListener` (`.entity(converter)`).
      verify: `WorkoutAnalysisListenerTest` — resposta com duplicata termina `COMPLETED`; não-JSON
      termina `FAILED` (asserção de status, não só do conversor).

## 2. Temperatura baixa na chamada da análise (CA5)

`AnthropicChatModel` (Spring AI 1.1.6, linha 577) usa o `cacheOptions` das opções por chamada quando
não-nulo — e o default de `AnthropicChatOptions` é `DISABLED`. Opções só com `temperature`
**desligariam o cache de 1h do system prompt** configurado em `MultiModelConfig.opcoesAnthropic`.

- [x] 2.1 Extrair o `AnthropicCacheOptions` da rota para um ponto reutilizável em
      `MultiModelConfig` (sem mudar o comportamento das rotas).
      verify: testes existentes de `MultiModelConfig` seguem verdes.
- [x] 2.2 Teste primeiro: a chamada da análise passa `AnthropicChatOptions` com `temperature=0.2`
      **e** o mesmo `cacheOptions` da rota; model/maxTokens não são sobrescritos.
      verify: `WorkoutAnalysisListenerTest` captura as opções da chamada.
- [x] 2.3 Implementar no listener.
      verify: `./mvnw clean test`.

## 3. Preço do snapshot datado (CA4)

- [x] 3.1 Teste primeiro: `LlmPricingRegistry` resolve preço para `gpt-4o-mini-2024-07-18`, e o
      `CostTrackingAdvisor` registra custo (sem o caminho "sem preço") para esse modelo.
      verify: testes do registry e do advisor verdes.
- [x] 3.2 Adicionar a entrada em `llm-pricing.yml` com os valores de `gpt-4o-mini`.
      verify: `./mvnw clean test`.

## 4. Fechamento

- [x] 4.1 `./mvnw clean verify` sem falhas (2026-09-27: 4233 unit + 200 IT, 0 falhas).
- [ ] 4.2 Gate de eval exigido pelo `CLAUDE.md` para PR que toca `llm-pricing.yml` — decisão do
      founder registrada no PR.
- [ ] 4.3 `/qa` e PR para `develop`, sem merge local.
