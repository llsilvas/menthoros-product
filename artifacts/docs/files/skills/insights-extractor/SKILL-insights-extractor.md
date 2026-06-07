---
name: insights-extractor
description: Extracts recurring behavioral and physiological patterns from an athlete's training history, maintains a learning profile, and generates actionable constraints for plan personalization
version: 1.0.0
language: en-US
tags: [learning, pattern-detection, personalization, athlete-profile, longitudinal-analysis]
---

# Insights Extractor

## Purpose

Analyze an athlete's training history week by week to identify recurring patterns, build a persistent learning profile, and extract constraints that make future training plans progressively more personalized.

This skill closes the feedback loop:
```
Weekly Feedback → Insights Extractor → AthleteLearningProfile → Plan Generation
```

Unlike `workout-analyzer` (single session) and `weekly-feedback` (one week), this skill works **longitudinally** — it needs at least 4 weeks of history and becomes more valuable with each passing week.

**Core output:** Patterns with confidence scores that, once confirmed, become structural constraints in the athlete's plan.

---

## Pattern Categories

This skill detects patterns across 7 categories:

### 1. `recovery_pattern`
How this athlete recovers between sessions and from accumulated load.

**Signals to watch:**
- RPE elevation the day after intense sessions (interval, tempo, long run)
- Number of days needed before next quality session without RPE penalty
- TSB recovery rate (how fast TSB improves during easy weeks)
- Correlation between sleep/rest signals and subsequent execution scores

**Example observations:**
- "Consistently shows elevated RPE on easy runs the day after interval sessions"
- "Needs 48h, not 24h, to fully recover from sessions > 15km"
- "TSB recovers faster than average — bounces from -20 to -5 within 5 days"

---

### 2. `performance_response`
How this athlete's performance responds to specific training stimuli.

**Signals to watch:**
- Execution score trends after sustained Z2 blocks (aerobic base gains)
- Performance on interval sessions after different preceding week types
- Long run quality correlation with week's total prior TSS
- Pace improvement rate relative to CTL increase

**Example observations:**
- "Interval execution consistently improves after weeks with high Z2 volume (>70% easy)"
- "Long run performance degrades when preceded by >2 quality sessions earlier in the week"
- "Shows negative split ability only when starting long runs in Z2 (not Z3)"

---

### 3. `fatigue_indicator`
Early warning signals that predict performance degradation before TSB reaches critical thresholds.

**Signals to watch:**
- Recurring pattern of elevated RPE at specific TSB levels (personal fatigue threshold)
- Number of consecutive load days before execution scores start dropping
- Week grades that consistently precede CHALLENGING/DIFFICULT weeks (overreach precursors)
- Accumulated fatigue sessions (`primary_cause = ACCUMULATED_FATIGUE`) clustering

**Example observations:**
- "Performance degrades when TSB drops below -18 (personal threshold, lower than population average)"
- "More than 4 consecutive training days reliably produces elevated RPE the following week"
- "Two consecutive GOOD/EXCEPTIONAL weeks always followed by need for reduced load"

---

### 4. `pacing_behavior`
This athlete's habitual pacing patterns and tendency for specific execution errors.

**Signals to watch:**
- `primary_cause = PACING_ERROR` frequency across sessions
- Negative split rate in long runs (how often achieved vs not)
- Interval performance decay pattern (consistent high/low decay across sessions)
- First repetition vs last repetition pace differential (tendency to start too fast)

**Example observations:**
- "Consistently starts long runs too fast — positive split in 7/9 long runs above 16km"
- "Interval performance decay improves (lower %) when target pace is set 5s/km slower than capability"
- "Shows excellent pacing control in TEMPO sessions but erratic in INTERVAL"

---

### 5. `load_tolerance`
The specific volume and intensity range where this athlete performs optimally.

**Signals to watch:**
- Weekly volume range correlated with best execution scores and grades
- TSS range that produces positive TSB trend (sustainable load)
- Maximum consecutive quality sessions before execution degrades
- Response to sudden volume increases (resilient vs sensitive)

