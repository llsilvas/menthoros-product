**Tamanho:** L · **Trilha:** Full

## Why

A ingestão de treinos hoje só está planejada via APIs de terceiros (família `strava-*`; Garmin exigiria o Developer Program). Essas fontes têm aprovação, rate limits, restrição de exibição (Strava, nov/2024) e — crítico — **não podem alimentar o ML acceptance predictor**. A ingestão **first-party** resolve isso: o atleta traz a atividade para dentro do produto (upload de `.fit`, ou sync via Health Connect/HealthKit), com consentimento, e o dado é **nosso, ownable e ML-safe** desde a origem.

Esta change é o **núcleo provider-agnostic** (espelho do exporter) do qual dependem `add-health-connect-ingestion` e `add-workout-metrics-analyzer`.

> Arquitetura detalhada (domínio, sealed hierarchy, orquestrador, FIT decode, dedup, Gherkin) em `design.md`.

## What Changes

- **Domínio provider-agnostic:** `CompletedWorkout`, `WorkoutSample`, `HeartRateSummary`, `Decoupling`, `DedupKey`, `ImportSource`.
- **`sealed interface ImportRequest`** (Java 21) permitindo `FitFileImport`, `HealthConnectImport`, `ManualImport` — switch exaustivo em tempo de compilação (Strava deferido força tratamento futuro).
- **`WorkoutImportService`** (`@Transactional`): **tenant guard antes de qualquer parse/persist** → roteia para o adapter → **dedup cross-source** (`(assessoria_id, source, external_id)` + fuzzy `dedupKey`) → `enrich` determinístico → persiste → publica `WorkoutImportedEvent` (`AFTER_COMMIT` `@Async`).
- **`FitFileImporter`** — decode via Garmin FIT SDK (caminho first-party que **não exige mobile nem API de terceiros**: o atleta sobe o `.fit`).
- **`HealthConnectImporter`** — mapper puro do `HealthConnectActivityDto` (o read on-device vive em `add-health-connect-ingestion`).
- **`ManualImporter`** — entrada manual.
- **Persistência:** `tb_completed_workout` (summary + métricas derivadas + proveniência); raw samples gzip JSONB no piloto, S3 em escala.

## Capabilities

### Added Capabilities
- `first-party-ingestion`: núcleo de ingestão de treinos consentidos e ownable, provider-agnostic, com FIT upload e entrada manual como fontes iniciais.

## Impact

**Correção factual (a spec assume um estado que não existe):** o `design.md` diz "symmetric to the existing `WorkoutExporter`" e "no new dependency — `com.garmin:fit` already pulled in". **No backend atual NÃO existem** `WorkoutExporter`, `WorkoutPlan` nem a dependência `com.garmin:fit`. Logo:
- **Adicionar** a dependência `com.garmin:fit` (decisão de dependência — justificar no escopo desta change).
- A "simetria com o exporter" é **conceitual** (não há exporter para espelhar); seguir o design como referência de estrutura, não como reuso.

**Código novo:** domínio + `WorkoutImportService` + 3 importers + `TenantGuard` + `CompletedWorkoutRepository` + `WorkoutImportedEvent` + endpoints de import (FIT multipart, `/import/health-connect`, manual). **Migration:** `tb_completed_workout` (+ índice de dedup). **Gancho:** `WorkoutMetricsCalculator.enrich` vem de `add-workout-metrics-analyzer`.

## Riscos e mitigações

- **Dependência nova `com.garmin:fit`** (Médio): não está no pom hoje; validar licença/artefato e build (a spec assumiu que já existia).
- **Spec escrita para estado futuro** (Médio): pressupõe exporter/WorkoutPlan inexistentes; recortar para o que existe e não criar acoplamento a algo ausente.
- **Volume de raw samples** (~3.600/treino) (Médio): política de persistência (gzip JSONB no piloto; S3 depois).
- **Tenant isolation** (Alto/segurança): `TenantGuard.assertAthleteBelongsTo` antes de parse/persist — não negociável.
- **Strava fora do sealed** até clareza legal; **nunca** alimentar o ML predictor com dado Strava-API (decisão de produto registrada).

## Referências
- `design.md` (arquitetura original). Filhas: `add-health-connect-ingestion`, `add-workout-metrics-analyzer`. Relacionada/deferida: família `strava-*`.
