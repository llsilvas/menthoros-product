**Tamanho:** M · **Trilha:** Full

> Full porque toca o fluxo de geração do próximo plano (contrato de insumo do LLM) e introduz chamada LLM com gate de custo. Fatia 2 de 3 do `weekly-athlete-review` — **depende de `add-weekly-review-consolidation`** (Fatia 1). Backend-only.

## Why

A Fatia 1 entrega a revisão determinística congelada — o **sinal estruturado** do que foi proposto ao coach (`recommendationType`, `adherenceStatus`, `dadosSuficientes`), mas **sem nenhuma narrativa**. Esta fatia adiciona a camada de IA — uma narrativa de foco por atleta (`nextWeekFocus`) — e **fecha o loop com a geração do próximo plano** e com o sinal de aprendizado (proposta da IA vs. edição do coach). Esse loop compõe com o sinal de revisão/aprovação de plano do coach (`PlanoReviewStatus`/`origemAprovacao`), que é o moat. É aqui que o custo/qualidade de LLM vive, isolado atrás de flag.

## What Changes

- `nextWeekFocus` gerado por **LLM atrás de flag**, recebendo o `recommendationType` congelado da Fatia 1 como **restrição** (não pode contrariar). Flag desligada ⇒ um **template determinístico** derivado do `recommendationType` (fallback desta fatia, não da F1)
- persistência de `nextWeekFocus` e `focusOutcome` como **colunas aditivas na `tb_revisao_semanal`** (1:1 com o mesmo `PlanoSemanal` da Fatia 1)
- injeção da revisão mais recente (`nextWeekFocus` + `recommendationType`) como **insumo da geração do próximo plano**
- `focusOutcome` (MANTIDO|EDITADO|DESCARTADO) — registrado ao gerar/aprovar o próximo plano
- `RevisaoConsumidaEvent` — instrumentação do proxy de adoção
- coach-in-the-loop: revisão é insumo, nunca altera plano automaticamente, nunca exposta ao atleta

## Critérios de aceite

- **CA4 — Insumo da próxima prescrição.** DADO uma revisão mais recente do atleta, QUANDO o próximo plano é gerado (flag ligada), ENTÃO a geração consome `nextWeekFocus` e `recommendationType` como contexto (verificável no insumo de geração).
- **CA5 — Coach-in-the-loop.** DADO uma revisão, ENTÃO ela nunca altera o plano automaticamente sem ação do coach e nunca é exposta ao atleta.
- **CA8 — Sinal de aprendizado.** DADO um `nextWeekFocus` apresentado na geração do plano, QUANDO o treinador o mantém, edita ou descarta, ENTÃO o sistema registra `focusOutcome ∈ {MANTIDO, EDITADO, DESCARTADO}` na revisão.
- **CA-LLM — Consistência e kill-switch.** DADO a flag da narrativa desligada, QUANDO a revisão é gerada, ENTÃO `nextWeekFocus` é o template determinístico (derivado do `recommendationType`), sem chamada LLM; DADO a flag ligada, ENTÃO a narrativa é consistente com o `recommendationType` (nunca sugere progressão quando o tipo é RECOVERY/MAINTAIN).

## Métrica de sucesso

- **Proxy de adoção:** ≥70% dos planos seguintes gerados **consumindo** a revisão (`RevisaoConsumidaEvent` / `nextWeekFocus` não descartado).
- **Sinal de aprendizado (moat):** taxa de `focusOutcome` mantido vs. editado/descartado — registrada para compor com o sinal de revisão de plano do coach.

## Gate do founder (bloqueante antes do rollout — não bloqueia `/implement init`)

- **A1 — Custo LLM.** ~1 chamada/semana/atleta. Validar em canary o custo real por atleta/mês contra o envelope de R$1,10 via `CostTrackingAdvisor` (Micrometer, tags `model`+`route`; para custo por atleta estender tags — cardinalidade — ou persistir por chamada, precedente `SkillExecution`). **Critério de decisão se estourar:** (a) manter a flag desligada (fica no template determinístico); (b) reduzir cadência (quinzenal); (c) gerar só sob demanda quando o coach abrir. A narrativa nasce atrás de flag, então o custo é aferido sem travar o desenvolvimento.

## Open Questions & Assumptions

- **A2 — Gatilho.** `nextWeekFocus` é gerado **no encerramento da semana**, junto com a revisão da Fatia 1 (mesmo hook em `EncerramentoSemanaService`), atrás de flag. `focusOutcome` é registrado depois, na geração/aprovação do próximo plano.
- Depende do `recommendationType` congelado e da `tb_revisao_semanal` da Fatia 1.

## Capabilities

### Modified Capabilities

- `weekly-athlete-review` (adiciona a narrativa `nextWeekFocus`, o `focusOutcome` e o insumo no plano sobre o sinal determinístico da Fatia 1)

## Impact

**Produto:** transforma o sinal determinístico da revisão em "insight" personalizado ao coach e fecha o loop de aprendizado.

**Backend:**
- geração de `nextWeekFocus` via infra LLM existente atrás de flag `menthoros.weekly-review.llm.enabled`
- migration aditiva: colunas `next_week_focus` + `focus_outcome` em `tb_revisao_semanal`
- ponto de integração `IaService.geraPlanoSemanalAvancado` → `PlanoTreinoPromptBuilder.buildOptimizedPrompt`
- `RevisaoConsumidaEvent`

**Fora de escopo:** card no shell do coach (Fatia 3); métricas `.fit`; notificação ao atleta.
