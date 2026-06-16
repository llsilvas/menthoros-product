# Workout Metrics + Analyzer Wiring

**Status:** Draft · **Depends on:** `first-party-ingestion-architecture.md`
**Goal:** Fill the two hooks left open in the ingestion spec —
(1) `WorkoutMetricsCalculator.enrich()` (deterministic, zero-LLM, <50ms) and
(2) the `workout-analyzer` skill triggered by `WorkoutImportedEvent` after commit.

Architecture rule honored: **deterministic calculation layer** (zone time, decoupling) is computed in plain Java with zero LLM cost; the **LLM narrative layer** only writes prose on top of facts it cannot miscalculate.

---

## 1. HR zones — athlete-scoped, not global

Zone boundaries are per-athlete (LTHR- or HRmax-derived). They must come from the athlete profile, never hardcoded.

```java
public enum HrZone { Z1, Z2, Z3, Z4, Z5 }

/** Lower bpm bound per zone (inclusive). Z5 has no upper bound. */
public record AthleteZoneProfile(UUID athleteId, NavigableMap<Integer, HrZone> lowerBounds) {

    public HrZone zoneFor(int bpm) {
        var entry = lowerBounds.floorEntry(bpm);
        return entry == null ? HrZone.Z1 : entry.getValue();
    }

    public static AthleteZoneProfile fromLthr(UUID athleteId, int lthr) {
        // Coggan-style %LTHR boundaries (running). Tune per methodology (Lydiard etc.).
        var m = new TreeMap<Integer, HrZone>();
        m.put((int)(lthr * 0.00), HrZone.Z1); // recovery
        m.put((int)(lthr * 0.85), HrZone.Z2); // aerobic
        m.put((int)(lthr * 0.90), HrZone.Z3); // tempo
        m.put((int)(lthr * 0.95), HrZone.Z4); // threshold
        m.put((int)(lthr * 1.00), HrZone.Z5); // VO2max+
        return new AthleteZoneProfile(athleteId, m);
    }
}
```

---

## 2. `WorkoutMetricsCalculator` — zone time + aerobic decoupling

```java
@Component
@RequiredArgsConstructor
public class WorkoutMetricsCalculator {

    private final AthleteZoneRepository zones;

    public CompletedWorkout enrich(CompletedWorkout w) {
        var profile = zones.profileFor(w.athleteId());
        Map<HrZone, Duration> zoneTime = computeZoneTime(w.samples(), profile);
        Decoupling decoupling = computeDecoupling(w.samples(), w.sport());

        var hr = new HeartRateSummary(
            w.heartRate().avg(), w.heartRate().max(), zoneTime
        );
        return w.withHeartRate(hr).withDecoupling(decoupling); // record "wither" helpers
    }

    /** Accumulate time-in-zone using the gap to the next sample as each sample's weight. */
    private Map<HrZone, Duration> computeZoneTime(List<WorkoutSample> s, AthleteZoneProfile p) {
        var acc = new EnumMap<HrZone, Long>(HrZone.class); // seconds
        for (int i = 0; i < s.size(); i++) {
            Integer hr = s.get(i).heartRate();
            if (hr == null) continue;
            long dt = (i + 1 < s.size())
                ? Math.max(0, s.get(i + 1).offsetSeconds() - s.get(i).offsetSeconds())
                : 1L; // last sample: assume 1s
            acc.merge(p.zoneFor(hr), dt, Long::sum);
        }
        var out = new EnumMap<HrZone, Duration>(HrZone.class);
        acc.forEach((z, sec) -> out.put(z, Duration.ofSeconds(sec)));
        return out;
    }

    /**
     * Aerobic decoupling (Pa:Hr for run, Pw:Hr for bike).
     * Split the effort in half by time; compare efficiency factor (output/HR) per half.
     * decoupling% = (EF_first - EF_second) / EF_first * 100.
     * Positive => HR drifted up for the same output (lower aerobic durability).
     */
    private Decoupling computeDecoupling(List<WorkoutSample> s, SportType sport) {
        var usable = s.stream()
            .filter(x -> x.heartRate() != null && x.heartRate() > 0 && output(x, sport) != null)
            .toList();
        if (usable.size() < 60) return new Decoupling(null); // not enough signal

        int mid = usable.size() / 2;
        Double efFirst  = efficiencyFactor(usable.subList(0, mid), sport);
        Double efSecond = efficiencyFactor(usable.subList(mid, usable.size()), sport);
        if (efFirst == null || efSecond == null || efFirst == 0.0) return new Decoupling(null);

        double pct = (efFirst - efSecond) / efFirst * 100.0;
        return new Decoupling(Math.round(pct * 10.0) / 10.0); // 1 decimal
    }

    private Double efficiencyFactor(List<WorkoutSample> half, SportType sport) {
        double sumOut = 0, sumHr = 0; int n = 0;
        for (var x : half) {
            Double out = output(x, sport);
            if (out == null || x.heartRate() == null) continue;
            sumOut += out; sumHr += x.heartRate(); n++;
        }
        if (n == 0 || sumHr == 0) return null;
        return (sumOut / n) / (sumHr / n);
    }

    /** Output channel: speed (m/s) for run, power (W) for bike when present. */
    private Double output(WorkoutSample x, SportType sport) {
        return switch (sport) {
            case BIKE -> x.power() != null ? x.power().doubleValue() : x.speedMps();
            default   -> x.speedMps();
        };
    }
}
```

