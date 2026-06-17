## ADDED Requirements

### Requirement: Roster enriquecido do coach

O sistema SHALL expor `GET /api/v1/coach/atletas` (restrito a `TECNICO`/`ADMIN`, tenant-aware) que
retorna, para cada atleta do tenant, `ctl/atl/tsb` (último ponto), fase de periodização, `status`
(active/warning/danger/paused), `lastActivity` e `weeklyVolume`. A resposta SHALL ser
`ResponseEntity<List<CoachAtletaResumoDto>>`.

#### Scenario: Roster do tenant
- **WHEN** um `TECNICO` chama o endpoint
- **THEN** o sistema retorna apenas os atletas do seu tenant com os campos enriquecidos

#### Scenario: Atleta sem métricas
- **WHEN** um atleta não possui `MetricasDiarias`
- **THEN** o sistema retorna o atleta com métricas degradadas (nulas/zeradas) sem falhar

#### Scenario: Sem permissão de coach
- **WHEN** um usuário `ATLETA` chama o endpoint
- **THEN** o sistema retorna `403 Forbidden`

---

### Requirement: Calendário semanal do coach

O sistema SHALL expor `GET /api/v1/coach/calendario-semanal?from=` (restrito a `TECNICO`/`ADMIN`,
tenant-aware) que retorna os treinos planejados de todos os atletas do tenant na semana de `from`,
com flags `isKeyWorkout`, `hasAlert` e `hasPendingSuggestion`. Quando `from` for omitido, o sistema
SHALL usar a semana atual.

#### Scenario: Treinos de múltiplos atletas
- **WHEN** vários atletas do tenant têm treinos planejados na semana
- **THEN** o sistema retorna todos os treinos com identificação do atleta e as flags

#### Scenario: Semana padrão
- **WHEN** `from` não é informado
- **THEN** o sistema considera a semana atual

#### Scenario: Flags sem fontes externas entregues
- **WHEN** as changes externas de alertas/sugestões ainda não estão disponíveis
- **THEN** `hasAlert`/`hasPendingSuggestion` retornam `false` por padrão, sem erro

---

### Requirement: Insights agregados do coach

O sistema SHALL expor `GET /api/v1/coach/insights?from=&to=` (restrito a `TECNICO`/`ADMIN`,
tenant-aware) que retorna KPIs agregados, tendência de carga semanal e top atletas do tenant.

#### Scenario: Insights consolidados
- **WHEN** há dados no período
- **THEN** o sistema retorna KPIs, tendência de carga semanal e top atletas

#### Scenario: Período sem dados
- **WHEN** não há dados no período
- **THEN** o sistema retorna KPIs zerados e listas vazias, sem falhar
