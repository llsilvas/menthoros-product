# Tasks: fix-llm-pricing-gpt4o-snapshot

TDD (teste primeiro). Em `apps/menthoros-backend`:

- **Inner loop:** `./mvnw clean test`
- **Gate de entrega:** `./mvnw clean verify`

Branch: `feature/fix-llm-pricing-gpt4o-snapshot` (a partir de `develop`).

---

## 1. Preço do snapshot datado do gpt-4o

- [ ] 1.1 Teste primeiro (CA1): `LlmPricingRegistry` resolve `gpt-4o-2024-08-06` com o mesmo preço
      de `gpt-4o`.
      verify: `LlmPricingRegistryTest` vermelho antes da entrada, verde depois.
- [ ] 1.2 Teste primeiro (CA2): `CostTrackingAdvisor` na rota `plano`, modelo `gpt-4o-2024-08-06`,
      100 in (40 cacheados) / 50 out: captura o `LlmCallRegistro` enviado ao ledger e confere
      `model`, `route` e `costUsd = 0.0007`, além da métrica `llm.cost.estimated.usd` — padrão já
      usado em `CostTrackingAdvisorTest` (captor do ledger).
      verify: `CostTrackingAdvisorTest` vermelho antes da entrada, verde depois.
- [ ] 1.3 Adicionar a entrada em `llm-pricing.yml` com os valores de `gpt-4o`.
      verify: `./mvnw clean test`.

## 2. Fechamento

- [ ] 2.1 `./mvnw clean verify` sem falhas (Docker local no ar — Testcontainers).
- [ ] 2.2 Gate de eval exigido pelo `CLAUDE.md` para PR que toca `llm-pricing.yml` — decisão do
      founder registrada no PR.
- [ ] 2.3 `/qa` e PR para `develop`, sem merge local.
