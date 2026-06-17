# Proposal: add-athlete-progress-endpoints

## Status

Proposed

## Why

O shell do atleta (`/athlete/home` e `/athlete/progress`) precisa de séries e agregados que o backend
calcula internamente mas não expõe: a curva PMC (CTL/ATL/TSB/TSS), a distribuição de zonas, os
recordes pessoais, o readiness atual e um resumo de "hoje". A entidade `MetricasDiarias` já persiste a
série diária completa (`ctl/atl/tsb/tss/volumeKm`, além de `*_inicio_dia`/`*_fim_dia`) com
`MetricasDiariasRepository`, e `MetricasController` já segue o padrão sob
`/api/v1/atletas/{atletaId}/metricas`. Falta a superfície de leitura para o shell.

## What Changes

Adiciona endpoints de leitura tenant-aware (sob `MetricasController` existente ou novo
`AtletaProgressController`):

- `GET /api/v1/atletas/{id}/metricas/historico?from=&to=` → série PMC diária. DTO `PmcPontoDto`
  (`data, ctl, atl, tsb, tss`), lida de `MetricasDiarias`.
- `GET /api/v1/atletas/{id}/metricas/zonas?from=&to=` → distribuição de tempo por zona (z1–z5) +
  duração total no período, derivada dos treinos/etapas realizados.
- `GET /api/v1/atletas/{id}/recordes` → PRs (5k/10k/21k) derivados de treinos realizados.
- `GET /api/v1/atletas/me/readiness` → readiness atual (score + fatores), compondo os sinais das
  changes externas de readiness/carga.
- `GET /api/v1/atletas/me/home` → resumo "hoje": próximo treino planejado + métricas-chave.

Os endpoints `me/*` resolvem o `Atleta` do usuário autenticado via o vínculo de
`add-current-user-endpoint`.

## Capabilities

### ADDED Capabilities

- `athlete-progress`: leitura de PMC, zonas, recordes, readiness e resumo "hoje" para o shell do
  atleta.

## Impact

- **Depende de (por id):** `add-current-user-endpoint` (#1) — resolução de `me`;
  `add-continuous-daily-load-management` (externa) — garante `MetricasDiarias` em todos os dias e a
  carga objetiva; `add-daily-readiness-checkin` (externa) — readiness subjetivo.
- **Reusa:** `MetricasDiarias` + `MetricasDiariasRepository`, padrão de `MetricasController`,
  `getResumoSemanal`/`ResumoSemanalTreinoDto`.
- **Arquivos de produção (trabalho futuro):** controller(s), `AtletaProgressService`/impl, DTOs
  `PmcPontoDto`, `ZonaDistribuicaoDto`, `RecordeDto`, `ReadinessDto`, `AtletaHomeDto` (records),
  mappers com null-check. Sem migração nova (dados já existem).
- **Sem breaking changes:** endpoints somente-leitura, novos.