**Example observations:**
- "Performs optimally at 55-65km/week — grade degrades consistently above 70km"
- "Tolerates up to 2 quality sessions per week without execution penalty — 3rd session always underperforms"
- "10%+ volume spikes produce CHALLENGING grades even when TSB is positive"

---

### 6. `contextual_factor`
External factors that consistently affect this athlete's performance, derived from patterns in the data.

**Signals to watch:**
- Execution score drops on specific days of the week (work schedule proxy)
- Grade degradation in weeks where athlete provided specific reasons (if available)
- Seasonal patterns (volume completion drops in summer heat months)
- Monday vs Saturday performance differential (fatigue accumulation through week)

**Example observations:**
- "Friday sessions consistently have lower execution scores — likely work fatigue"
- "Volume completion drops 25% in weeks 4-6 of the month (personal pattern)"
- "Monday quality sessions outperform Thursday quality sessions across all contexts"

---

### 7. `goal_alignment`
Patterns in how this athlete's behavior correlates with proximity and nature of their goal.

**Signals to watch:**
- Adherence rate trend as race date approaches (increases or decreases under pressure)
- Execution quality on goal-specific sessions (race pace work, long runs for marathoners)
- Consistency across consecutive weeks (streaks and their triggers)
- Self-reported RPE calibration accuracy (actual vs expected) on goal-pace sessions

**Example observations:**
- "Adherence increases to >90% when within 8 weeks of goal race"
- "Race-pace interval execution consistently outperforms easier interval targets — responds well to racing stimulus"
- "Longest consistency streaks always follow weeks with EXCEPTIONAL grade — momentum-driven athlete"

---

## Confidence Scoring

Each pattern has a confidence score (0-100) computed by `calculate_pattern_metrics.py`.

### Status Transitions

```
EMERGING (1-2 occurrences, confidence < 60)
    │
    ├─ 3+ consistent occurrences → CONFIRMED (confidence ≥ 60)
    │
    └─ 0 occurrences in last 4 weeks → INVALIDATED

CONFIRMED (3+ occurrences, confidence ≥ 60)
    │
    ├─ Counter-evidence in 3+ consecutive weeks → INVALIDATED
    │
    └─ Continued support → confidence grows (max 95)

INVALIDATED (no longer active)
    └─ Retained in history but excluded from plan constraints
```

### Confidence Formula

```
base_score = min(occurrences, 8) / 8 * 60   (max 60pts from frequency)
recency_bonus = recency_weight * 25           (max 25pts — recent evidence worth more)
consistency_bonus = consistency_rate * 15     (max 15pts — no gaps in pattern)

confidence = base_score + recency_bonus + consistency_bonus
```

**Recency weights:** Most recent week = 1.0, previous = 0.85, 2 weeks ago = 0.70, older = 0.50.

**Status thresholds:**
- New detection: confidence = 25-40 (EMERGING)
- EMERGING → CONFIRMED: confidence ≥ 60 AND occurrences ≥ 3
- CONFIRMED → INVALIDATED: 3+ consecutive weeks without supporting evidence

---

## Analysis Framework

### Step 1: Load Existing Profile

Read all existing patterns with their current status, confidence, and last-observed week. This is the baseline — every step compares against it.

---

### Step 2: Compute Pattern Metrics (Python Script)

Run `calculate_pattern_metrics.py` to get:
- Updated confidence score per existing pattern (recency-weighted)
- Evidence windows: for each category, which weeks support/contradict which patterns
- Profile maturity delta

This is your objective input. Do not override these scores in reasoning — use them as ground truth.

---

### Step 3: Evaluate Existing Patterns

For each existing pattern, determine action:

```
EMERGING pattern:
    IF new evidence supports it this week:
        occurrences += 1
        recalculate confidence
        IF confidence ≥ 60 AND occurrences ≥ 3:
            status = CONFIRMED
    ELIF no evidence this week (neutral):
        confidence -= 5 (slight decay)
    ELIF counter-evidence this week:
        confidence -= 15

CONFIRMED pattern:
    IF counter-evidence this week:
        consecutive_contradictions += 1
        IF consecutive_contradictions >= 3:
            status = INVALIDATED
    ELSE:
        confidence += 3 (reinforcement, max 95)

INVALIDATED: skip (already excluded)
```

**What counts as "evidence" vs "counter-evidence":**
- Evidence: the specific behavior described in the observation occurred this week
- Counter-evidence: the opposite occurred (athlete paced well where pattern says they usually don't)
- Neutral: workout type/context didn't occur this week (no data to judge)

---

### Step 4: Detect New Patterns

Scan the current week's data for signals not yet captured in the profile.

**For each of the 7 categories:**
1. Look for any notable signal in the current week's data
2. Cross-reference with recent history (last 4 weeks) — is this the 2nd or 3rd time?
3. If yes → create EMERGING pattern with initial confidence based on occurrences
4. If first time → note it but do NOT create a pattern (requires ≥ 2 data points)

**Detection thresholds (minimum to create EMERGING pattern):**
- Behavioral signal appears in at least 2 of the last 5 weeks
- Signal is specific and measurable (not vague)
- Signal is not already captured by an existing pattern

**Important:** Do NOT create micro-patterns from single-week anomalies. One unusual week is noise.

---

### Step 5: Extract Actionable Constraints

Only for patterns with `status = CONFIRMED`:

```
recovery_pattern:
    → applies_to: INTERVAL_SCHEDULING or LOAD_MANAGEMENT
    → constraint_type: "mandatory_buffer_after_intense_session"
    → constraint_value: specific number of days

performance_response:
    → applies_to: PLAN_GENERATION
    → constraint_type: "z2_volume_minimum" or "quality_session_sequencing"
    → constraint_value: specific percentage or session order

fatigue_indicator:
    → applies_to: LOAD_MANAGEMENT
    → constraint_type: "personal_tsb_threshold" or "max_consecutive_load_days"
    → constraint_value: the specific value for this athlete

pacing_behavior:
    → applies_to: PLAN_GENERATION
    → constraint_type: "pace_target_adjustment" or "long_run_start_zone"
    → constraint_value: specific adjustment (e.g. "-5s/km from capability")

load_tolerance:
    → applies_to: PLAN_GENERATION or LOAD_MANAGEMENT
    → constraint_type: "optimal_weekly_volume_range" or "max_quality_sessions_per_week"
    → constraint_value: specific range or number

contextual_factor:
    → applies_to: PLAN_GENERATION
    → constraint_type: "avoid_quality_on_day" or "volume_reduction_period"
    → constraint_value: specific day or time period

goal_alignment:
    → applies_to: PLAN_GENERATION
    → constraint_type: "adherence_pattern" or "race_pace_session_priority"
    → constraint_value: behavioral rule
```

**Format each constraint with `example_application`:** A concrete example of how a plan would differ with this constraint applied.

---

### Step 6: Update Profile Maturity Score

```
maturity_score = min(100, (confirmed_patterns * 10) + (weeks_tracked * 2))
```

This score tells the plan generator how much to trust and prioritize the constraints:
- 0-20: New profile — few constraints applied
- 21-50: Developing — key constraints active
- 51-80: Mature — full personalization active
- 81-100: Expert — profile is highly reliable

---

## Output Schema

```json
{
  "patterns_updated": [
    {
      "pattern_id": "UUID",
      "category": "string",
      "observation": "string",
      "status": "EMERGING | CONFIRMED | INVALIDATED",
      "confidence": "integer 0-100",
      "occurrences": "integer",
      "confidence_delta": "integer (positive = growing)",
      "status_changed": "boolean"
    }
  ],
  "patterns_new": [
    {
      "category": "string",
      "observation": "string",
      "status": "EMERGING",
      "confidence": "integer 20-40",
      "occurrences": "integer",
      "evidence": "string (what data triggered this)"
    }
  ],
  "patterns_invalidated": [
    {
      "pattern_id": "UUID",
      "observation": "string",
      "invalidation_reason": "string"
    }
  ],
  "actionable_constraints": [
    {
      "applies_to": "PLAN_GENERATION | INTERVAL_SCHEDULING | LOAD_MANAGEMENT | RECOVERY",
      "constraint_type": "string",
      "constraint_value": "string",
      "example_application": "string",
      "source_pattern_id": "UUID",
      "confidence": "integer"
    }
  ],
  "profile_maturity_delta": "integer",
  "new_maturity_score": "integer",
  "weeks_tracked": "integer",
  "extraction_summary": "string (max 300 chars, for coach dashboard)"
}
```

---

## Complete Examples

### Example 1: Recovery Pattern Promoted to CONFIRMED

**Context:** Week 7, ADVANCED athlete Carlos. Existing EMERGING recovery pattern with 2 occurrences. Current week shows same signal (elevated RPE day-after-interval).

**Expected Output:**
```json
{
  "patterns_updated": [
    {
      "pattern_id": "uuid-recovery-1",
      "category": "recovery_pattern",
      "observation": "Shows elevated RPE on easy runs the day after interval sessions",
      "status": "CONFIRMED",
      "confidence": 72,
      "occurrences": 3,
      "confidence_delta": 27,
      "status_changed": true
    }
  ],
  "patterns_new": [],
  "patterns_invalidated": [],
  "actionable_constraints": [
    {
      "applies_to": "INTERVAL_SCHEDULING",
      "constraint_type": "mandatory_buffer_after_interval",
      "constraint_value": "2 days minimum before next quality session",
      "example_application": "If INTERVAL on TUE, next quality session (TEMPO or INTERVAL) no earlier than THU. WED must be RECOVERY or EASY.",
      "source_pattern_id": "uuid-recovery-1",
      "confidence": 72
    }
  ],
  "profile_maturity_delta": 12,
  "new_maturity_score": 34,
  "weeks_tracked": 7,
  "extraction_summary": "Padrão de recuperação confirmado (3 ocorrências, confiança 72%): Carlos precisa de 2 dias após intervalados antes de próxima sessão de qualidade. Restrição ativa nos próximos planos."
}
```

---

### Example 2: New Load Tolerance Pattern Detected

**Context:** Week 12, ADVANCED athlete Carlos. 3 consecutive EXCEPTIONAL weeks at 55-65km; 2 prior CHALLENGING weeks above 70km. No load_tolerance pattern in profile yet.

**Expected Output:**
```json
{
  "patterns_updated": [],
  "patterns_new": [
    {
      "category": "load_tolerance",
      "observation": "Performs optimally at 55-65km/week — grade drops consistently above 70km",
      "status": "EMERGING",
      "confidence": 38,
      "occurrences": 2,
      "evidence": "3 consecutive EXCEPTIONAL/GOOD grades at 55-65km range vs 2 CHALLENGING grades in weeks with >70km (weeks 3 and 8 in recent history)"
    }
  ],
  "patterns_invalidated": [],
  "actionable_constraints": [],
  "profile_maturity_delta": 2,
  "new_maturity_score": 36,
  "weeks_tracked": 12,
  "extraction_summary": "Novo padrão emergente detectado: volume semanal ótimo de Carlos parece ser 55-65km. Semanas acima de 70km correlacionam com grades CHALLENGING. Confirmação em 1-2 semanas adicionais."
}
```

---

### Example 3: Confirmed Pattern Invalidated + New Fatigue Signal

**Context:** Week 18, ADVANCED athlete Carlos. Previously confirmed pacing pattern ("starts long runs too fast") appears to have been corrected over the last 3 weeks — negative split achieved in 3 consecutive long runs.

**Expected Output:**
```json
{
  "patterns_updated": [
    {
      "pattern_id": "uuid-pacing-1",
      "category": "pacing_behavior",
      "observation": "Consistently starts long runs too fast — positive split in majority of long runs",
      "status": "INVALIDATED",
      "confidence": 20,
      "occurrences": 6,
      "confidence_delta": -45,
      "status_changed": true
    }
  ],
  "patterns_new": [
    {
      "category": "performance_response",
      "observation": "Long run pacing has improved significantly after sustained Z2 focus — now achieving negative splits consistently",
      "status": "EMERGING",
      "confidence": 32,
      "occurrences": 2,
      "evidence": "3 consecutive long runs with negative split (weeks 15, 16, 17) following 6-week Z2-heavy BASE block"
    }
  ],
  "patterns_invalidated": [
    {
      "pattern_id": "uuid-pacing-1",
      "observation": "Consistently starts long runs too fast — positive split in majority of long runs",
      "invalidation_reason": "Counter-evidence in 3 consecutive weeks: athlete achieved negative split in long runs during weeks 15, 16, and 17, suggesting the pattern was resolved through training."
    }
  ],
  "actionable_constraints": [],
  "profile_maturity_delta": -8,
  "new_maturity_score": 54,
  "weeks_tracked": 18,
  "extraction_summary": "Padrão de pacing antigo invalidado: Carlos corrigiu tendência de saída rápida em longões — negative splits consistentes nas últimas 3 semanas. Novo padrão emergente de resposta positiva ao trabalho Z2."
}
```

---

## Implementation Notes

### Minimum Data Requirements

- **< 4 weeks:** Skip silently. Log reason. Do not generate partial patterns.
- **4-7 weeks:** Focus on `recovery_pattern` and `load_tolerance` — most detectable early.
- **8-16 weeks:** Add `performance_response` and `fatigue_indicator`.
- **17+ weeks:** All 7 categories viable. Profile maturity approaches reliable range.

### Pattern Quality Rules

✅ Patterns must be **specific and measurable** — "recovers slowly" is not a pattern; "needs 2 days buffer after intervals" is.
✅ Patterns must have **at least 2 data points** before becoming EMERGING.
✅ Patterns must have **physiological grounding** — if you can't explain WHY it happens, question if it's real.
✅ **One observation per pattern** — don't merge two signals into one pattern.
✅ Patterns should describe the **athlete's individual deviation** from population norms — generic observations are not patterns.

❌ Do NOT create patterns from a single unusual week.
❌ Do NOT create vague patterns ("performs well when rested").
❌ Do NOT promote to CONFIRMED without 3+ consistent data points.
❌ Do NOT extract constraints from EMERGING patterns — only CONFIRMED.
❌ Do NOT invalidate based on a single contradicting week.

### Extraction Summary Format

The `extraction_summary` appears on the coach dashboard. It must be:
- In Brazilian Portuguese
- Max 300 characters
- Factual and specific (pattern name, confidence, status change)
- No fluff — coaches scan this quickly

**Template:** `"[Status change]: [observation in 1 sentence] ([confidence]%). [Impact on plans/next step]."`

### Avoiding Hallucinated Patterns

If the data is ambiguous, do NOT create a pattern. Patterns that are wrong actively harm personalization.

Before creating any new pattern, ask:
1. Is there data from at least 2 weeks supporting this?
2. Can I cite specific weeks and metrics as evidence?
3. Is this specific to THIS athlete, not generic training advice?
4. Would a coach recognize this as a real behavioral tendency?

If any answer is "no" → do not create the pattern.

---

## Scientific References

- **Banister Fitness-Fatigue Model:** TSB as predictor of performance readiness
- **Foster et al. (2001):** Training monotony and strain as injury/illness predictors
- **Seiler (2010):** Intensity distribution and individual response variation
- **Halson (2014):** Recovery monitoring — individual thresholds vs population norms
- **Issurin (2010):** Block periodization and individual adaptation rates

---

**Minimum 4 weeks of weekly-feedback data required before this skill produces output.**

The profile becomes meaningfully personalized around week 8-10. By week 16+, the constraints should materially differentiate this athlete's plans from generic templates.
