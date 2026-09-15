## ADDED Requirements

### Requirement: Auto-correct minor duration violations

The system SHALL automatically reduce workout duration if it slightly exceeds maximum allowed, without rejecting the entire workout.

#### Scenario: Duration exceeds by less than 10%
- **WHEN** workout has duration 65 minutes and standard maximum is 60 minutes (8% over)
- **THEN** system reduces duration to 60 minutes and marks workout as AUTO_CORRECTED

#### Scenario: Duration exceeds by more than 15%
- **WHEN** workout has duration 75 minutes and standard maximum is 60 minutes (25% over)
- **THEN** system does not auto-correct; returns REJECT instead

### Requirement: Auto-correct intensity boundaries

The system SHALL clamp workout intensity to acceptable range if it slightly exceeds bounds, marking the correction.

#### Scenario: Intensity slightly above maximum
- **WHEN** workout has intensity 91% and standard maximum is 90%
- **THEN** system reduces intensity to 90% and marks as AUTO_CORRECTED

#### Scenario: Intensity far below minimum
- **WHEN** workout has intensity 70% and standard minimum is 95%
- **THEN** system does not auto-correct; returns REJECT (too significant a change)

### Requirement: Auto-adjust recovery ratios

The system SHALL adjust effort:recovery ratio to comply with standard if ratio is within 10% of boundary.

#### Scenario: Recovery ratio slightly excessive
- **WHEN** workout has ratio 1:2.1 and standard maximum is 1:2.0
- **THEN** system adjusts to 1:2.0 and marks as AUTO_CORRECTED

#### Scenario: Recovery ratio severely inadequate
- **WHEN** workout has ratio 4:1 and standard minimum is 1:1
- **THEN** system does not auto-correct; returns REJECT (unsafe for athlete)

### Requirement: Return standardization result with details

The system SHALL return result indicating what corrections were applied.

#### Scenario: No corrections needed
- **WHEN** workout passes all standards without modification
- **THEN** system returns `{status: PASS, corrections: []}`

#### Scenario: Corrections applied successfully
- **WHEN** workout needs auto-correction and correction succeeds
- **THEN** system returns `{status: AUTO_CORRECTED, corrections: [{field: "duration", original: 65, corrected: 60}]}`

### Requirement: Standardization preserves workout intent

The system SHALL ensure corrections maintain the core stimulus and purpose of the workout.

#### Scenario: Correction respects workout stimulus
- **WHEN** correcting HIIT duration from 70 to 60 minutes
- **THEN** system ensures the high-intensity ratio and series count remain consistent with HIIT purpose

#### Scenario: Unsafe correction rejected
- **WHEN** necessary correction would fundamentally change workout type (e.g., change HIIT to Tempo)
- **THEN** system marks workout as REJECT instead of applying unsafe correction
