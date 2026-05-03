## ADDED Requirements

### Requirement: Validate workout against duration standards

The system SHALL validate interval workouts to ensure duration (in minutes) falls within acceptable range defined by workout type and assessoria standards.

#### Scenario: Workout duration within standard
- **WHEN** validating interval workout with duration 45 minutes and standard allows 30-60 minutes
- **THEN** validation passes for duration constraint

#### Scenario: Workout duration exceeds maximum
- **WHEN** validating interval workout with duration 90 minutes and standard allows 30-60 minutes
- **THEN** validation fails with error "Duration exceeds maximum: 90 > 60 minutes"

#### Scenario: Workout duration below minimum
- **WHEN** validating interval workout with duration 10 minutes and standard allows 30-60 minutes
- **THEN** validation fails with error "Duration below minimum: 10 < 30 minutes"

### Requirement: Validate workout intensity standards

The system SHALL validate that workout intensity (in percentage of FTP) conforms to acceptable range by workout type.

#### Scenario: Intensity within standard
- **WHEN** validating HIIT workout with intensity 95% FTP and standard allows 90-100% FTP
- **THEN** validation passes for intensity constraint

#### Scenario: Intensity exceeds maximum
- **WHEN** validating Tempo workout with intensity 92% FTP and standard allows 85-90% FTP
- **THEN** validation fails with error "Intensity exceeds maximum: 92% > 90%"

#### Scenario: Intensity below minimum
- **WHEN** validating VO2Max workout with intensity 70% FTP and standard allows 95-100% FTP
- **THEN** validation fails with error "Intensity below minimum: 70% < 95%"

### Requirement: Validate series count standards

The system SHALL validate that number of series/repeats conforms to acceptable range.

#### Scenario: Series count within standard
- **WHEN** validating HIIT with 6 series and standard allows 4-8 series
- **THEN** validation passes for series constraint

#### Scenario: Series count exceeds maximum
- **WHEN** validating HIIT with 12 series and standard allows 4-8 series
- **THEN** validation fails with error "Series count exceeds maximum: 12 > 8"

#### Scenario: Series count below minimum
- **WHEN** validating HIIT with 2 series and standard allows 4-8 series
- **THEN** validation fails with error "Series count below minimum: 2 < 4"

### Requirement: Validate recovery ratio standards

The system SHALL validate that effort-to-recovery ratio complies with workout type standards.

#### Scenario: Recovery ratio compliant
- **WHEN** validating HIIT with effort:recovery = 1:1 and standard allows 1:1 to 1:2
- **THEN** validation passes for recovery ratio constraint

#### Scenario: Recovery ratio insufficient
- **WHEN** validating Threshold with effort:recovery = 3:1 and standard allows 1:1 minimum
- **THEN** validation fails with error "Recovery ratio insufficient: 3:1 below standard 1:1"

#### Scenario: Recovery ratio excessive
- **WHEN** validating HIIT with effort:recovery = 1:5 and standard allows 1:1 to 1:2 maximum
- **THEN** validation fails with error "Recovery ratio excessive: 1:5 exceeds standard 1:2"

### Requirement: Validation returns structured result

The system SHALL return validation result indicating status (PASS/FAIL) with detailed failure reasons if applicable.

#### Scenario: Validation passes
- **WHEN** workout passes all constraint validations
- **THEN** system returns `{status: PASS, violations: []}`

#### Scenario: Validation fails with multiple violations
- **WHEN** workout violates duration AND intensity standards
- **THEN** system returns `{status: FAIL, violations: [{constraint: "duration", violation: "..."}，{constraint: "intensity", violation: "..."}]}`

### Requirement: Standards lookup by context

The system SHALL load appropriate standards based on assessoria and workout type.

#### Scenario: Load standard by assessoria and type
- **WHEN** validating workout for assessoria "TrainerA" with type "HIIT"
- **THEN** system loads standard from `IntervalWorkoutStandards` table matching `(assessoriaId=TrainerA, workoutType=HIIT)`

#### Scenario: Fallback to default standards
- **WHEN** no assessoria-specific standard exists
- **THEN** system loads default standard (assessoriaId=NULL) for that workout type
