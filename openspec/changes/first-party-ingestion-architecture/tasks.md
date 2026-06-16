## Pré-requisitos
- [ ] 0.1 Decisão de dependência: adicionar `com.garmin:fit` ao `pom.xml` (a spec assumiu que já existia — não existe). Validar artefato/licença/build.
- [ ] 0.2 Confirmar que não há exporter/`WorkoutPlan` para espelhar — tratar a "simetria" como referência de design, não reuso.
- [ ] 0.3 Branch `feature/first-party-ingestion-architecture` em `apps/menthoros-backend` (`/implement init`).

## 1. Domínio provider-agnostic (TDD)
- [ ] 1.1 Records: `CompletedWorkout`, `WorkoutSample`, `HeartRateSummary`, `Decoupling`, `DedupKey`; enum `ImportSource`, `SportType` (se ausente).
- [ ] 1.2 `dedupKey()` — truncamento ao minuto + bucket de 50 m; teste com BVA nas bordas do bucket.

## 2. Persistência + dedup
- [ ] 2.1 Migration Flyway `tb_completed_workout` (summary + derivados `zone_time` JSONB + `decoupling_pct` + proveniência `source`/`external_id`/`consent_basis`/`imported_at`); raw samples gzip JSONB.
- [ ] 2.2 Índices: único `(tenant_id|assessoria_id, source, external_id)`; composto `(tenant_id, athlete_id, started_at)` para a busca fuzzy.
- [ ] 2.3 `CompletedWorkoutRepository.findByDedupKey(...)` + `save(...)`; teste do match primário e do fuzzy (mesmo run, 2 fontes).

## 3. Tenant guard
- [ ] 3.1 `TenantGuard.assertAthleteBelongsTo(athleteId, assessoriaId)`; teste negativo (atleta de outra assessoria → rejeita antes de parse/persist).

## 4. Sealed ImportRequest + WorkoutImportService
- [ ] 4.1 `sealed interface ImportRequest permits FitFileImport, HealthConnectImport, ManualImport`; `ImportContext`, `ConsentBasis`.
- [ ] 4.2 `WorkoutImportService.importWorkout` (`@Transactional`): guard → switch exaustivo → dedup → `enrich` → save → `WorkoutImportedEvent`.
- [ ] 4.3 Teste: dedup retorna `deduplicated` sem criar segundo registro.

## 5. FitFileImporter (caminho MVP, sem mobile)
- [ ] 5.1 `FitFileImporter.parse` + `FitActivityCollector` (FileId/Session/Record); `checkFileIntegrity` em stream separado.
- [ ] 5.2 Helpers dos gotchas: epoch FIT (`DateTime.getDate()`), semicircles→graus, nulabilidade, m/s.
- [ ] 5.3 `InvalidFitFileException` (íntegro/ACTIVITY) → mapeado no `GlobalExceptionHandler` (400/422).
- [ ] 5.4 Testes (Gherkin): upload válido → `CompletedWorkout(FIT_UPLOAD)`; arquivo corrompido → exceção, nada persiste.

## 6. HealthConnectImporter + ManualImporter
- [ ] 6.1 `HealthConnectActivityDto` (espelha o DTO mobile) + `HealthConnectImporter.parse` (mapper puro; `external_id = "hc:" + clientRecordId`).
- [ ] 6.2 `ManualImporter.parse` (`ManualWorkoutDto`).

## 7. Endpoints + evento
- [ ] 7.1 Endpoint upload FIT (multipart) `POST /api/v1/workouts/import/fit`; `POST /api/v1/workouts/import/health-connect`; manual. Controller só Service, `@RequireTenant`, Swagger.
- [ ] 7.2 `WorkoutImportedEvent` + `@TransactionalEventListener(AFTER_COMMIT)` `@Async` (gancho do analyzer vem de `add-workout-metrics-analyzer`).

## 8. Validação final
- [ ] 8.1 `/qa` (code-reviewer + security-reviewer + clean-code-reviewer) sem achado Crítico — atenção ao tenant guard.
- [ ] 8.2 `./mvnw clean test` verde (todos os cenários Gherkin).
- [ ] 8.3 Atualizar `tasks.md`; `/ship` (merge + archive + SPRINTS).
