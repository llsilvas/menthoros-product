**Tamanho:** M · **Trilha:** Full

> Fatia **S8** do épico `add-season-plan-macrocycle`. Proposal, design (Decisões 5, 10, 10b, 10c) e
> decisões vivem lá; esta change só delimita o escopo e os cenários que a fecham.

## Why

A temporada aprovada passa a ser insumo da geração do plano semanal: a fase e a posição no ciclo chegam
ao prompt no lugar dos valores legados, e a divergência contra a heurística atual é medida em shadow,
sem mudar a carga ainda.

## What Changes

Tasks do épico: **1.10, 5.1–5.5, 5.10, 5.10a, 5.12, 5.16, 5.17**.

- Migration `semana_planejada_id` e `desvio_alvo_percentual` em `tb_plano_semanal`
- `SemanaPlanejadaSnapshot` no `PlanGenerationContext` e no `PlannerInputSnapshot`
- Fase pela ordem lesão > pós-prova > temporada > heurística
- Métrica `macrociclo.phase.divergence.count` (só com `planner-engine.shadow=true`)
- Bloco de posição no ciclo no prompt, **substituindo** a fase legada e o "TSS Alvo Semanal" (`ctlAlvo * 7`)
- `PlanoSemanal` grava `semanaPlanejadaId` e `desvioAlvoPercentual`

## Critérios de aceite

- **Dado** um atleta com temporada `ATIVO`, **quando** o plano semanal é gerado, **então** o prompt traz
  "semana N de M, fase, alvo, próximo marco" e não traz o "TSS Alvo Semanal" legado nem a fase por
  semanas faltando.
- **Dado** um atleta **sem** temporada `ATIVO`, **quando** o plano semanal é gerado, **então** o prompt e o
  resultado são idênticos ao comportamento atual (teste de regressão).
- **Dado** lesão registrada, **quando** a fase é resolvida, **então** a fase de lesão vence a da temporada.
- **Dado** um plano semanal persistido com temporada, **então** `semanaPlanejadaId` aponta para a semana e
  `desvioAlvoPercentual = (tss planejado − tssAlvo) / tssAlvo × 100`.
- **Dado** `planner-engine.shadow=false`, **então** a métrica de divergência não é produzida.

## Aberto antes de começar

- Task 0.3 do épico: combinar a ordem com `migrate-plan-prompt-to-skills` — o bloco de posição vai no
  `PeriodizacaoPromptFormatter` ou na skill.

## Dependências e rollout

- Depende de: `add-season-plan-versioning-approval` (S4) e da task 0.3.
- Flag: `macrociclo.enabled`; ligar `planner-engine.shadow` no tenant do piloto (task 10.6).
