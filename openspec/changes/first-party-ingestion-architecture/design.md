# First-Party Workout Ingestion — Architecture Spec

**Status:** Draft · **Scope:** Ingestion (inbound). Symmetric to the existing `WorkoutExporter` (outbound). **Goal:** Ingest completed-activity data the athlete brings into Menthor.os — making it first-party, consented data we own — with zero dependency on the Garmin Developer Program or the Strava API.

## 1. Design principles

1. **Symmetry with the exporter.** We already model prescription outbound as `WorkoutPlan` + `WorkoutExporter`. Ingestion is the mirror: `CompletedWorkout` + pluggable inbound sources. Same provider-agnostic core.
2. **First-party provenance is the point.** The athlete uploads/syncs the activity into our app. The coach viewing it is sharing within our product — not us re-displaying a third party's data. This sidesteps Strava's display restriction and gives us clean, ownable training data for the ML acceptance predictor (which must never train on Strava-API-sourced data).
3. **Tenant isolation is a mandatory guard,** enforced before any parse or persist. Every import carries `assessoria_id` + `athlete_id`.
4. **Compute-on-import.** Derive zone distribution + aerobic decoupling at ingestion, persist the derived metrics, archive raw samples cheaply. Keeps Postgres lean and the analysis hot path off the LLM.
5. **Source-agnostic dedup.** The same run can arrive via FIT upload and Health Connect — dedup must catch cross-source duplicates.

## 2. Domain model (provider-agnostic)

```java
public record CompletedWorkout(
    UUID id,
    UUID assessoriaId,          // tenant
    UUID athleteId,
    SportType sport,            // RUN, BIKE, SWIM, ...
    Instant startedAt,
    Duration movingTime,
    Duration elapsedTime,
    double distanceMeters,
    HeartRateSummary heartRate, // avg, max + zone distribution (derived)
    Decoupling decoupling,      // derived (Pw:Hr / Pa:Hr drift), nullable
    List<WorkoutSample> samples,// time-series; may be archived out of PG
    ImportSource source,        // FIT_UPLOAD, HEALTH_CONNECT, HEALTHKIT, MANUAL
    String externalId,          // provenance + dedup anchor
    Instant importedAt
) {
    /** Cross-source dedup anchor: same athlete + sport + start (minute) + ~distance. */
    public DedupKey dedupKey() {
        return new DedupKey(
            athleteId, sport,
            startedAt.truncatedTo(ChronoUnit.MINUTES),
            Math.round(distanceMeters / 50.0) * 50 // 50m bucket
        );
    }
}

public record WorkoutSample(
    int offsetSeconds,
    Integer heartRate,   // bpm
    Double speedMps,     // m/s
    Integer cadence,
    Integer power,       // watts
    Double latitude, Double longitude, Double altitude
) {}

public record HeartRateSummary(Integer avg, Integer max, Map<HrZone, Duration> zoneTime) {}
public record Decoupling(Double percent) {}        // e.g. 4.2 == 4.2% drift
public record DedupKey(UUID athleteId, SportType sport, Instant minute, long distanceBucket) {}

public enum ImportSource { FIT_UPLOAD, HEALTH_CONNECT, HEALTHKIT, MANUAL /* STRAVA deferred behind flag */ }
```

## 3. Import requests — sealed hierarchy (Java 21)

Heterogeneous inputs (raw bytes vs. mobile DTO) modeled as a sealed interface so the router switch is exhaustive at compile time — when we add `StravaImport` later, the compiler forces us to handle it.

```java
public sealed interface ImportRequest
        permits FitFileImport, HealthConnectImport, ManualImport {
    ImportContext ctx();
}

public record ImportContext(UUID assessoriaId, UUID athleteId, ConsentBasis consent) {}

public record FitFileImport(ImportContext ctx, byte[] fitBytes, String filename) implements ImportRequest {}
public record HealthConnectImport(ImportContext ctx, HealthConnectActivityDto dto) implements ImportRequest {}
public record ManualImport(ImportContext ctx, ManualWorkoutDto dto) implements ImportRequest {}
```

## 4. Orchestrator — `WorkoutImportService`

