## ADDED Requirements

### Requirement: Identify and classify workout violations

The system SHALL identify workouts that cannot pass validation and classify violation severity for appropriate handling.

#### Scenario: Single violation identified
- **WHEN** workout violates only duration standard
- **THEN** system classifies as REJECT with violation type "DURATION_VIOLATION"

#### Scenario: Multiple violations identified
- **WHEN** workout violates duration, intensity, and recovery ratio standards
- **THEN** system identifies all violations and classifies as REJECT with multiple violation types

#### Scenario: No violations identified
- **WHEN** workout meets all standard constraints
- **THEN** system classifies as ACCEPT with empty violation list

### Requirement: Generate clear violation feedback

The system SHALL provide detailed feedback explaining what was wrong and why the workout was rejected.

#### Scenario: Single constraint violation feedback
- **WHEN** workout duration 90 minutes exceeds standard maximum 60 minutes
- **THEN** system returns: "Duration exceeds standard maximum by 50% (90 > 60 minutes). Please reduce to 60 minutes or under."

#### Scenario: Multiple constraint violations feedback
- **WHEN** workout violates duration, intensity, and series count
- **THEN** system returns detailed feedback listing all violations and their limits

#### Scenario: Violation feedback includes standard reference
- **WHEN** generating feedback for rejected workout
- **THEN** feedback includes which standard (assessoria + workout type) was used for validation

### Requirement: Handle exceptions and overrides

The system SHALL allow manual override of rejected workouts with justification in exceptional cases.

#### Scenario: Coach override with justification
- **WHEN** coach explicitly approves rejected workout with note "Athlete recovering, modified session approved"
- **THEN** system accepts workout, logs override with justification in audit trail

#### Scenario: Override without justification rejected
- **WHEN** system receives override attempt without required justification
- **THEN** system returns error "Override requires explicit justification"

### Requirement: Log and report non-standard workouts

The system SHALL record all rejected/out-of-standard workouts for coaching review and analysis.

#### Scenario: Non-standard workout logged
- **WHEN** workout is rejected or requires override
- **THEN** system creates entry in `NonStandardWorkoutLog` table with timestamp, athlete, violation details, and disposition

#### Scenario: Review non-standard workouts by assessoria
- **WHEN** coach queries non-standard workouts for their assessoria
- **THEN** system returns list grouped by athlete, violation type, with date range filtering

### Requirement: Track LLM proposal quality

The system SHALL track patterns in LLM violations to identify systematic proposal issues.

#### Scenario: LLM violation metrics calculated
- **WHEN** validation runs on LLM-proposed workouts
- **THEN** system tracks: total proposals, violations by type, auto-correct rate, rejection rate, override rate

#### Scenario: LLM feedback trend analysis
- **WHEN** reviewing validation results over time period
- **THEN** system can report "LLM rejected 15% of proposals last week, 12% this week" showing improvement trend

### Requirement: Escalate critical violations

The system SHALL alert coaches to critical safety violations (e.g., excessive intensity, inadequate recovery).

#### Scenario: Critical safety violation detected
- **WHEN** workout violates recovery ratio by >50% (e.g., 4:1 when 1:1 required)
- **THEN** system creates alert for coach: "Critical: Recovery ratio unsafe for athlete safety"

#### Scenario: Non-critical violation does not escalate
- **WHEN** workout violates duration by 5%
- **THEN** system logs violation but does not escalate to coach alert
