## Context

Fatia 2 de 3 do `weekly-athlete-review`. A Fatia 1 (`add-weekly-review-consolidation`) já entrega a revisão determinística persistida com `nextWeekFocus` template e `recommendationType`. Esta fatia troca o template por narrativa LLM (atrás de flag), injeta a revisão na geração do próximo plano e captura o sinal de aprendizado.

## Code Anchors (confirmados no backend — 2026-07-24)

- **Integração da geração de plano.** `IaService.geraPlanoSemanalAvancado(Atleta, PlanoMetaDados, Prova, ModoGeracaoPlano, @Nullable DecisaoProgressao)` (`IaService.java:22`, impl `IaServiceImpl.java:309`) → `PlanoTreinoPromptBuilder.buildOptimizedPrompt(...)` (`:171`), que acumula `historicoFinal` e retorna `PromptGerado(String, List<Constraint>)` (`:336`). O insumo da revisão entra como novo bloco `historicoFinal.append(...)` / novo formatter (padrão de ~10 formatters injetados) ou parâmetro extra. Caminho unitário síncrono `@Transactional` (`PlanoServiceImpl.java:129`); lote `@Async` (`BatchPlanProcessor.java:80`).
- **Feature flag.** Padrão `@Value("${...enabled:true}")` + `@ConditionalOnProperty` (ex.: `EncerramentoSemanaScheduler.java:41`). Usar `menthoros.weekly-review.llm.enabled`.
- **Custo LLM.** `CostTrackingAdvisor` (`ai/cost/CostTrackingAdvisor.java`) publica contadores Micrometer (`llm.tokens.*`, `llm.cost.estimated.usd`) com tags `model`+`route` em toda chamada roteada (`MultiModelConfig.java:52`); preços em `llm-pricing.yml`; log `[llm-usage]` via `LlmUsageLogger`. Para custo por atleta/mês, estender tags (cardinalidade) ou persistir por chamada (precedente `SkillExecution`).

## Goals / Non-Goals

**Goals:**
- narrativa `nextWeekFocus` por IA, restrita pelo `recommendationType`, atrás de flag
- revisão como insumo da geração do próximo plano
- captura de `focusOutcome` como sinal de aprendizado

**Non-Goals:**
- recalcular números no LLM (a consolidação é da Fatia 1, determinística)
- superfície visual (Fatia 3); métricas `.fit`; notificação ao atleta

## Decisions

### D5: Narrativa LLM restrita pelo `recommendationType`, atrás de flag (kill-switch)

**Decisão:** O `nextWeekFocus` passa a ser redigido por LLM sobre os sinais já consolidados, recebendo o `recommendationType` como restrição (a narrativa não pode contrariar o tipo determinístico). A geração fica atrás de `menthoros.weekly-review.llm.enabled`; desligada, volta ao template da Fatia 1. Uma segunda flag controla a injeção da revisão na geração de plano.

**Rationale:** Isola custo/qualidade de LLM; permite implementar sem esperar o gate A1 (aferido em canary) e rollback imediato sem perder o núcleo determinístico.

### D6: Coach-in-the-loop — insumo, nunca aplicação automática

**Decisão:** A revisão alimenta o contexto da geração do próximo plano, mas não altera o plano automaticamente, e não é exposta ao atleta.

### D7: Loop de aprendizado — `focusOutcome`

**Decisão:** Ao gerar/aprovar o próximo plano, registrar se o `nextWeekFocus` proposto foi mantido, editado ou descartado (`focusOutcome`). Campo aditivo à entidade da Fatia 1.

**Rationale:** Sinal proposta-IA vs. correção-do-coach — o moat que compõe com o `WeekSuggestion`.

## Technical Notes

### Delta de contrato (sobre a Fatia 1)

```text
+ nextWeekFocus     → narrativa LLM (atrás de flag; template como fallback)
+ focusOutcome      (PROPOSTO|MANTIDO|EDITADO|DESCARTADO)   ← migration aditiva
```

## Risks / Trade-offs

- **[Risco] Custo LLM fora do envelope** → flag desligada mantém template (Fatia 1); gate A1 em canary.
- **[Risco] Narrativa contraria o tipo determinístico** → `recommendationType` como restrição no prompt + teste (CA-LLM).
- **[Risco] Revisão vira ruído se ninguém consome** → `RevisaoConsumidaEvent` + `focusOutcome` detectam adoção baixa cedo.

## Migration Plan

1. Campo aditivo `focusOutcome`
2. Geração LLM de `nextWeekFocus` atrás de flag
3. Injeção na geração do próximo plano + `RevisaoConsumidaEvent`

## Rollback

- Flag da narrativa desligada ⇒ volta ao template determinístico da Fatia 1.
- Flag de injeção desligada ⇒ a revisão para de alimentar o plano, sem afetar planos existentes. Migration aditiva.

## Open Questions

- **A1 (gate de rollout)** — custo LLM real por atleta/mês vs. R$1,10; critério no proposal (§Gate do founder). Não bloqueia `/implement init`.
