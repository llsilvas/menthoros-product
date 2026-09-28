# Proposal: fix-llm-pricing-gpt4o-snapshot

**Tamanho:** XS · **Trilha:** Fast (backend-only, uma entrada de configuração e seus testes; sem
migration, sem contrato de API, sem mudança de prompt, schema ou modelo)

## Status

- Proposta inicial (2026-09-28), a partir da verificação de logs pós-deploy de
  `fix-workout-analysis-duplicate-keys`.

## Why

A geração de plano semanal — a rota `plano`, a mais cara e mais crítica do sistema — **não tem o
custo registrado**. A OpenAI devolve na resposta o nome do snapshot datado (`gpt-4o-2024-08-06`),
não o alias pedido (`gpt-4o`), e o `LlmPricingRegistry` busca preço por nome exato. O
`CostTrackingAdvisor` cai no caminho "sem preço": conta tokens, mas não custo — nem na métrica
`llm.cost.estimated.usd` nem no ledger de chamadas.

Evidência nos logs locais (infra do homelab), 2026-09-13 a 2026-09-27:

| Modelo devolvido | Rota | Ocorrências |
|---|---|---|
| `gpt-4o-2024-08-06` | `plano` | 46 |
| `gpt-4o-mini-2024-07-18` | `simple` | 4 — já corrigido em `fix-workout-analysis-duplicate-keys` |

Os modelos Anthropic (`claude-sonnet-4-6`, `claude-haiku-4-5-20251001`) nunca aparecem sem preço:
a Anthropic devolve o id pedido. A rota `expert` também usa `gpt-4o` e devolverá o mesmo snapshot
quando for usada.

## What Changes

- **`llm-pricing.yml`**: entrada `gpt-4o-2024-08-06` com os mesmos valores de `gpt-4o`
  (2.50 / 1.25 / 10.00 USD por MTok) — mesmo padrão de `gpt-4o-mini-2024-07-18` e
  `claude-haiku-4-5-20251001`.

## Impact

- `src/main/resources/llm-pricing.yml` e os testes de `LlmPricingRegistry` / `CostTrackingAdvisor`.
- **Migration:** nenhuma. **Contrato de API:** nenhum. **Front:** nenhum.

## Critérios de aceite

- **CA1 — Preço do snapshot resolvido**
  - **Given** o registro de preços carregado do `llm-pricing.yml`
  - **When** se pede o preço de `gpt-4o-2024-08-06`
  - **Then** o registro devolve o mesmo preço de `gpt-4o`

- **CA2 — Custo da geração de plano chega ao ledger**
  - **Given** uma resposta da rota `plano` com modelo `gpt-4o-2024-08-06` e uso de 100 tokens de
    entrada (40 em cache) e 50 de saída
  - **When** o `CostTrackingAdvisor` processa o uso
  - **Then** o `LlmCallRegistro` enviado ao ledger traz `model = gpt-4o-2024-08-06`,
    `route = plano` e `costUsd = 0.0007` (60 × 2.50 + 40 × 1.25 + 50 × 10.00 por MTok), e a métrica
    `llm.cost.estimated.usd` recebe o mesmo valor — não basta a métrica, o ledger é best-effort e
    pode divergir dela (achado do DoR/Codex)

## Métrica de sucesso

- Zero WARN `modelo 'gpt-4o-2024-08-06' sem preço` no log após o deploy.
- `llm.cost.estimated.usd` com a tag `route=plano` passa a ter valor em produção.

## Open Questions & Assumptions

1. **Gate de eval do `CLAUDE.md`** (PR que toca `llm-pricing.yml` cola a tabela do eval
   candidato): a mudança não altera prompt, schema nem modelo da geração de plano — só o preço
   usado para contabilizá-la. Precedente: dispensado pelo founder em
   `fix-workout-analysis-duplicate-keys` (backend PR #147). Decisão a confirmar no PR.
2. **Valores iguais aos do alias** — o alias `gpt-4o` aponta hoje para o snapshot `2024-08-06`; a
   tabela oficial da OpenAI dá o mesmo preço para os dois.

## Riscos e mitigações

- **Snapshot novo da OpenAI volta a quebrar o custo** (MÉDIO, recorrente): cada vez que o alias
  migrar de snapshot, o custo some de novo em silêncio. Mitigação desta change: nenhuma além do WARN
  existente. Mitigação estrutural fica como non-goal (abaixo), candidata a change própria.

## Follow-ups registrados (achados do DoR, fora de escopo)

- **`EvalCostCalculator` já resolve snapshot por prefixo** (`gpt-4o-2024-08-06` → `gpt-4o`) — é
  precedente no próprio código para a correção estrutural listada em Non-goals.
- **`EvalCostCalculator` ignora o cache**: cobra todo o input pela tarifa cheia, então o custo do eval
  diverge do ledger (no exemplo da CA2: 0.00075 vs 0.0007). Divergência preexistente; não usar
  igualdade eval↔ledger como aceite.

## Non-goals

- Resolver automaticamente sufixos de data no `LlmPricingRegistry` (ex.: `gpt-4o-2024-08-06` →
  `gpt-4o`). É a correção estrutural para o risco acima, mas muda o comportamento do registro para
  todos os modelos e merece change própria.
- Recalcular o custo histórico não registrado.
- Mudar modelo, temperatura ou prompt de qualquer rota.

## Referências

- `apps/menthoros-backend/src/main/resources/llm-pricing.yml`
- `ai/cost/LlmPricingRegistry.java` (busca por nome exato), `ai/cost/CostTrackingAdvisor.java`
- Change anterior do mesmo tipo: `archive/2026-09/2026-09-27-fix-workout-analysis-duplicate-keys/`
