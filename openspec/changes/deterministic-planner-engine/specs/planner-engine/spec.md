# planner-engine Specification (parte 1/2: motor em shadow + nucleo de dominio)

> CA7 (golden set deterministico, 30-50 casos) e um criterio de metodologia de teste, nao um
> comportamento de runtime — coberto em tasks.md secao 6, sem cenario Given/When/Then aqui.
> Requisitos de enforcement (compliance em dois estagios com retry, fail-open, SessionSlot
> prescritivo) estao na spec de `planner-engine-enforcement`.

## New Requirements

### Requirement: Deterministic planner uses existing progressao-treinos as input

The system SHALL consume `DecisaoProgressao` from `ProgressaoTreinoService` as the directional progression input and SHALL NOT recalculate an independent progression direction.

#### Scenario: REDUZIR cannot become increased load
- **Given** `DecisaoProgressao.estado = REDUZIR`
- **And** the periodization phase is BUILD
- **When** the planner resolves the `WeeklyLoadTarget`
- **Then** the target SHALL NOT increase volume or intensity relative to the current baseline

#### Scenario: MANTER does not consume all available physiological ceiling
- **Given** `DecisaoProgressao.estado = MANTER`
- **And** physiological ramp-rate ceiling would allow an increase
- **When** the planner resolves the `WeeklyLoadTarget`
- **Then** the target SHALL preserve current load unless taper/race/recovery constraints require reduction

### Requirement: Load ramp rate is capped (CA1)

The system SHALL NOT resolve a weekly TSS target that implies a CTL ramp rate above the safe ceiling.

#### Scenario: CTL 40 athlete gets a bounded ramp
- **Given** an athlete's current CTL is 40
- **And** `DecisaoProgressao.estado` allows an increase (`PROGREDIR` or `PROGREDIR_LEVE`)
- **When** `LoadTargetResolver` resolves the `WeeklyLoadTarget`
- **Then** the resulting TSS target SHALL NOT imply a CTL ramp greater than 8 points/week

### Requirement: Step-back week reduces load after sustained progression (CA2)

The system SHALL insert a step-back week after 3 consecutive weeks of progression.

#### Scenario: Fourth consecutive progression week
- **Given** an athlete has progressed for 3 consecutive weeks
- **When** `LoadTargetResolver` resolves the 4th week's `WeeklyLoadTarget`
- **Then** the TSS target SHALL drop 15-25% relative to the prior week's peak

### Requirement: Injury risk uses the existing TSB/CTL/ATL model, not a new ACWR (CA3)

The system SHALL evaluate physiological injury risk using `ProgressaoHistoricoResumo.tsbAtual` (already computed by `TsbService`) rather than introducing a new Acute:Chronic Workload Ratio or a new load-history entity.

#### Scenario: TSB below the high-risk threshold requires coach review
- **Given** `ProgressaoHistoricoResumo.tsbAtual` is below -30 for an athlete
- **When** `InjuryRiskEvaluator` assesses risk
- **Then** the risk level SHALL be `HIGH_RISK`
- **And** `requiresCoachReview` SHALL be true

#### Scenario: TSB within the productive training zone is safe
- **Given** `ProgressaoHistoricoResumo.tsbAtual` is above -10
- **When** `InjuryRiskEvaluator` assesses risk
- **Then** the risk level SHALL be within the safe zone
- **And** `requiresCoachReview` SHALL NOT be forced by this check alone

### Requirement: Taper reduces load while preserving intensity (CA5)

The system SHALL apply an exponential volume reduction in the weeks preceding a target race, without reducing intensity.

#### Scenario: 21K race 10 days out
- **Given** the target race is a 21K distance
- **And** the race is 10 days from the reference date
- **When** `TaperStrategy` resolves the week's load
- **Then** the TSS target SHALL drop 40-60% relative to the pre-taper peak
- **And** intensity zones in the resulting `SessionSlot`s SHALL be preserved

### Requirement: OnboardingContext is optional

The system SHALL support planner execution for legacy athletes without `OnboardingContext`.

#### Scenario: Legacy athlete has no onboarding context
- **Given** an athlete has `DadosPlanoDto` and `DecisaoProgressao`
- **And** no `OnboardingContext`
- **When** the planner runs (shadow mode in this change)
- **Then** the planner SHALL run in `LEGACY_CONTEXT`
- **And** it SHALL NOT fail solely because onboarding is absent

### Requirement: Explicit target race takes precedence

The planner SHALL use explicit `Prova.isProvaAlvo()` before proximity/distance heuristics, with its own race-selection logic (date first, longer distance as tiebreaker) independent from `buscarProximaProva`/`getProximaProva`.

#### Scenario: Preparatory race is sooner than target race
- **Given** one future race is marked `isProvaAlvo = true`
- **And** another preparatory race occurs sooner
- **When** resolving the periodization phase
- **Then** the target race SHALL anchor the macro phase
- **And** the preparatory race SHALL only affect the specific week where it occurs

