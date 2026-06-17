# Tasks: add-coach-shell-dashboards

## 1. DTOs (records)

- [x] 1.1 `dto/output/CoachAtletaResumoDto` (`atletaId`, `nome`, `ctl`, `atl`, `tsb`, `fase`,
  `status`, `lastActivity`, `weeklyVolume`).
- [x] 1.2 `dto/output/CoachCalendarioDto` + record aninhado por treino
  (`atletaId`, `nome`, `data`, `tipoTreino`, `isKeyWorkout`, `hasAlert`, `hasPendingSuggestion`).
- [x] 1.3 `dto/output/CoachInsightsDto` (KPIs agregados, `tendenciaCargaSemanal`, `topAtletas`).

## 2. Service

- [x] 2.1 `getRoster()` agrega por tenant o último ponto de `MetricasDiarias`, fase
  (`FasePeriodizacao`), `status` (`AtletaStatus`/attention-queue), `lastActivity` e `weeklyVolume`.
  JavaDoc `Idempotent: YES`, `Side Effects: NONE`, `Tenant-aware: YES`.
- [x] 2.2 `getCalendarioSemanal(from)` carrega `TreinoPlanejado` de todos os atletas do tenant na
  semana de `from` (default = semana atual) e anexa flags.
- [x] 2.3 `getInsights(from, to)` consolida KPIs (adesão via `add-weekly-athlete-review`, volume,
  contagem por status) + tendência de carga semanal + top atletas.

## 3. Controller

- [x] 3.1 `CoachDashboardController` `@RequestMapping("/api/v1/coach")`
  `@PreAuthorize("hasAnyRole('TECNICO','ADMIN')")` `@Tag`. **Sem `@RequireTenant`**: os endpoints
  agregam por tenant (resolvido via `TenantContext` no serviço) e não recebem resource-id — `@RequireTenant`
  validaria um parâmetro de recurso inexistente. Mesmo padrão do `AssessoriaMetricasController`.
- [x] 3.2 `GET /atletas` → `ResponseEntity<List<CoachAtletaResumoDto>>`.
- [x] 3.3 `GET /calendario-semanal?from=` → `ResponseEntity<CoachCalendarioDto>`.
- [x] 3.4 `GET /insights?from=&to=` → `ResponseEntity<CoachInsightsDto>`.
- [x] 3.5 `@Operation`/`@ApiResponses`/`@Parameter` em todos.

## 4. Testes

- [x] 4.1 Roster: agrega só atletas do tenant; status derivado correto; atleta sem métricas degrada.
- [x] 4.2 Calendário: inclui treinos de múltiplos atletas; flags corretas; semana default.
- [x] 4.3 Insights: KPIs consistentes; período sem dados → zeros.
- [~] 4.4 `@PreAuthorize("hasAnyRole('TECNICO','ADMIN')")` em todos (403 garantido pelo Spring Security); isolamento de tenant via `TenantContext`/queries tenant-scoped no serviço. Teste de role-enforcement (401/403) **deferido** — padrão `@WebMvcTest(addFilters=false)` do projeto não exercita filtros de segurança.
- [x] 4.5 `./mvnw clean test` — verde (746 testes).

## 5. Follow-ups de QA (deferidos — não bloqueiam a entrega)

- [ ] 5.1 Variantes tenant-scoped dos finders por `atletaId` (`findLatestByAtletaId`,
  `findTopByAtletaIdOrderByDataTreinoDesc`, `findByAtletaIdAndDataTreinoBetween`) — hoje o isolamento
  é garantido pela raiz tenant-scoped do roster (`findAllByTenantIdOrderByNome`); defesa-em-profundidade
  no repositório fica como dívida **compartilhada com `add-athlete-progress-endpoints`**.
- [ ] 5.2 Teste de role-enforcement (401/403) — exige slice com Spring Security ativo
  (`@WithMockUser(roles="ATLETA")`); padrão atual do projeto é `@WebMvcTest(addFilters=false)`.
- [ ] 5.3 `status` como enum (`active/warning/danger/paused`) em vez de String literal — elimina
  magic strings; melhor abordar junto de `add-coach-attention-queue`, que redefine a heurística.
- [ ] 5.4 Batch-loading do roster (`IN (:atletaIds)`) para eliminar o N+1 de `montarResumo`
  (4 queries/atleta) — só compensa se o roster do tenant crescer muito.
- [ ] 5.5 Extrair `semanaIso`/`nomeCompleto` para util compartilhado (duplicado com `TreinoServiceImpl`).
