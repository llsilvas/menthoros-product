# planner-engine Specification

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

### Requirement: OnboardingContext is optional

The system SHALL support planner execution for legacy athletes without `OnboardingContext`.

#### Scenario: Legacy athlete has no onboarding context
- **Given** an athlete has `DadosPlanoDto` and `DecisaoProgressao`
- **And** no `OnboardingContext`
- **When** `planner-engine.enabled = true`
- **Then** the planner SHALL run in `LEGACY_CONTEXT` or fallback to the legacy pipeline
- **And** it SHALL NOT fail solely because onboarding is absent

### Requirement: Explicit target race takes precedence

The planner SHALL use explicit `Prova.isProvaAlvo()` before proximity/distance heuristics.

#### Scenario: Preparatory race is sooner than target race
- **Given** one future race is marked `isProvaAlvo = true`
- **And** another preparatory race occurs sooner
- **When** resolving the periodization phase
- **Then** the target race SHALL anchor the macro phase
- **And** the preparatory race SHALL only affect the specific week where it occurs

### Requirement: Skeleton compliance validates structure

The system SHALL validate the generated plan against the `WeekPlanSkeleton` after LLM generation and after any redistribution that affects the persisted plan.

#### Scenario: TSS passes but unavailable day is used
- **Given** a generated plan has total TSS within tolerance
- **But** includes a workout on a day not in the athlete availability
- **When** `SkeletonComplianceChecker` runs
- **Then** compliance SHALL fail with a typed violation

#### Scenario: Heavy workout too close to race
- **Given** a race occurs within the planned week
- **And** a generated plan includes a hard workout 48 hours before the race
- **When** `SkeletonComplianceChecker` runs
- **Then** compliance SHALL fail with a typed violation

### Requirement: Planner audit metadata is persisted

Every plan generated with planner enabled SHALL persist enough metadata to measure outcomes and debug regressions.

#### Scenario: Plan generated with planner
- **Given** `planner-engine.enabled = true`
- **When** a weekly plan is persisted
- **Then** `planner_enabled`, `planner_version`, `planner_phase`, `planner_skeleton_hash`, and `planner_compliance_status` SHALL be stored on the plan

### Requirement: Batch generation isolates planner failures

Planner or compliance failure for one athlete SHALL NOT abort a batch plan job.

#### Scenario: One athlete fails compliance in a batch
- **Given** a batch job contains two athletes
- **And** one athlete fails planner compliance after retry
- **When** the batch completes
- **Then** the successful athlete SHALL have a generated plan
- **And** the failed athlete SHALL appear as an individual sanitized error
- **And** the batch status SHALL be `CONCLUIDO_COM_ERROS`


### Requirement: Shadow mode does not alter generated plans

The system SHALL support a shadow mode that computes planner outputs and metrics without changing prompt enforcement or persisted plan behavior.

#### Scenario: Planner runs in shadow mode
- **Given** `planner-engine.enabled = false`
- **And** `planner-engine.shadow = true`
- **When** a coach generates a weekly plan
- **Then** the legacy pipeline SHALL generate and persist the plan
- **And** the planner SHALL record shadow metrics and logs
- **And** the planner SHALL NOT block or alter the plan

### Requirement: Running-first scope is explicit

The planner v1 SHALL be running-first and SHALL NOT claim full multisport periodization.

#### Scenario: Athlete has multisport data
- **Given** an athlete has cycling or swimming activities in recent history
- **When** the planner resolves the weekly skeleton
- **Then** aggregate TSS MAY be used as a conservative fatigue guardrail
- **And** the planner metadata SHALL indicate `plannerScope = RUNNING_FIRST`
- **And** the planner SHALL NOT prescribe sport-specific triathlon distribution

### Requirement: Recent injury produces return-to-training behavior

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

### Requirement: Compliance is evaluated after redistribution

The system SHALL run final skeleton compliance on the plan structure that will be persisted after redistribution.

#### Scenario: Redistribution creates a violation
- **Given** the LLM output initially complies with the skeleton
- **And** redistribution moves a hard workout to a restricted day or too close to a race
- **When** final compliance runs
- **Then** compliance SHALL fail and follow retry/fallback policy
