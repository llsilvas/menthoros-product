**Tamanho:** M · **Trilha:** Full

> Full porque toca o fluxo de geração do próximo plano (contrato de insumo do LLM) e introduz chamada LLM com gate de custo. Fatia 2 de 3 do `weekly-athlete-review` — **depende de `add-weekly-review-consolidation`** (Fatia 1). Backend-only.

## Why

A Fatia 1 entrega a revisão determinística com um `nextWeekFocus` template. Esta fatia adiciona a camada de IA — uma narrativa de foco por atleta — e **fecha o loop com a geração do próximo plano** e com o sinal de aprendizado (proposta da IA vs. edição do coach), que é o moat que compõe com o `WeekSuggestion`. É aqui que o custo/qualidade de LLM vive, isolado atrás de flag.

## What Changes

- `nextWeekFocus` gerado por **LLM atrás de flag**, substituindo o template da Fatia 1; recebe o `recommendationType` determinístico como **restrição** (não pode contrariar)
- injeção da revisão mais recente (`nextWeekFocus` + `risks`) como **insumo da geração do próximo plano**
- `focusOutcome` (MANTIDO|EDITADO|DESCARTADO) — registrado ao gerar/aprovar o próximo plano
- `RevisaoConsumidaEvent` — instrumentação do proxy de adoção
- coach-in-the-loop: revisão é insumo, nunca altera plano automaticamente, nunca exposta ao atleta

## Critérios de aceite

- **CA4 — Insumo da próxima prescrição.** DADO uma revisão mais recente do atleta, QUANDO o próximo plano é gerado (flag ligada), ENTÃO a geração consome `nextWeekFocus` e `risks` como contexto (verificável no insumo de geração).
- **CA5 — Coach-in-the-loop.** DADO uma revisão, ENTÃO ela nunca altera o plano automaticamente sem ação do coach e nunca é exposta ao atleta.
- **CA8 — Sinal de aprendizado.** DADO um `nextWeekFocus` apresentado na geração do plano, QUANDO o treinador o mantém, edita ou descarta, ENTÃO o sistema registra `focusOutcome ∈ {MANTIDO, EDITADO, DESCARTADO}` na revisão.
- **CA-LLM — Consistência e kill-switch.** DADO a flag da narrativa desligada, QUANDO a revisão é gerada, ENTÃO `nextWeekFocus` volta ao template determinístico (Fatia 1), sem chamada LLM; DADO a flag ligada, ENTÃO a narrativa é consistente com o `recommendationType` (nunca sugere progressão quando o tipo é RECOVERY/MAINTAIN).

## Métrica de sucesso

- **Proxy de adoção:** ≥70% dos planos seguintes gerados **consumindo** a revisão (`RevisaoConsumidaEvent` / `nextWeekFocus` não descartado).
- **Sinal de aprendizado (moat):** taxa de `focusOutcome` mantido vs. editado/descartado — registrada para compor com o `WeekSuggestion`.

## Gate do founder (bloqueante antes do rollout — não bloqueia `/implement init`)

- **A1 — Custo LLM.** ~1 chamada/semana/atleta. Validar em canary o custo real por atleta/mês contra o envelope de R$1,10 via `CostTrackingAdvisor` (Micrometer, tags `model`+`route`; para custo por atleta estender tags — cardinalidade — ou persistir por chamada, precedente `SkillExecution`). **Critério de decisão se estourar:** (a) manter a flag desligada (fica no template determinístico da Fatia 1); (b) reduzir cadência (quinzenal); (c) gerar só sob demanda quando o coach abrir. A narrativa nasce atrás de flag, então o custo é aferido sem travar o desenvolvimento.

## Open Questions & Assumptions

- **A2 — Gatilho.** Geração sob demanda (junto com a Fatia 1). Job automático fica pós-v1.
- Depende do contrato de `recommendationType` e da persistência da Fatia 1.

## Capabilities

### Modified Capabilities

- `weekly-athlete-review` (substitui `nextWeekFocus` template por narrativa LLM; adiciona `focusOutcome` e o insumo no plano)

## Impact

**Produto:** transforma a revisão determinística em "insight" personalizado ao coach e fecha o loop de aprendizado.

**Backend:**
- geração de `nextWeekFocus` via infra LLM existente atrás de flag `menthoros.weekly-review.llm.enabled`
- migration aditiva do campo `focusOutcome`
- ponto de integração `IaService.geraPlanoSemanalAvancado` → `PlanoTreinoPromptBuilder.buildOptimizedPrompt`
- `RevisaoConsumidaEvent`

**Fora de escopo:** card no shell do coach (Fatia 3); métricas `.fit`; notificação ao atleta.
