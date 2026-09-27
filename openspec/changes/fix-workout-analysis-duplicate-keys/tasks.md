# Tasks: fix-workout-analysis-duplicate-keys

TDD (teste primeiro). Em `apps/menthoros-backend`:

- **Inner loop:** `./mvnw clean test`
- **Gate de entrega:** `./mvnw clean verify`

Branch: `feature/fix-workout-analysis-duplicate-keys` (a partir de `develop`).

---

## 1. Parse tolerante na análise de treino

- [ ] 1.1 Teste primeiro (CA1): resposta com `execution_score` e `primary_cause` repetidos é
      convertida em `AnaliseWorkoutRawDto`, com o último valor de cada chave.
- [ ] 1.2 Teste primeiro (CA2): resposta sem duplicata, com e sem cerca ```json, produz o mesmo
      resultado de hoje.
- [ ] 1.3 Teste primeiro (CA3): texto que não é JSON lança exceção (a análise continua `FAILED`).
- [ ] 1.4 Implementar a conversão tolerante e trocar o `.entity(AnaliseWorkoutRawDto.class)` do
      `WorkoutAnalysisListener`, com `WARN` quando houver chave repetida.
- [ ] 1.5 Teste primeiro (CA5): a chamada da análise usa temperatura 0.2 por chamada; implementar
      com opções no `ChatClient` (rota `COMPLEX` inalterada).
- **Validação:** `./mvnw clean test`

## 2. Preço do snapshot datado

- [ ] 2.1 Teste primeiro (CA4): `LlmPricingRegistry` resolve preço para `gpt-4o-mini-2024-07-18`.
- [ ] 2.2 Adicionar a entrada em `llm-pricing.yml` com os valores de `gpt-4o-mini`.
- **Validação:** `./mvnw clean test`

## 3. Fechamento

- [ ] 3.1 `./mvnw clean verify` sem falhas.
- [ ] 3.2 `/qa` e PR para `develop`, sem merge local.
