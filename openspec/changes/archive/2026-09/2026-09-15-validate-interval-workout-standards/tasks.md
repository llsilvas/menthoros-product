# Implementation Tasks: validate-interval-workout-standards

## 1. Backend Setup

- [ ] 1.1 Create `IntervalWorkoutStandard` JPA entity with fields: workoutType, minDuration, maxDuration, minIntensity, maxIntensity, minSeriesCount, maxSeriesCount, maxRecoveryRatio, assessoriaId, createdAt
- [ ] 1.2 Create `IntervalWorkoutStandardRepository` extending JpaRepository
- [ ] 1.3 Create database migration V24_CreateIntervalWorkoutStandards.sql with default standards for each workout type (HIIT, Tempo, Threshold, VO2Max, etc.)
- [ ] 1.4 Create `NonStandardWorkoutLog` JPA entity with fields: athletaId, proposalId, violationType, violationDetails, resolution (ACCEPTED/AUTO_CORRECTED/REJECTED/OVERRIDDEN), overrideJustification, createdAt, updatedAt
- [ ] 1.5 Create `NonStandardWorkoutLogRepository` extending JpaRepository

## 2. Core Validation Implementation

- [ ] 2.1 Create `IntervalWorkoutValidator` class with method `validate(WorkoutProposal, String assessoriaId): ValidationResult`
- [ ] 2.2 Implement duration validation rule: check min/max against standards
- [ ] 2.3 Implement intensity validation rule: check min/max percentage FTP against standards
- [ ] 2.4 Implement series count validation rule: check min/max against standards
- [ ] 2.5 Implement recovery ratio validation rule: check effort:recovery ratios against standards
- [ ] 2.6 Create `ValidationResult` class with fields: status (PASS/FAIL), violations (List), details (String)
- [ ] 2.7 Implement standards lookup logic: fetch standards by assessoriaId + workoutType, fallback to defaults (assessoriaId=null)

## 3. Auto-Correction Implementation

- [ ] 3.1 Create `IntervalWorkoutStandardizer` class with method `standardize(WorkoutProposal, String assessoriaId): StandardizationResult`
- [ ] 3.2 Implement auto-correct logic for duration: reduce to max if within 10% tolerance
- [ ] 3.3 Implement auto-correct logic for intensity: clamp to [min, max] if within 10% tolerance
- [ ] 3.4 Implement auto-correct logic for recovery ratio: adjust to boundary if within 10% tolerance
- [ ] 3.5 Implement correction result structure: track what was corrected and original values
- [ ] 3.6 Validate that corrections preserve workout intent (stimulus type remains consistent)

## 4. Non-Standard Workout Handling

- [ ] 4.1 Create `NonStandardWorkoutHandler` class to process validation results
- [ ] 4.2 Implement handler logic: determine ACCEPT vs AUTO_CORRECTED vs REJECT based on validator + standardizer output
- [ ] 4.3 Implement feedback generation: create human-readable violation messages and improvement suggestions
- [ ] 4.4 Implement logging: write NonStandardWorkoutLog entry for every REJECT and AUTO_CORRECTED workout
- [ ] 4.5 Implement override handler: accept overridden workouts with required justification, audit trail
- [ ] 4.6 Implement critical violation detection: identify safety-critical violations (recovery ratio >50% off) and escalate

## 5. LLM Integration

- [ ] 5.1 Update `WorkoutProposalHandler` to call validator after LLM proposal
- [ ] 5.2 Pass validation feedback back to LLM response: include validationStatus, corrections, violations, feedback
- [ ] 5.3 Implement feedback prompt for LLM: provide applicable standards in context for next proposal iteration
- [ ] 5.4 Implement proposal iteration tracking: store original → corrected → final proposal chain
- [ ] 5.5 Create `LLMValidationFeedbackGenerator` to create improvement prompts for LLM based on violations

## 6. Frontend - Workout Review UI

- [ ] 6.1 Create component to display rejected/auto-corrected workouts in coach dashboard
- [ ] 6.2 Implement view for violation details: show what was wrong and why
- [ ] 6.3 Implement comparison view: original proposed vs corrected (for auto-corrected workouts)
- [ ] 6.4 Implement action buttons: Approve, Reject, or Override with justification

## 7. Frontend - Override Management

- [ ] 7.1 Create override dialog/modal with justification text area
- [ ] 7.2 Implement form validation: require non-empty justification
- [ ] 7.3 Implement override submission: send to backend with athlete context
- [ ] 7.4 Implement audit trail view: show history of overridden workouts with justifications

## 8. Testing