**Cost:** pure arithmetic over a few thousand samples — sub-millisecond in practice, comfortably inside the <50ms budget and zero token spend.

---

## 3. The `workout-analyzer` skill — narrative on top of facts

Per the skills architecture: a versioned `SKILL.md` (cognitive scaffolding) + the deterministic facts above + an LLM narrative layer. The model only **interprets** numbers it’s handed; it never computes them.

### 3.1 Skill file (excerpt) — `skills/workout-analyzer/SKILL.md`
```markdown
# Workout Analyzer
ROLE: You analyze ONE completed endurance session for a coach to review.
INPUT: deterministic facts block (English). Do not recompute any number.
OUTPUT (pt-BR): 2–4 sentences. Keep sport terms in English
        (TSS, decoupling, threshold, Z1–Z5, tempo, VO2max).
RULES:
- If decoupling > 5%, flag aerobic durability as a watch-point.
- Tie zone distribution to the session's likely intent (base / tempo / threshold).
- This is a PROPOSAL for the coach, never shown directly to the athlete.
```

### 3.2 Skill execution (code-switching + model routing)
```java
@Component
@RequiredArgsConstructor
public class WorkoutAnalyzerSkill {

    private final CompletedWorkoutRepository repo;
    private final SkillLoader skills;        // loads versioned SKILL.md
    private final LlmRouter llm;             // multi-model routing
    private final WorkoutAnalysisRepository analyses;

    public void analyze(UUID workoutId) {
        var w = repo.require(workoutId);
        String facts = renderFacts(w);                 // English, deterministic
        String system = skills.load("workout-analyzer"); // versioned scaffolding

        // Simple, bounded analysis -> cheapest capable model.
        String narrative = llm.complete(
            ModelTier.HAIKU,                            // Claude Haiku 4
            system,
            facts,
            CompletionOpts.builder().maxTokens(220).temperature(0.3).build()
        );

        analyses.save(WorkoutAnalysis.proposal(
            w.id(), w.assessoriaId(), w.athleteId(), narrative, flags(w)
        ));
        // surfaces in the coach cockpit as a PENDING insight (coach-in-the-loop)
    }

    /** Facts in English: assertive instructions + larger corpus; output stays pt-BR. */
    private String renderFacts(CompletedWorkout w) {
        var z = w.heartRate().zoneTime();
        return """
            sport=%s
            moving_time_min=%d
            distance_km=%.2f
            avg_hr=%s max_hr=%s
            zone_time_min: Z1=%d Z2=%d Z3=%d Z4=%d Z5=%d
            aerobic_decoupling_pct=%s
            """.formatted(
            w.sport(),
            w.movingTime().toMinutes(),
            w.distanceMeters() / 1000.0,
            w.heartRate().avg(), w.heartRate().max(),
            min(z, HrZone.Z1), min(z, HrZone.Z2), min(z, HrZone.Z3),
            min(z, HrZone.Z4), min(z, HrZone.Z5),
            w.decoupling() == null ? "n/a" : w.decoupling().percent()
        );
    }

    private long min(Map<HrZone, Duration> z, HrZone k) {
        return z.getOrDefault(k, Duration.ZERO).toMinutes();
    }

    private List<AnalysisFlag> flags(CompletedWorkout w) {
        var f = new ArrayList<AnalysisFlag>();
        if (w.decoupling() != null && w.decoupling().percent() != null
                && w.decoupling().percent() > 5.0) {
            f.add(AnalysisFlag.HIGH_DECOUPLING);
        }
        return f;
    }
}
```

