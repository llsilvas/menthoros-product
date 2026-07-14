# planner-engine Specification — delta de enforcement (parte 2/2)

> Complementa a spec da parte 1 (`deterministic-planner-engine`): motor, shadow, auditoria e
> fronteira de dominio ja especificados la. Aqui: skeleton vinculante, compliance em dois
> estagios, fail-open, SessionSlot prescritivo, superficie de review.
> CA11 (gate de rollout: divergencia de fase <= 2% em >= 2 semanas / >= 30 planos, fail-closed)
> e criterio operacional de release, nao comportamento de runtime — coberto em proposal + task
> 8.4, sem cenario Given/When/Then aqui.

## New Requirements

### Requirement: Skeleton compliance validates structure in two stages (CA1, CA2, CA3)

The system SHALL validate the generated plan against the `WeekPlanSkeleton` in two stages with distinct remediation: `checkPreRedistribution` (before the plan is redistributed across the week) feeds the existing LLM-generation retry (`PlanoResilienceService.gerarComResiliencia`); `checkPostRedistribution` (after redistribution) is terminal and SHALL NOT trigger a retry, since LLM generation is no longer in scope at that point.

#### Scenario: Pre-redistribution violation triggers the existing retry
- **Given** `planner-engine.enabled = true`
- **And** a generated plan violates `skeleton.phase()`, `sessionCount`, the TSS tolerance, or a `SessionSlot` prescription
- **When** `checkPreRedistribution` runs inside the `validar` function passed to `PlanoResilienceService.gerarComResiliencia`
- **Then** it SHALL throw the same exception type `validarENormalizarPlanoGerado` already throws, carrying the typed `PlannerViolation`s as structured feedback
- **And** the LLM generation SHALL be retried up to the existing `MAX_TENTATIVAS` limit
- **And** no second, parallel retry mechanism SHALL be created

#### Scenario: Post-redistribution violation is terminal, no retry
- **Given** a plan passed `checkPreRedistribution`
- **And** redistribution subsequently moves a workout to a day not in the athlete's availability, or too close to a race
- **When** `checkPostRedistribution` runs
- **Then** compliance SHALL fail with a typed `PlannerViolation`
- **And** the system SHALL NOT retry LLM generation
- **And** the outcome SHALL follow the fail-open policy

#### Scenario: Heavy workout too close to race, detected pre-redistribution
- **Given** a race occurs within the planned week
- **And** the generated plan includes a hard workout 48 hours before the race, already in that position before redistribution
- **When** `checkPreRedistribution` runs
- **Then** compliance SHALL fail with a typed violation and trigger the existing retry

#### Scenario: Structural violation with correct total TSS (CA2)
- **Given** a generated plan whose total TSS is within tolerance
- **But** the long run exceeds the skeleton's duration cap
- **When** `checkPreRedistribution` runs
- **Then** compliance SHALL fail with a typed violation

### Requirement: Fail-open policy governs both terminal failure points (CA4)

The system SHALL apply `planner-engine.fail-open` to the two distinct terminal failure points, persisting the resulting `compliance_status`.

#### Scenario: Stage 1 exhausts the retry with fail-open on
- **Given** `planner-engine.fail-open = true`
- **And** `checkPreRedistribution` fails on every retry attempt
- **When** generation concludes
- **Then** the system SHALL fall back to the full legacy pipeline (no skeleton in prompt)
- **And** `planner_compliance_status` SHALL be `FALLBACK`

#### Scenario: Stage 1 exhausts the retry with fail-open off
- **Given** `planner-engine.fail-open = false`
- **And** `checkPreRedistribution` fails on every retry attempt
- **When** generation concludes
- **Then** a domain error SHALL be raised and no plan SHALL be persisted

#### Scenario: Stage 2 fails with fail-open on
- **Given** `planner-engine.fail-open = true`
- **And** `checkPostRedistribution` fails
- **When** persistence runs
- **Then** the plan SHALL be persisted with `planner_compliance_status = FAILED`
- **And** `planner_requires_coach_review` SHALL be true
- **And** the plan SHALL be surfaced to the coach as requiring review (see the review-surface
  requirement below)