- [ ] 8.1 Create `IntervalWorkoutValidatorTest` with unit tests for all validation rules
- [ ] 8.2 Create `IntervalWorkoutStandardizerTest` with unit tests for all auto-correction logic
- [ ] 8.3 Create `ValidationIntegrationTest`: test full flow from proposal → validation → feedback
- [ ] 8.4 Create `LLMFeedbackLoopTest`: verify LLM receives feedback and can iterate
- [ ] 8.5 Create integration tests with Testcontainers: test with real PostgreSQL standards data
- [ ] 8.6 Create E2E test: coach submits workout → sees violations → overrides with justification

## 9. Documentation & Operations

- [ ] 9.1 Create `VALIDATION_STANDARDS.md` documenting all validation rules by workout type
- [ ] 9.2 Create `LLM_FEEDBACK_LOOP.md` documenting how LLM uses feedback for improvement
- [ ] 9.3 Create operational runbook: how to adjust standards, review non-standard logs, escalate critical violations
- [ ] 9.4 Add validation metrics/dashboard: track rejection rates, auto-correction rates, LLM improvement trend
- [ ] 9.5 Update API documentation with validation response schemas

## 10. Expert LLM Validator Skill Implementation

- [ ] 10.1 Create skill: `validate-interval-workouts-expert` with system prompt establishing expertise (15+ years cycling coach, exercise physiology)
- [ ] 10.2 Define skill rules: lactate threshold zones, glycolytic vs oxidative pathways, recovery mechanics, progression models
- [ ] 10.3 Create `ExpertValidatorClient` to call skill with structured input (proposal, athlete context, standards)
- [ ] 10.4 Parse expert validator output: extract violations, biomechanicalReasons, recommendations, confidence
- [ ] 10.5 Implement confidence scoring: high (>0.9) = auto-reject, medium (0.6-0.9) = flag for review, low (<0.6) = requires coach review
- [ ] 10.6 Create `ExpertFeedbackFormatter` to convert expert response into LLM-readable feedback
- [ ] 10.7 Support assessoria-specific expert variants: allow custom system prompts per assessoria
- [ ] 10.8 Create test skill responses: mock expert validator for testing without API calls
- [ ] 10.9 Implement iterative loop: call expert validator up to 2x if LLM revises proposal

## 11. LLM Integration with Expert Feedback

- [ ] 11.1 Update `WorkoutProposalHandler` to call expert validator after initial proposal
- [ ] 11.2 If expert rejects: pass expert feedback to LLM for revision attempt (iteration 1)
- [ ] 11.3 If LLM revision submitted: call expert validator again (iteration 2)
- [ ] 11.4 Track iteration history: store original → expert feedback → revised → final
- [ ] 11.5 Implement max iterations: stop after 2 attempts, return best result or rejection
- [ ] 11.6 Create `ProposalIterationLog` to track LLM iterations and expert feedback for analysis
- [ ] 11.7 Generate summary response: include final status, applied corrections, expert reasoning
- [ ] 11.8 Cache expert assessments: avoid re-validating identical proposals

## 12. Testing Expert Validator

- [ ] 12.1 Create `ExpertValidatorIntegrationTest` with real skill calls (or mocked for CI)
- [ ] 12.2 Create test cases for all biomechanical rules: stimulus compatibility, recovery ratios, progression safety
- [ ] 12.3 Create test data: proposals that should ACCEPT, AUTO_CORRECT, REJECT, FLAG_FOR_REVIEW
- [ ] 12.4 Test iterative loop: verify LLM revision + re-validation flow works
- [ ] 12.5 Test assessoria-specific variants: verify custom prompts work per assessoria
- [ ] 12.6 Performance test: verify expert validator adds < 500ms to total proposal latency

## 13. Deployment & Validation

- [ ] 13.1 Run full test suite: `./mvnw clean test` passes without errors
- [ ] 13.2 Run backend validation: verify compiler has no warnings
- [ ] 13.3 Manual testing: submit interval workout through UI, verify expert validation flow works
- [ ] 13.4 Verify database migration: test migration up/down with real data
- [ ] 13.5 Performance testing: validate that full validation pipeline (numeric + expert) adds < 500ms
- [ ] 13.6 Expert skill versioning: document skill version in deployment, enable rollback if needed
- [ ] 13.7 Staging deployment: test with real coaches, gather feedback on expert validator reasoning
- [ ] 13.8 Monitor expert validator confidence: track % of LOW_CONFIDENCE cases requiring coach review

## Definition of Done

✅ All tasks in sections 1-13 completed and verified
✅ Database migrations applied successfully  
✅ Full test suite passing (unit + integration + E2E)
✅ Expert validator skill deployed and versioned
✅ No new compiler warnings
✅ API response schemas documented (including expert feedback)
✅ Operational runbook in place (including skill management)
✅ Expert validation reasoning documented for coaches
✅ Code review approved