### 3.3 Result — a coach proposal, not an athlete-facing output
```java
public record WorkoutAnalysis(
    UUID id, UUID workoutId, UUID assessoriaId, UUID athleteId,
    String narrativePtBr,
    List<AnalysisFlag> flags,
    SuggestionState state,   // PENDING -> ACCEPTED / MODIFIED / REJECTED
    Instant createdAt
) {
    public static WorkoutAnalysis proposal(UUID w, UUID a, UUID at, String n, List<AnalysisFlag> f) {
        return new WorkoutAnalysis(UUID.randomUUID(), w, a, at, n, f, SuggestionState.PENDING, Instant.now());
    }
}
```

The analysis enters the **same `PENDING → ACCEPTED/MODIFIED/REJECTED` loop** as week suggestions — so coach edits here also feed the learning-loop delta. Consistent primitive, one flywheel.

---

## 4. The wiring (recap from the ingestion spec)
```
WorkoutImportService.importWorkout()
  └─ metrics.enrich()                 // §2, deterministic, in-transaction
  └─ repo.save()
  └─ publish WorkoutImportedEvent
        └─ @TransactionalEventListener(AFTER_COMMIT) @Async
              └─ WorkoutAnalyzerSkill.analyze()   // §3, LLM narrative, off hot path
                    └─ WorkoutAnalysis(PENDING) -> coach cockpit
```

---

## 5. Acceptance criteria (Gherkin)
```gherkin
Feature: Workout metrics and analysis

  Scenario: Zone distribution is computed from samples
    Given an imported run with per-second heart-rate samples
    And the athlete has an LTHR-derived zone profile
    When metrics are enriched
    Then time-in-zone is accumulated across Z1..Z5 using inter-sample gaps

  Scenario: Aerobic decoupling is flagged when high
    Given a run whose second-half efficiency factor is 6% below the first half
    When metrics are enriched and the workout is analyzed
    Then decoupling is stored as ~6.0
    And a HIGH_DECOUPLING flag is attached to the analysis

  Scenario: Insufficient signal yields no decoupling
    Given a session with fewer than 60 usable HR+output samples
    When metrics are enriched
    Then decoupling is null and no decoupling flag is raised

  Scenario: Analysis is a coach proposal
    Given a completed analysis
    Then it is persisted in state PENDING
    And it is not surfaced to the athlete until the coach acts on it

  Scenario: Model routing for a simple analysis
    When the analyzer runs for a standard session
    Then the HAIKU tier is used
    And output is pt-BR while sport terms remain in English
```

---

## 6. Notes
- **Pace targets / decoupling for run** use `speedMps`; bike prefers `power` when the sample carries it, falling back to speed.
- **TSS/CTL/ATL/TSB** are computed elsewhere (training-load service); this skill consumes the single-session view only.
- **Zone model** shown is %LTHR; swap the boundary function to match the assessoria's methodology without touching the calculator.
