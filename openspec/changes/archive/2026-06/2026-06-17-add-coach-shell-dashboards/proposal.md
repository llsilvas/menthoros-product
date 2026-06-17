# Proposal: add-coach-shell-dashboards

## Status

Proposed

## Why

O shell do coach (`/coach/athletes`, `/coach/calendar`, `/coach/insights`) precisa de visões
agregadas no escopo da assessoria: um roster enriquecido dos atletas, o calendário semanal com os
treinos planejados de todos os atletas e KPIs/insights consolidados. Hoje as métricas existem por
atleta (`MetricasDiarias`, adesão) mas não há endpoints que agreguem por tenant para o coach. Sem
isso, as três telas principais do coach ficam sem dados.

## What Changes

Adiciona endpoints de leitura agregada sob `/api/v1/coach/**`, todos
`@PreAuthorize("hasAnyRole('TECNICO','ADMIN')")` e `@RequireTenant`:

- `GET /api/v1/coach/atletas` → roster enriquecido: por atleta, `ctl/atl/tsb`, fase de periodização,
  `status` (active/warning/danger/paused), `lastActivity`, `weeklyVolume`. DTO `CoachAtletaResumoDto`.
- `GET /api/v1/coach/calendario-semanal?from=` → treinos planejados de todos os atletas do tenant na
  semana, com flags `isKeyWorkout`, `hasAlert`, `hasPendingSuggestion`. DTO `CoachCalendarioDto`.
- `GET /api/v1/coach/insights?from=&to=` → KPIs agregados + tendência de carga semanal + top atletas.
  DTO `CoachInsightsDto`.

## Capabilities

### ADDED Capabilities

- `coach-dashboards`: roster, calendário semanal e insights agregados por tenant para o coach.

## Impact

- **Depende de (por id):** `add-athlete-progress-endpoints` (#2) — PMC/zonas por atleta;
  `add-coach-attention-queue` (externa) — fonte dos alertas/flags (`hasAlert`, `status`);
  `add-weekly-athlete-review` (externa) — adesão/evolução para insights;
  `add-coach-suggestion-inbox` (#4) — flag `hasPendingSuggestion` (opcional: pode iniciar `false` se
  #4 ainda não entregue).
- **Reusa:** `MetricasDiarias`/repo, `AssessoriaMetricasController` (padrão agregado por tenant),
  repositórios de `TreinoPlanejado`/`PlanoSemanal`, `FasePeriodizacao`/`AtletaStatus`.
- **Arquivos de produção (trabalho futuro):** novo `CoachDashboardController`,
  `CoachDashboardService`/impl, DTOs `CoachAtletaResumoDto`, `CoachCalendarioDto`, `CoachInsightsDto`
  (records aninhados), mappers com null-check. Sem migração nova.
- **Sem breaking changes:** endpoints somente-leitura, novos.