#### Scenario: Stage 2 fails with fail-open off
- **Given** `planner-engine.fail-open = false`
- **And** `checkPostRedistribution` fails
- **When** persistence runs
- **Then** a domain error SHALL be raised and nothing SHALL be persisted
- **And** the system SHALL NOT fall back to the legacy pipeline at this point

### Requirement: SessionSlot prescribes day, TSS, and zones per session (CA6, CA7)

With enforcement on, the `WeekPlanSkeleton` SHALL carry per-session `SessionSlot`s with deterministic day allocation, per-slot TSS targets, and FC/pace zone references — and the final plan SHALL adhere to them.

#### Scenario: Long run is anchored and hard sessions are not adjacent
- **Given** an athlete with a preferred/inferred long-run day and 5 available days
- **When** `PlannerEngine` allocates the `SessionSlot`s
- **Then** the long run slot SHALL fall on the preferred/inferred day
- **And** no two high-intensity slots SHALL be on adjacent days

#### Scenario: Per-slot TSS partition respects the weekly target
- **Given** a `WeeklyLoadTarget` with a weekly TSS target
- **When** the slots are allocated
- **Then** each slot SHALL carry a TSS target derived from `duration x IF^2 x 100/60`
- **And** the sum of slot targets SHALL be within +-10% of the weekly target

#### Scenario: Final plan deviates from a slot
- **Given** `planner-engine.enabled = true`
- **And** the generated plan places a workout on a different day than its slot, or beyond the slot TSS tolerance
- **When** compliance runs
- **Then** the violation SHALL be detected (stage 1 for type/TSS, stage 2 for final day placement)

### Requirement: PeriodizacaoPromptFormatter only renders planner output (CA5)

With this change merged, `PeriodizacaoPromptFormatter` SHALL NOT compute phase, TSS target, step-back, or week type — it SHALL render the `PlannerEngine` output exclusively.

#### Scenario: Formatter has no independent calculation
- **Given** the enforcement change is merged
- **When** the prompt periodization block is built with `planner-engine.enabled = true`
- **Then** every phase/load figure in the block SHALL originate from the `WeekPlanSkeleton`
- **And** the phase-divergence metric from part 1 SHALL no longer exist

### Requirement: Plans requiring coach review are surfaced to the coach (CA12)

The system SHALL expose `plannerComplianceStatus`, `plannerRequiresCoachReview`, and a readable
summary of the `PlannerViolation`s in the coach-facing plan DTO, and the coach plan view SHALL
visually highlight plans persisted with `planner_requires_coach_review = true` or
`planner_compliance_status = FAILED`, including the violation reasons. The athlete view SHALL
remain unchanged.

#### Scenario: Failed-compliance plan is highlighted for the coach
- **Given** a plan persisted with `planner_compliance_status = FAILED` and
  `planner_requires_coach_review = true`
- **When** the coach opens the plan view
- **Then** the plan SHALL display a mandatory-review highlight
- **And** the violation reasons SHALL be visible to the coach

#### Scenario: Passed plan shows no review highlight
- **Given** a plan persisted with `planner_compliance_status = PASSED`
- **When** the coach opens the plan view
- **Then** no mandatory-review highlight SHALL be displayed

#### Scenario: Legacy plan without planner metadata renders safely
- **Given** a plan generated before the planner engine (no V54 metadata populated)
- **When** the coach opens the plan view
- **Then** the view SHALL render without errors and without a review highlight

### Requirement: Batch generation isolates enforcement failures (CA8)

Planner or compliance failure for one athlete SHALL NOT abort a batch plan job.

#### Scenario: One athlete fails compliance in a batch
- **Given** a batch job contains two athletes and `planner-engine.enabled = true`
- **And** one athlete fails planner compliance after retry
- **When** the batch completes
- **Then** the successful athlete SHALL have a generated plan
- **And** the failed athlete SHALL appear as an individual sanitized error
- **And** the batch status SHALL be `CONCLUIDO_COM_ERROS`

### Requirement: Enforcement off means byte-identical legacy pipeline (CA9)

With `planner-engine.enabled = false`, the generation pipeline SHALL be unchanged, independently of the shadow flag.

#### Scenario: Flag off
- **Given** `planner-engine.enabled = false`
- **When** a weekly plan is generated
- **Then** prompt, plan, and persistence SHALL be identical to the legacy pipeline
- **And** the part-1 shadow MAY still run independently