```java
@Service
@RequiredArgsConstructor
public class WorkoutImportService {

    private final FitFileImporter fitImporter;
    private final HealthConnectImporter healthConnectImporter;
    private final ManualImporter manualImporter;
    private final TenantGuard tenantGuard;
    private final CompletedWorkoutRepository repo;
    private final WorkoutMetricsCalculator metrics;   // deterministic, zero LLM cost
    private final ApplicationEventPublisher events;

    @Transactional
    public ImportResult importWorkout(ImportRequest request) {
        var ctx = request.ctx();

        // 1. MANDATORY tenant guard — before any parse or persist.
        tenantGuard.assertAthleteBelongsTo(ctx.athleteId(), ctx.assessoriaId());

        // 2. Route to the source adapter (exhaustive over the sealed type).
        CompletedWorkout parsed = switch (request) {
            case FitFileImport f        -> fitImporter.parse(f);
            case HealthConnectImport h  -> healthConnectImporter.parse(h);
            case ManualImport m         -> manualImporter.parse(m);
        };

        // 3. Cross-source dedup (FIT upload + Health Connect of the same run).
        var existing = repo.findByDedupKey(ctx.assessoriaId(), parsed.dedupKey());
        if (existing.isPresent()) {
            return ImportResult.deduplicated(existing.get().id());
        }

        // 4. Compute-on-import: zone distribution + decoupling (deterministic, <50ms).
        CompletedWorkout enriched = metrics.enrich(parsed);

        // 5. Persist (summary + derived; raw samples archived per persistence policy).
        var saved = repo.save(enriched);

        // 6. Emit event -> async analysis pipeline (workout-analyzer skill).
        events.publishEvent(new WorkoutImportedEvent(saved.id(), ctx.assessoriaId(), ctx.athleteId()));

        return ImportResult.created(saved.id());
    }
}
```

The hot path is fully deterministic (no LLM). The `workout-analyzer` skill runs after commit, async:

```java
@Component
@RequiredArgsConstructor
class WorkoutAnalysisTrigger {
    private final WorkoutAnalyzerSkill analyzer;

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    void on(WorkoutImportedEvent e) {
        analyzer.analyze(e.workoutId()); // LLM narrative layer, off the import path
    }
}
```

## 5. `FitFileImporter` — Garmin FIT SDK decode

No new dependency — same `com.garmin:fit` artifact already pulled in for the FIT export path. The SDK decodes as well as it encodes.

```xml
<dependency>
  <groupId>com.garmin</groupId>
  <artifactId>fit</artifactId>
  <version>[21.176.0,)</version>
</dependency>
```

```java
@Component
public class FitFileImporter {

    public CompletedWorkout parse(FitFileImport req) {
        // Integrity check consumes the stream -> use a fresh stream for the actual read.
        try (var check = new ByteArrayInputStream(req.fitBytes())) {
            if (!new Decode().checkFileIntegrity(check)) {
                throw new InvalidFitFileException(req.filename() + ": failed integrity check");
            }
        } catch (IOException io) {
            throw new InvalidFitFileException(req.filename(), io);
        }

        var collector = new FitActivityCollector();
        Decode decode = new Decode();
        MesgBroadcaster broadcaster = new MesgBroadcaster(decode);
        broadcaster.addListener((FileIdMesgListener) collector::onFileId);
        broadcaster.addListener((SessionMesgListener) collector::onSession);
        broadcaster.addListener((RecordMesgListener)  collector::onRecord);

        try (var in = new ByteArrayInputStream(req.fitBytes())) {
            broadcaster.run(in);
        } catch (IOException io) {
            throw new InvalidFitFileException(req.filename(), io);
        }

        if (!collector.isActivity()) {
            throw new InvalidFitFileException(req.filename() + ": not an ACTIVITY file");
        }
        return collector.toCompletedWorkout(req.ctx());
    }
}
```

### FIT decode gotchas (why the helpers exist)

- **Epoch:** FIT timestamps are seconds since `1989-12-31T00:00:00Z`, not Unix. The SDK's `DateTime.getDate()` already converts — don't hand-roll it.
- **Position in semicircles:** `degrees = semicircles × 180 / 2^31`. Raw lat/long are `Integer`.
- **Units:** speed is m/s, distance meters, timer time seconds (Float). Convert to pace downstream, not here.
- **Nullability:** almost every getter returns `null` when the field is absent on that device — guard each.
- **Multisport:** a file can carry multiple `SessionMesg`. MVP takes the first; brick/triathlon handling is a future iteration (one `CompletedWorkout` per session).

