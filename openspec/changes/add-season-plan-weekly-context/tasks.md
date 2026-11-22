## 0. Baseline

- [x] 0.1 Golden do prompt com skeleton (motor ligado) gravado **antes** de qualquer mudança, ao lado do `PlanoTreinoPromptBuilderGoldenTest`
  - verify: passa em `develop` sem nenhuma alteração de código de produção

## 1. Modelo

- [x] 1.1 Migration `V119__add_season_week_to_plano_semanal.sql`: `season_week_id` (FK `tb_season_week(id)` `ON DELETE SET NULL`, nullable) e `target_deviation_pct NUMERIC(6,1)` nullable em `tb_plano_semanal`, índice em `season_week_id`; campos `seasonWeekId` e `targetDeviationPct` em `PlanoSemanal` (épico 1.10)
  - verify: o IT de contexto sobe com Flyway em Postgres limpo (feito, `SeasonPlanIT` 11/11); o `ON DELETE SET NULL` é afirmado no IT da 4.1, onde há plano semanal persistido

## 2. Contexto e fase

- [ ] 2.1 Record `SeasonWeekSnapshot` em `domain/planner` (`seasonWeekId`, `weekIndex`, `totalWeeks`, `phase`, `targetTss`, `targetVolumeKm`, `longRunKm`, `deload`, próximo marco opcional) (épico 5.1)
  - verify: compila; sem lógica própria
- [ ] 2.2 `PlanGenerationContextLoader` carrega `Optional<SeasonWeekSnapshot>` (gate: `season-plan.enabled`, temporada `ACTIVE`, `week_start = ctx.semanaInicio`, tenant-scoped) no `PlanGenerationContext`; `PlannerShadowService.mapToSnapshot` leva ao `PlannerInputSnapshot` (épico 5.2, 5.3)
  - verify: teste unitário do loader: flag off / sem ACTIVE / só PROPOSED / semana fora → vazio; ACTIVE com semana → snapshot com N de M e próximo marco
- [ ] 2.3 Helper de pós-prova (prova realizada nos 7 dias antes de `semanaInicio`, regra do `PeriodizationPlanner.java:64`) compartilhado; `PlannerEngine`: fase = `injuryPolicy.phaseOverride()` > pós-prova > `SeasonWeekSnapshot.phase` > `PeriodizationPlanner` (épico 5.4)
  - verify: teste do engine com as quatro combinações e prova no sábado anterior; sem snapshot, resultado igual ao atual
- [ ] 2.4 Métrica `season-plan.phase.divergence.count` (tags `seasonPhase`, `heuristicPhase`, `tenant`) no `PlannerShadowService`, só com shadow ligado (épico 5.5)
  - verify: teste com `SimpleMeterRegistry`: divergência conta 1; shadow off não registra

## 3. Prompt

- [ ] 3.1 `PeriodizacaoPromptFormatter`: bloco de posição no ciclo e alvo de TSS com base `targetTss` + reduções de `calcularTssAlvoAjustado`; com lesão ativa ou pós-prova na semana anterior, o bloco declara que essa fase prevalece. `PlanoTreinoPromptBuilder` usa o bloco no lugar da seção "PERIODIZAÇÃO E FASE ATUAL" e o alvo da temporada no "TSS Alvo Semanal" (épico 5.10)
  - verify: teste do formatter: bloco completo, sem marco, com pós-prova (prova no sábado), com lesão; alvo ×0,75 (fadiga moderada) e ×0,55 (sobrecarga ou progressão contínua)
- [ ] 3.2 Testes do prompt: com temporada, não há a seção legada nem `ctlAlvo * 7`; sem temporada / flag off / semana fora, os dois goldens (sem skeleton e o da 0.1, com skeleton) byte a byte iguais (épico 5.10a, 5.16)
  - verify: os dois goldens passam sem regravar

## 4. Persistência

- [ ] 4.1 `PlanGenerationPersister` grava `seasonWeekId` e `targetDeviationPct` (Σ `tssPlanejado` dos treinos persistidos, depois das transformações; nulo como 0; `targetTss` nulo/≤0 → nulo; uma casa) (épico 5.12)
  - verify: teste unitário da fórmula (normal, alvo nulo, treino sem TSS) + IT que gera com LLM mockado e lê a linha
- [ ] 4.2 Validar: `./mvnw clean verify` (épico 5.17)
