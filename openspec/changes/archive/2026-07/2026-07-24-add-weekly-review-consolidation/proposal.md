**Tamanho:** M · **Trilha:** Full

> Full porque introduz schema novo (`tb_revisao_semanal`) e um hook no fluxo de encerramento de semana. Backend-only, **100% determinístico — sem LLM** (sem gate de custo A1). Fatia 1 de 3 do `weekly-athlete-review`; `add-weekly-review-llm-focus` (narrativa por IA + `focusOutcome`) e `add-weekly-review-coach-card` (leitura no shell do coach) dependem desta. Desenho consolidado em grelhagem 2026-07-24 (ver ADR-0006 no backend).

## Why

Fechar a semana de cada atleta é a tarefa mais repetitiva do treinador e não escala manualmente. Esta fatia entrega o **núcleo determinístico** da revisão: no encerramento da semana, congela o **sinal estruturado do que foi proposto ao coach** e o expõe por endpoint. É a base sobre a qual a narrativa por IA (Fatia 2) e a leitura no shell do coach (Fatia 3) se apoiam.

Escopo v1 (founder, CPO review 2026-07-24): sobre o **dado do log manual** já disponível, **sem** métricas de zona `.fit` e **sem** depender de `first-party-ingestion-architecture`.

## What Changes

- nova capability `weekly-athlete-review` (parte determinística), **ancorada 1:1 ao `PlanoSemanal`** — reusa `semana_inicio/fim`, `tsb_inicio/fim`, volumes; não inventa janela própria
- nova `tb_revisao_semanal` (1:1, FK única a `plano_semanal_id`) congelando: `recommendationType`, `adherenceStatus`, `dadosSuficientes`, `geradaEm`
- geração **event-driven no encerramento** da semana (`EncerramentoSemanaService`, manual ou fallback automático) — sem cron novo
- `adherenceStatus` **por contagem** na janela exata do plano `[semanaInicio, semanaFim]` (via `findComRealizadoByAtletaAndPeriodo` escopado à semana — **não** é o número rolante de 4 semanas do roster) + override "treino crítico faltando" (`TipoTreino.getFatorImpacto() ≥ 1.15`)
- `recommendationType` determinístico a partir de `adherenceStatus` + `PlanoSemanal.tsb_fim`
- `weekOverWeekDelta` **computado** (diff contra o `PlanoSemanal` anterior) — não persistido
- endpoint `GET` read-only da revisão, **coach-only**, sob `TenantContext`

## Critérios de aceite

- **CA1 — Geração no encerramento.** DADO um `PlanoSemanal` que transiciona para `CONCLUIDO` (via `EncerramentoSemanaService`), QUANDO o encerramento roda, ENTÃO uma `RevisaoSemanal` 1:1 é criada com `recommendationType`, `adherenceStatus`, `dadosSuficientes` e `geradaEm`. Antes do `CONCLUIDO`, o `GET` retorna **HTTP 404** (corpo vazio).
- **CA1b — Cortes de aderência (contagem na janela do plano).** DADO a contagem realizados/planejados na janela exata `[semanaInicio, semanaFim]` do plano, ENTÃO `adherenceStatus` é `ALTA` (≥90%), `MEDIA` (60–89%) ou `BAIXA` (<60% OU ≥1 treino de alta criticidade `TipoTreino.getFatorImpacto() ≥ 1.15` não realizado).
- **CA2 — RECOVERY.** DADO `PlanoSemanal.tsb_fim ≤ −25` OU (`adherenceStatus = BAIXA` E `tsb_fim ≤ −10`), ENTÃO `recommendationType = RECOVERY`.
- **CA2b — PROGRESS.** DADO `adherenceStatus = ALTA` E `tsb_fim ≥ −10` E `dadosSuficientes = true` E nenhum treino crítico faltando, ENTÃO `recommendationType = PROGRESS`.
- **CA2c — MAINTAIN (default).** DADO uma semana que não satisfaz RECOVERY nem PROGRESS, ENTÃO `recommendationType = MAINTAIN`.
- **CA3 — Dados insuficientes.** DADO <2 treinos realizados OU nenhum ponto de PMC/TSB válido na janela (inclui `PlanoSemanal.tsb_fim` nulo), ENTÃO `dadosSuficientes = false` e `recommendationType ≠ PROGRESS`.
- **CA3b — TSB ausente cai em MAINTAIN.** DADO `PlanoSemanal.tsb_fim` nulo, QUANDO a revisão é gerada, ENTÃO os ramos numéricos (RECOVERY/PROGRESS) não se aplicam e `recommendationType = MAINTAIN`.
- **CA-Congelamento — Fidelidade.** DADO uma `RevisaoSemanal` já gerada, QUANDO os limiares da regra (`−25`/`−10`/`90%`) mudam e a revisão é relida, ENTÃO `recommendationType` permanece o **congelado no encerramento** (não recalcula). _(Núcleo do ADR-0006.)_
- **CA6 — Idempotência.** DADO o mesmo `PlanoSemanal`, QUANDO o encerramento roda de novo, ENTÃO a `RevisaoSemanal` é upsert por `plano_semanal_id` — não duplica.
- **CA7 — Multi-tenant + coach-only.** DADO revisões de tenants distintos, ENTÃO geração/consulta respeitam `TenantContext`; o endpoint de leitura é coach-only (`@PreAuthorize hasAnyRole('TECNICO','ADMIN')`), nunca exposto ao atleta.
- **CA9 — Delta semana-a-semana (computado).** DADO um `PlanoSemanal` anterior do atleta, QUANDO a revisão é lida, ENTÃO `weekOverWeekDelta` traz Δaderência, ΔTSB e a transição de `recommendationType`; sem anterior ⇒ `PRIMEIRA_SEMANA` (nulo, sem erro).

## Métrica de sucesso

- **Desta fatia (correção):** a revisão gerada no encerramento é completa, determinística e **congelada** (reler após mudança de regra não altera o `recommendationType` — CA-Congelamento), e recuperável pelo endpoint coach-only.
- **North Star (realizada com a Fatia 3):** mediana de minutos que o treinador gasta para fechar a semana cai para ≤ 50% do baseline. Esta fatia é o pré-requisito de dado.

## Open Questions & Assumptions

- **A2 — Gatilho.** Event-driven no encerramento (`EncerramentoSemanaService`), não sob demanda nem cron próprio. Regeneração só por ação explícita (upsert por `plano_semanal_id`).
- **A3 — Criticidade de treino.** Sem conceito de "treino-chave" no backend; proxy `TipoTreino.getFatorImpacto() ≥ 1.15` (existente).
- **Sem gate A1:** esta fatia não usa LLM.

## Capabilities

### New Capabilities

- `weekly-athlete-review`

## Impact

**Produto:** entrega a base congelada e fiel da revisão; sozinha não é vista pelo coach (Fatia 3), mas destrava as outras duas e preserva o ground-truth do moat.

**Backend:**
- nova entidade/tabela `tb_revisao_semanal` (migration aditiva), FK única a `plano_semanal_id`
- hook em `EncerramentoSemanaService` para gerar/congelar a revisão no `CONCLUIDO`
- serviço de consolidação determinística (aderência por contagem + `recommendationType` sobre `tsb_fim`)
- endpoint `GET` read-only coach-only sob `TenantContext`

**Fora de escopo desta fatia:** narrativa `nextWeekFocus` por LLM, `focusOutcome` e insumo no plano (Fatia 2); card no shell do coach (Fatia 3); métricas `.fit`, notificação ao atleta, tendência multi-semana.
