**Tamanho:** L · **Trilha:** Full

## Why

A ingestão de treinos hoje depende de APIs de terceiros (família `strava-*`; Garmin exigiria o Developer Program) — com aprovação, rate limits e dado que não é first-party. **Health Connect (Android) e HealthKit (iOS) são stores client-side:** o atleta concede consentimento no próprio aparelho, lemos a atividade localmente e enviamos um `HealthConnectActivityDto` normalizado. O dado é **first-party desde a origem** (melhor para LGPD), sem chamar Garmin/Strava e sem rate limit.

> Conteúdo técnico detalhado (Kotlin, manifest, Changes API, Gherkin) preservado em `design.md`.

## What Changes

- **Módulo mobile (Android, Kotlin, `connect-client` 1.1.0):** permissões `READ_EXERCISE/HEART_RATE/DISTANCE/CALORIES` + `PermissionsRationaleActivity` (reusa a privacy policy do trabalho LGPD/Garmin); `HealthConnectReader` mapeia `ExerciseSessionRecord` → `HealthConnectActivityDto` (usa `aggregate` para não duplicar métricas cumulativas + amostras de FC brutas para zona/decoupling).
- **Sync incremental** via Changes token (deltas em vez de janela de tempo); fallback de 30 dias em `changesTokenExpired`.
- **Upload:** `POST /api/v1/workouts/import/health-connect` com retry (dedup do backend torna re-envio idempotente).
- **iOS/HealthKit simétrico** (`HKWorkout` + HR) emitindo o mesmo DTO com `source = HEALTHKIT`. Em React Native: native module ou `react-native-health-connect`, mesmo contrato.
- **Backend:** endpoint de import + `HealthConnectImporter` + dedup cross-source (`external_id = "hc:" + clientRecordId` + `dedupKey` fuzzy) — **parte de `first-party-ingestion-architecture`**.

## Capabilities

### Added Capabilities
- `health-connect-ingestion`: ingestão first-party de atividades via Health Connect/HealthKit no device do atleta, normalizada para o DTO de import do backend.

## Impact

- **Requer um app mobile (Android/iOS ou React Native).** Hoje o workspace tem apenas **backend + front web (Vite)** — **não existe shell mobile**. Esta change pressupõe esse cliente.
- **Backend:** endpoint `/workouts/import/health-connect` + `HealthConnectImporter` + dedup (do parent `first-party-ingestion-architecture`). Esta parte **pode ser entregue sem o mobile** e habilita testes via payload.
- **Reuso:** privacy policy LGPD; o mesmo endpoint serve FIT/HealthKit.

## Riscos e mitigações

- **BLOQUEADOR DE PRODUTO — não há app mobile** (Crítico): a leitura on-device exige um cliente Android/iOS/RN inexistente. Esta é uma **aposta estratégica que depende da decisão de construir mobile**. Mitigar: separar o **endpoint de import no backend** (entregável já, reutilizável por Strava-FIT também) do **read layer mobile** (gated na decisão de mobile).
- **Depende do parent de ingestão** (Alto): `first-party-ingestion-architecture` define endpoint + importer + dedup — sequenciar depois dela.
- **Janela de 30 dias do Health Connect** (Médio): só expõe dados de até 30 dias antes do consentimento — onboard o consentimento cedo.
- **Expiração do Changes token** (Baixo): fallback para leitura de janela de 30 dias e reemissão do token (já previsto no `design.md`).

## Referências
- `design.md` (spec técnica original).
- Dependência: `first-party-ingestion-architecture`. Relacionadas: família `strava-*` (estratégia alternativa de ingestão), `add-workout-metrics-analyzer` (consome os treinos importados).
