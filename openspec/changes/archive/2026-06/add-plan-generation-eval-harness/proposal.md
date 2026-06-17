**Tamanho · Trilha:** S · Fast

> **Reescopo (product-lens, 2026-06-16):** esta change foi reduzida ao **trilho mínimo** — apenas o golden-master (Camada A). O `PlanQualityChecker` (Camada B) foi movido para `migrate-plan-prompt-to-skills`, onde é construído **por domínio**, conforme cada formatter é migrado (tem plano para verificar e a constraint vira relevante). A eval ao vivo com LLM (Camada C) foi **deferida ao Pós-MVP** — depende de uso real para ter baseline. Ver `PRODUCT-BRIEF.md`.

## Why

A geração de plano semanal é o coração do produto e está **sem rede de regressão**: `PlanoTreinoPromptBuilder.buildOptimizedPrompt` tem **533 linhas, 8 formatters e zero testes**, calibrado por tentativa-e-erro.

A thread de modernização de IA (`debito-tecnico → migrate-plan-prompt-to-skills → add-llm-tool-use → llm-code-switching`) vai **mutar o prompt repetidamente**. Sem uma rede, uma regressão no texto do prompt — e portanto na qualidade do plano — passa **silenciosa**. Esta change cria a rede mínima **antes** das mutações: um golden-master que falha no diff quando o prompt muda sem querer.

## What Changes

- **Golden-master de `buildOptimizedPrompt`:** harness de caracterização que congela a saída do prompt para um conjunto de **arquétipos de atleta** (iniciante sem lesão, avançado com TSB baixo, lesão ativa, taper/semana de prova, dados ausentes/fallbacks).
- **Determinismo:** data de referência fixada (clock/`TreinoHistoricoProvider` stubado) para o prompt ser reprodutível.
- **Regeneração explícita:** flag dedicada reescreve os arquivos golden; nunca automática — toda mudança de golden é decisão revisada no diff.

## Capabilities

### New Capabilities

- `plan-generation-quality`: caracterização (golden-master) do prompt de geração de plano como rede de regressão da thread de modernização de IA.

## Impact

**Backend (`apps/menthoros-backend`):**
- Fixtures/builders de arquétipos de atleta para teste de `buildOptimizedPrompt`.
- Golden-masters em `src/test/resources/` + harness de captura/assert/regeneração.

**Sem impacto em:** o fluxo de geração (a change só **observa**, zero mudança de comportamento), DTOs, entidades, migrations, controllers, frontend.

**Fora de escopo (movido/deferido):**
- `PlanQualityChecker` (aderência do plano às constraints) → **`migrate-plan-prompt-to-skills`**, por domínio.
- Eval ao vivo com LLM real → **Pós-MVP** (precisa de uso real para baseline).

**Posicionamento:** primeira da thread 🤖 no Bloco 1, **antes** de `migrate-plan-prompt-to-skills` — é a rede sobre a qual a migração corre.
