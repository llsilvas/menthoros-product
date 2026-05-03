## ADDED Requirements

### Requirement: Expert LLM validator assesses biomechanical compatibility

The system SHALL use a specialized LLM skill (`validate-interval-workouts-expert`) to validate interval workouts against biomechanical rules beyond numeric constraints.

#### Scenario: Expert validates stimulus compatibility
- **WHEN** expert validator receives HIIT + Threshold hybrid workout (incompatible stimuli)
- **THEN** validator rejects with reason "Mixing HIIT (glycolytic) + Threshold (oxidative) in same session creates conflicting adaptations"

#### Scenario: Expert validates recovery adequacy
- **WHEN** validator checks effort:recovery ratio in context of athlete lactate threshold
- **THEN** validator rejects ratio 2:1 for VO2Max with reason "Insufficient recovery at VO2Max intensity; lactate won't clear between reps"

#### Scenario: Expert validates athlete progression
- **WHEN** validator reviews previous week's highest intensity + current proposal
- **THEN** validator validates proposal respects weekly volume + intensity progression (prevents overreach)

#### Scenario: Expert provides biomechanical justification
- **WHEN** validator rejects or approves proposal
- **THEN** response includes biomechanical reasoning (not just "exceeds max")

### Requirement: Expert validator skill system prompt defines expertise

The system SHALL use a detailed system prompt that establishes expert persona and validation rules.

#### Scenario: Expert skill initialized
- **WHEN** expert validator is loaded for first request
- **THEN** skill uses system prompt: "You are a certified cycling coach with 15+ years expertise in interval training, exercise physiology, and athlete periodization"

#### Scenario: Skill includes domain rules
- **WHEN** expert validator processes proposal
- **THEN** skill has access to rules: lactate threshold zones, glycolytic vs oxidative pathways, recovery mechanics, progression models

### Requirement: Expert validator returns structured assessment

The system SHALL return expert validation result with structured fields for integration with backend logic.

#### Scenario: Expert assessment result structure
- **WHEN** expert validator completes assessment
- **THEN** returns `{valid: bool, violations: [...], biomechanicalReasons: [...], recommendations: [...], confidence: float}`

#### Scenario: Violation includes biomechanical detail
- **WHEN** validator identifies violation
- **THEN** violation object includes: `{type: string, description: string, biomechanicalReason: string, severity: "critical"|"warning"}`

#### Scenario: Recommendations guide LLM iteration
- **WHEN** proposal rejected
- **THEN** recommendations include: "Try 3x5min efforts with 3min recovery instead; allows enough glycolytic clearance"

### Requirement: Expert validator integrates with numeric validator

The system SHALL combine expert assessment with numeric standards validation for complete picture.

#### Scenario: Numeric validation passes, expert rejects
- **WHEN** workout meets all numeric constraints but violates biomechanical principles
- **THEN** system rejects with expert feedback (biomechanics takes precedence)

#### Scenario: Numeric validation fails, expert rejects for different reason
- **WHEN** both numeric and expert validation fail
- **THEN** system returns both failure reasons to guide LLM correction

#### Scenario: Both numeric and expert validation pass
- **WHEN** workout meets numeric standards AND biomechanical rules
- **THEN** system accepts with high confidence

### Requirement: Expert feedback guides LLM iteration

The system SHALL provide expert feedback to LLM generator for proposal revision.

#### Scenario: LLM receives expert feedback context
- **WHEN** initial proposal is rejected by expert validator
- **THEN** system passes to LLM: expertise assessment + recommendations + athlete context

#### Scenario: LLM revises based on expert feedback
- **WHEN** LLM receives expert feedback (e.g., "needs more recovery for lactate clearance")
- **THEN** LLM can incorporate feedback into revised proposal

#### Scenario: Iterative validation cycle
- **WHEN** LLM submits revised proposal after expert feedback
- **THEN** expert validator re-assesses revised proposal (up to 2 iterations max)

### Requirement: Expert validator handles assessment uncertainty

The system SHALL indicate confidence level when assessment is ambiguous.

#### Scenario: Clear violation detected
- **WHEN** proposal violates established biomechanical principle
- **THEN** expert returns `confidence: 0.95` and status: `REJECT`

#### Scenario: Ambiguous proposal
- **WHEN** proposal is unusual but potentially valid (e.g., recovery session following hard day)
- **THEN** expert returns `confidence: 0.6` and status: `FLAG_FOR_REVIEW` with reasoning

#### Scenario: Coach review of low-confidence assessments
- **WHEN** expert confidence < 0.7
- **THEN** system flags for manual coach review instead of auto-rejecting

### Requirement: Expert validator is customizable per assessoria

The system SHALL support different expert validation profiles for different assessorias/philosophies.

#### Scenario: Assessoria-specific validation rules
- **WHEN** different assessoria uses different training philosophy (e.g., sprint-heavy vs endurance-heavy)
- **THEN** expert validator can be customized via assessoria-specific system prompt

#### Scenario: Load assessoria-specific expert validator
- **WHEN** validating workout for specific assessoria
- **THEN** system loads appropriate expert skill variant (default or customized)