#### Scenario: No explicit target race, same-week tie
- **Given** no future race is marked `isProvaAlvo`
- **And** two future races fall in the same week
- **When** resolving the anchor race
- **Then** the race with the longer distance SHALL be selected

### Requirement: Planner audit metadata is persisted already in shadow (CA10)

Every plan generated while shadow mode is on SHALL persist enough metadata to measure phase distribution and hypothetical compliance before enforcement exists.

#### Scenario: Plan generated with shadow on
- **Given** `planner-engine.shadow = true`
- **When** a weekly plan is persisted by the legacy pipeline
- **Then** `planner_version`, `planner_phase`, `planner_skeleton_hash`, and a hypothetical `planner_compliance_status` SHALL be stored on the plan
- **And** `planner_enabled` SHALL be false

### Requirement: Shadow mode does not alter generated plans (CA12)

The system SHALL compute planner outputs and metrics without changing prompt, generated plan, or workout persistence.

#### Scenario: Planner runs in shadow mode
- **Given** `planner-engine.shadow = true`
- **When** a coach generates a weekly plan
- **Then** the legacy pipeline SHALL generate and persist the plan unchanged
- **And** the planner SHALL record shadow metrics, audit metadata, and logs
- **And** the planner SHALL NOT call the LLM a second time

### Requirement: Shadow failures never affect generation (CA11)

A failure inside the planner or the shadow integration SHALL never surface to the coach or affect plan generation, including batch jobs.

#### Scenario: Planner throws during shadow
- **Given** `planner-engine.shadow = true`
- **And** the planner throws an exception for an athlete
- **When** the weekly plan generation runs
- **Then** the plan SHALL be generated and persisted normally
- **And** `planner.shadow.error.count` SHALL increment with a structured log
- **And** no error SHALL be shown to the coach

#### Scenario: Planner throws during a batch job
- **Given** a batch job with two athletes and `planner-engine.shadow = true`
- **And** the planner throws for one athlete
- **When** the batch completes
- **Then** both athletes SHALL have generated plans
- **And** the batch SHALL NOT record an individual error caused by the shadow

### Requirement: Phase divergence against the legacy formatter is measured (CA16)

While `PeriodizacaoPromptFormatter` keeps its own phase logic, the shadow SHALL measure divergence between the planner phase and the formatter phase.

#### Scenario: Planner and formatter disagree on the phase
- **Given** `planner-engine.shadow = true`
- **And** the planner resolves phase TAPER while the formatter resolves PEAK for the same athlete/week
- **When** the shadow comparison runs
- **Then** `planner.phase.divergence.count` SHALL increment tagged with both phases

### Requirement: Running-first scope is explicit (CA13)

The planner v1 SHALL be running-first and SHALL NOT claim full multisport periodization.

#### Scenario: Athlete has multisport data
- **Given** an athlete has cycling or swimming activities in recent history
- **When** the planner resolves the weekly skeleton
- **Then** aggregate TSS MAY be used as a conservative fatigue guardrail
- **And** the planner metadata SHALL indicate `plannerScope = RUNNING_FIRST`
- **And** the planner SHALL NOT prescribe sport-specific triathlon distribution

### Requirement: Recent injury produces return-to-training behavior (CA4, CA14)

The planner SHALL distinguish active injury, recent injury, and unstructured injury descriptions.

#### Scenario: Athlete has active injury
- **Given** `Atleta.temLesao = true`
- **When** the planner resolves the phase
- **Then** the phase SHALL be RECOVERY
- **And** `requiresCoachReview` SHALL be true

#### Scenario: Athlete has recent injury date but no active injury flag
- **Given** `Atleta.temLesao = false`
- **And** `Atleta.dataUltimaLesao` is within the configured recent injury window
- **When** the planner resolves the phase
- **Then** the phase SHALL be RETURN_TO_TRAINING
- **And** load progression SHALL be capped conservatively

### Requirement: Planner is deterministic given an explicit reference date (CA17)

`PlannerEngine.planWeek(...)` SHALL receive the week reference date as an explicit parameter and SHALL NOT read the system clock.

#### Scenario: Same inputs, different wall-clock
- **Given** two invocations of `planWeek` with identical `PlannerInputSnapshot` (same `referenceDate`)
- **And** the system clock differs between the invocations
- **When** both skeletons are produced
- **Then** they SHALL be identical, including `skeletonHash`

### Requirement: Domain core has no framework or persistence dependencies (CA15)

Code under `br.com.menthoros.backend.domain/..` SHALL NOT depend on JPA entities, repositories, Spring Web, or Spring AI.

#### Scenario: A forbidden import is introduced
- **Given** a class in `domain/..` imports `br.com.menthoros.backend.entity.Atleta`
- **When** `DomainBoundaryArchTest` runs in CI
- **Then** the build SHALL fail
