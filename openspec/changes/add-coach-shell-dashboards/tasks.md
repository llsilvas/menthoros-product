# Tasks: add-coach-shell-dashboards

## 1. DTOs (records)

- [ ] 1.1 `dto/output/CoachAtletaResumoDto` (`atletaId`, `nome`, `ctl`, `atl`, `tsb`, `fase`,
  `status`, `lastActivity`, `weeklyVolume`).
- [ ] 1.2 `dto/output/CoachCalendarioDto` + record aninhado por treino
  (`atletaId`, `nome`, `data`, `tipoTreino`, `isKeyWorkout`, `hasAlert`, `hasPendingSuggestion`).
- [ ] 1.3 `dto/output/CoachInsightsDto` (KPIs agregados, `tendenciaCargaSemanal`, `topAtletas`).

## 2. Service

- [ ] 2.1 `getRoster()` agrega por tenant o último ponto de `MetricasDiarias`, fase
  (`FasePeriodizacao`), `status` (`AtletaStatus`/attention-queue), `lastActivity` e `weeklyVolume`.
  JavaDoc `Idempotent: YES`, `Side Effects: NONE`, `Tenant-aware: YES`.
- [ ] 2.2 `getCalendarioSemanal(from)` carrega `TreinoPlanejado` de todos os atletas do tenant na
  semana de `from` (default = semana atual) e anexa flags.
- [ ] 2.3 `getInsights(from, to)` consolida KPIs (adesão via `add-weekly-athlete-review`, volume,
  contagem por status) + tendência de carga semanal + top atletas.

## 3. Controller

- [ ] 3.1 `CoachDashboardController` `@RequestMapping("/api/v1/coach")` `@RequireTenant`
  `@PreAuthorize("hasAnyRole('TECNICO','ADMIN')")` `@Tag`.
- [ ] 3.2 `GET /atletas` → `ResponseEntity<List<CoachAtletaResumoDto>>`.
- [ ] 3.3 `GET /calendario-semanal?from=` → `ResponseEntity<CoachCalendarioDto>`.
- [ ] 3.4 `GET /insights?from=&to=` → `ResponseEntity<CoachInsightsDto>`.
- [ ] 3.5 `@Operation`/`@ApiResponses`/`@Parameter` em todos.

## 4. Testes

- [ ] 4.1 Roster: agrega só atletas do tenant; status derivado correto; atleta sem métricas degrada.
- [ ] 4.2 Calendário: inclui treinos de múltiplos atletas; flags corretas; semana default.
- [ ] 4.3 Insights: KPIs consistentes; período sem dados → zeros.
- [ ] 4.4 Autorização: `ATLETA`/`VISUALIZADOR` recebem `403` onde aplicável; isolamento de tenant.
- [ ] 4.5 `./mvnw clean test` — verde.