## 6. `HealthConnectImporter` — on-device read, server-side map

Important boundary: Health Connect (Android) and HealthKit (iOS) are **client-side** APIs. The mobile athlete shell reads the activity locally with the athlete's consent, normalizes it, and POSTs a DTO. The server never talks to Health Connect — this importer is a **pure mapper**. This is what lets us bypass both the Garmin Developer Program and the Strava API entirely.

```java
public record HealthConnectActivityDto(
    String clientRecordId,        // Health Connect metadata id -> stable dedup anchor
    String exerciseType,          // "RUNNING", "BIKING", "SWIMMING", ...
    Instant startTime, Instant endTime,
    Long activeDurationSeconds,
    Double distanceMeters,
    Integer avgHeartRate, Integer maxHeartRate,
    List<HrSample> heartRateSamples
) {
    public record HrSample(Instant time, int bpm) {}
}
```

HealthKit (iOS) is symmetric: the iOS shell sends the same DTO shape, `ImportSource.HEALTHKIT`. One server mapper per platform; one DTO contract.

## 7. Persistence & dedup

- `completed_workout` (Postgres): summary + derived metrics (avg/max HR, `zone_time` JSONB, `decoupling_pct`) + provenance (`source`, `external_id`, `consent_basis`, `imported_at`). Lean, queryable, coach-cockpit ready.
- **Raw samples:** a 60-min run at 1 Hz ≈ 3,600 samples. For the pilot, persist as gzipped JSONB alongside the summary (tens of KB). At scale, move raw streams to object storage (S3) keyed by workout id, keeping only derived metrics in PG. **Decision:** derive-and-persist at import; raw is archival, not hot.
- **Dedup query:** primary on `(assessoria_id, source, external_id)`; fallback fuzzy match on `dedupKey()` (same athlete + sport + start-minute + 50 m bucket) to catch the same run arriving from two sources.

```java
public interface CompletedWorkoutRepository {
    Optional<CompletedWorkout> findByDedupKey(UUID assessoriaId, DedupKey key);
    CompletedWorkout save(CompletedWorkout w);
}
```

## 8. Acceptance criteria (Gherkin)

```gherkin
Feature: First-party workout ingestion

  Scenario: Valid FIT upload is ingested as first-party data
    Given an athlete belonging to assessoria A
    When a valid ACTIVITY .fit file is uploaded for that athlete
    Then a CompletedWorkout is persisted with source FIT_UPLOAD
    And its provenance records the consent basis and imported_at

  Scenario: Corrupt FIT file is rejected cleanly
    Given a .fit file that fails the integrity check
    When it is uploaded
    Then an InvalidFitFileException is raised
    And no CompletedWorkout is persisted

  Scenario: Same run from two sources is deduplicated
    Given a run already ingested via FIT_UPLOAD for an athlete
    When the same run arrives via HEALTH_CONNECT within the same minute and distance bucket
    Then the import returns "deduplicated"
    And no second CompletedWorkout is created

  Scenario: Tenant isolation is enforced before parsing
    Given an athlete that does NOT belong to assessoria A
    When an import is attempted under assessoria A
    Then the tenant guard rejects it
    And no file is parsed and nothing is persisted

  Scenario: Heart-rate samples produce derived metrics
    Given an imported workout with per-second heart-rate samples
    When ingestion completes
    Then HR zone distribution and aerobic decoupling are computed and stored
    And a WorkoutImportedEvent is published after commit
```

## 9. Out of scope / deferred

- **Strava** stays out of the sealed hierarchy until (a) we have legal clarity on inference-only use and (b) a per-athlete display path that satisfies the Nov-2024 restriction. When added, the compiler forces handling via the exhaustive switch. **Never feed Strava-API data into the ML acceptance predictor.**
- Multisport/brick decomposition (one workout per session).
- Raw-stream offload to object storage (post-pilot, when sample volume justifies it).
