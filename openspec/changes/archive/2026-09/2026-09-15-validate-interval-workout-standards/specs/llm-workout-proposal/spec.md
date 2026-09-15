## MODIFIED Requirements

### Requirement: LLM proposes interval workout with validation feedback loop

The system SHALL validate LLM-proposed workouts against standards and provide validation feedback for quality improvement.

#### Scenario: LLM proposal passes validation
- **WHEN** LLM proposes interval workout that meets all standards
- **THEN** system returns proposal with `{validationStatus: ACCEPTED, feedback: null}`

#### Scenario: LLM proposal auto-corrected
- **WHEN** LLM proposes workout with minor violations (auto-correctable)
- **THEN** system returns corrected proposal with `{validationStatus: AUTO_CORRECTED, corrections: [...], feedback: "..."}` 

#### Scenario: LLM proposal rejected
- **WHEN** LLM proposes workout with critical violations (not auto-correctable)
- **THEN** system returns rejection with `{validationStatus: REJECTED, violations: [...], feedback: "..."}`

#### Scenario: LLM receives feedback for improvement
- **WHEN** proposal is rejected or auto-corrected
- **THEN** system includes feedback in response: "Rejected: Duration 90 min exceeds standard 60 min. Try proposing 45-60 minute sessions with [intensity/series] constraints..."

### Requirement: LLM can iterate on rejected proposals

The system SHALL allow LLM to submit revised proposals after receiving rejection feedback, creating an improvement loop.

#### Scenario: LLM revises proposal after feedback
- **WHEN** LLM receives rejection with specific feedback and re-submits revised proposal
- **THEN** system validates revised proposal against same standards

#### Scenario: Iteration history tracked
- **WHEN** LLM submits multiple proposal iterations for same workout request
- **THEN** system tracks proposal history showing original → corrected → final approved version

### Requirement: Validation standards provided to LLM in context

The system SHALL provide LLM with applicable standards when requesting workout proposal so it can self-validate.

#### Scenario: LLM context includes standards
- **WHEN** system requests workout proposal from LLM
- **THEN** context includes: `IntervalWorkoutStandards for [assessoriaId] {duration: [min-max], intensity: [min-max], seriesCount: [min-max], recoveryRatio: [min-max]}`

#### Scenario: LLM uses standards for proposal
- **WHEN** LLM generates proposal with standards in context
- **THEN** proposal is more likely to comply with constraints (reducing validation rejections)
