---
name: weekly-plan-validator
description: Validates a proposed weekly training plan against physiological safety rules before persistence — blocks dangerous plans, flags adjustments, provides regeneration constraints
version: 1.0.0
language: en-US
tags: [validation, plan-generation, safety-guard, periodization, prescription]
---

# Weekly Plan Validator

## Purpose

Validate a proposed weekly training plan BEFORE it is persisted, ensuring it is:
- Physiologically safe (no injury risk from overload)
- Coherent with the athlete's current fatigue state
- Appropriate for the current periodization phase
- Structurally sound (no back-to-back intense sessions, adequate rest)

This skill acts as the **last deterministic gate** between LLM proposal and database persistence.

**Decision outputs:**
- `APPROVED` — Safe to persist as-is
- `ADJUSTMENT_NEEDED` — Warnings present; coach should review but not blocking
- `REJECTED` — Critical violations; plan must NOT be persisted; regeneration constraints provided

---

## Input Schema

```json
{
  "proposed_plan": {
    "week_number": "integer",
    "total_volume_km": "number",
    "total_tss_estimated": "number",
    "workouts": [
      {
        "type": "LONG_RUN | INTERVAL | TEMPO | RECOVERY | EASY | REST",
        "distance_km": "number",
        "tss_estimated": "number",
        "day_of_week": "MON | TUE | WED | THU | FRI | SAT | SUN",
        "target_hr_zone": "Z1 | Z2 | Z3 | Z4 | Z5 (optional)"
      }
    ]
  },
  "athlete_context": {
    "tsb": "number (Training Stress Balance)",
    "ctl": "number (Chronic Training Load)",
    "atl": "number (Acute Training Load)",
    "periodization_phase": "BASE | BUILD | PEAK | TAPER | RECOVERY",
    "athlete_level": "BEGINNER | INTERMEDIATE | ADVANCED | ELITE",
    "active_injury": "boolean",
    "injury_description": "string (optional)",
    "available_days": "integer"
  },
  "historical_context": {
    "avg_volume_last_4_weeks_km": "number",
    "avg_tss_last_4_weeks": "number",
    "max_volume_last_12_weeks_km": "number",
    "last_interval_session_days_ago": "integer",
    "consecutive_load_days_current": "integer"
  }
}
```

---

## Validation Framework

### Check 1: Load Progression

**What to check:** Week-over-week volume and TSS increase must not exceed safe thresholds.

**Deterministic thresholds:**

| Metric | Safe | Warning | Critical |
|--------|------|---------|----------|
| Volume increase % | ≤ 10% | 10–20% | > 20% |
| TSS increase % | ≤ 15% | 15–25% | > 25% |

**Absolute weekly volume caps by level:**

| Level | Max km/week |
|-------|-------------|
| BEGINNER | 30 km |
| INTERMEDIATE | 60 km |
| ADVANCED | 120 km |
| ELITE | 200 km |

**Decision logic:**
```
IF volume_increase > 20% OR tss_increase > 25% OR volume > absolute_cap:
    severity = CRITICAL
ELIF volume_increase > 10% OR tss_increase > 15%:
    severity = WARNING
ELSE:
    severity = NONE
```

---

### Check 2: Recovery Adequacy

**What to check:** Current fatigue state (TSB) and rest day placement must meet minimum safety requirements.

**TSB thresholds:**

| TSB Range | Status | Action |
|-----------|--------|--------|
| > -10 | Fresh / Good | Allow any phase-appropriate workout |
| -10 to -15 | Fatigued | Warning: reduce quality session count |
| -15 to -25 | Overreaching | Critical: max 1 quality session, prioritize Z1-Z2 |
| < -25 | High Risk | REJECT: no quality sessions allowed |

**Consecutive load days limits:**

| Level | Max Consecutive Days |
|-------|---------------------|
| BEGINNER | 3 |
| INTERMEDIATE | 4 |
| ADVANCED | 5 |
| ELITE | 6 |

**Minimum rest rules:**
- At least 1 REST or RECOVERY day per week for all levels
- At least 1 easy/rest day AFTER each INTERVAL session
- At least 1 easy/rest day AFTER LONG_RUN if distance > 18 km

**Decision logic:**
```
IF tsb < -25 OR consecutive_days > level_max:
    severity = CRITICAL
ELIF tsb < -15 OR rest_day_placement_violated:
    severity = WARNING
ELSE:
    severity = NONE
```

---

### Check 3: Training Zone Distribution

**What to check:** Intensity distribution should follow phase-appropriate polarization model.

**Recommended distribution by phase:**

| Phase | Z1-Z2 (Easy) | Z3 (Moderate) | Z4-Z5 (Hard) |
|-------|-------------|---------------|--------------|
| BASE | 85–90% | 5–10% | 5% |
| BUILD | 80% | 10% | 10% |
| PEAK | 75% | 10% | 15% |
| TAPER | 90% | 5% | 5% |
| RECOVERY | 95–100% | 0–5% | 0% |

**How to calculate distribution:** Use `tss_estimated` per workout as proxy for intensity volume. Map workout types to zones:
- EASY / RECOVERY / REST → Z1-Z2
- TEMPO → Z3-Z4
- INTERVAL → Z4-Z5
- LONG_RUN → Z2 (unless explicitly zoned higher)

**Decision logic:**
```
IF hard_percentage > phase_hard_max + 10%:
    severity = CRITICAL
ELIF hard_percentage > phase_hard_max + 5%:
    severity = WARNING
ELSE:
    severity = NONE
```

---

### Check 4: Periodization Coherence

**What to check:** Workout sequencing and selection must be structurally sound and coherent with the training phase.

**Structural rules (all phases):**

```
INTERVAL sessions:
    ✅ Max 2 per week (ADVANCED/ELITE); max 1 (BEGINNER/INTERMEDIATE)
    ✅ Never on consecutive days
    ✅ Must have RECOVERY or EASY day after
    ✅ Not allowed if tsb < -25 (overrides phase rules)

LONG_RUN:
    ✅ Max 1 per week
    ✅ Never the day after INTERVAL
    ✅ Followed by REST or EASY

TEMPO:
    ✅ Max 1 per week in BASE
    ✅ Max 2 per week in BUILD/PEAK
    ✅ Not on consecutive days

REST:
    ✅ At least 1 per week regardless of level

INJURY ACTIVE:
    ✅ No INTERVAL, TEMPO, or LONG_RUN allowed
    ✅ Only EASY, RECOVERY, REST
```

**Phase-specific rules:**

```
BASE: No INTERVAL allowed; max 1 TEMPO; focus LONG_RUN + EASY
BUILD: Max 2 INTERVAL; max 2 TEMPO; LONG_RUN weekly
PEAK: Max 2 INTERVAL; race-pace TEMPO; reduce LONG_RUN volume
TAPER: Max 1 INTERVAL; no new TEMPO; sharpen only
RECOVERY: No INTERVAL; no TEMPO; no LONG_RUN > 12km
```

**Decision logic:**
```
IF back_to_back_intervals OR injury_with_intense_sessions OR
   interval_count > level_max:
    severity = CRITICAL
ELIF phase_rule_violated OR structural_pattern_broken:
    severity = WARNING
ELSE:
    severity = NONE
```

---

### Check 5: Monotony Index

**What to check:** Day-to-day TSS variation must prevent training monotony (monotony index < 2.0).

**Formula:**
```
daily_tss = [tss per day, 0 for REST]
monotony_index = mean(daily_tss) / std_dev(daily_tss)
```

**Thresholds:**

| Monotony Index | Status |
|----------------|--------|
| < 1.5 | Safe — good variation |
| 1.5 – 2.0 | Warning — reduce repetitiveness |
| > 2.0 | Critical — injury and illness risk |

Use `calculate_plan_metrics.py` to compute this value.

**Decision logic:**
```
IF monotony_index > 2.0:
    severity = WARNING  (support critical from other checks, not solo CRITICAL)
ELIF monotony_index > 1.5:
    severity = INFO
ELSE:
    severity = NONE
```

---

## Overall Decision Logic

**Always follow this sequence:**

```
1. Run all 5 checks — collect all violations with severity
2. Count CRITICAL violations

   IF injury_active AND plan has INTERVAL/TEMPO/LONG_RUN:
       decision = REJECTED (override all other logic)

   ELIF any CRITICAL violation:
       decision = REJECTED

   ELIF any WARNING violation:
       decision = ADJUSTMENT_NEEDED

   ELSE:
       decision = APPROVED

3. Calculate validation_score:
   base = 100
   FOR each CRITICAL violation: base -= 25
   FOR each WARNING violation: base -= 10
   FOR each INFO: base -= 3
   validation_score = max(0, base)

4. If REJECTED: build regeneration_constraints from all CRITICAL violations
5. Generate coach_notes with specific, actionable guidance
```

---

## Output Schema

```json
{
  "decision": "APPROVED | ADJUSTMENT_NEEDED | REJECTED",
  "violations": [
    {
      "check_name": "string",
      "severity": "CRITICAL | WARNING | INFO",
      "description": "string (what is wrong and why it matters)",
      "actual_value": "string (the value found in the plan)",
      "threshold_value": "string (the limit that was violated)",
      "suggested_fix": "string (specific, actionable correction)"
    }
  ],
  "summary": "string (max 150 chars, concise headline of decision)",
  "coach_notes": "string (detailed guidance if ADJUSTMENT_NEEDED or REJECTED)",
  "regeneration_constraints": {
    "max_volume_km": "number",
    "max_tss": "number",
    "max_consecutive_days": "integer",
    "forbidden_workout_types": ["array of strings"],
    "required_rest_days": ["array of day names"],
    "phase_constraints": "string (instruction for LLM regeneration)"
  },
  "validation_score": "integer (0-100)"
}
```

Note: `regeneration_constraints` is only populated when `decision = REJECTED`. It is structured specifically to be passed directly to the plan generation LLM for automatic retry.

---

## Complete Examples

### Example 1: Approved — Solid BUILD Week

**Input:**
```json
{
  "proposed_plan": {
    "week_number": 8,
    "total_volume_km": 62,
    "total_tss_estimated": 520,
    "workouts": [
      {"type": "EASY",     "distance_km": 10, "tss_estimated": 55,  "day_of_week": "MON"},
      {"type": "INTERVAL", "distance_km": 12, "tss_estimated": 130, "day_of_week": "TUE"},
      {"type": "RECOVERY", "distance_km": 8,  "tss_estimated": 35,  "day_of_week": "WED"},
      {"type": "TEMPO",    "distance_km": 12, "tss_estimated": 110, "day_of_week": "THU"},
      {"type": "REST",     "distance_km": 0,  "tss_estimated": 0,   "day_of_week": "FRI"},
      {"type": "LONG_RUN", "distance_km": 20, "tss_estimated": 150, "day_of_week": "SAT"},
      {"type": "EASY",     "distance_km": 0,  "tss_estimated": 40,  "day_of_week": "SUN"}
    ]
  },
  "athlete_context": {
    "tsb": -8, "ctl": 55, "atl": 63,
    "periodization_phase": "BUILD",
    "athlete_level": "ADVANCED",
    "active_injury": false,
    "available_days": 6
  },
  "historical_context": {
    "avg_volume_last_4_weeks_km": 58,
    "avg_tss_last_4_weeks": 490,
    "max_volume_last_12_weeks_km": 65,
    "last_interval_session_days_ago": 6,
    "consecutive_load_days_current": 0
  }
}
```

**Expected Output:**
```json
{
  "decision": "APPROVED",
  "violations": [],
  "summary": "Plan approved. BUILD week with sound structure (+6.9% volume). TSB manageable at -8. Good polarization and rest placement.",
  "coach_notes": null,
  "regeneration_constraints": null,
  "validation_score": 92
}
```

---

### Example 2: Rejected — Dangerous Overload

**Input:**
```json
{
  "proposed_plan": {
    "week_number": 5,
    "total_volume_km": 85,
    "total_tss_estimated": 720,
    "workouts": [
      {"type": "INTERVAL", "distance_km": 14, "tss_estimated": 160, "day_of_week": "MON"},
      {"type": "INTERVAL", "distance_km": 14, "tss_estimated": 160, "day_of_week": "TUE"},
      {"type": "TEMPO",    "distance_km": 15, "tss_estimated": 140, "day_of_week": "WED"},
      {"type": "LONG_RUN", "distance_km": 22, "tss_estimated": 170, "day_of_week": "THU"},
      {"type": "EASY",     "distance_km": 10, "tss_estimated": 50,  "day_of_week": "FRI"},
      {"type": "TEMPO",    "distance_km": 10, "tss_estimated": 40,  "day_of_week": "SAT"}
    ]
  },
  "athlete_context": {
    "tsb": -28, "ctl": 48, "atl": 76,
    "periodization_phase": "BUILD",
    "athlete_level": "INTERMEDIATE",
    "active_injury": false,
    "available_days": 6
  },
  "historical_context": {
    "avg_volume_last_4_weeks_km": 52,
    "avg_tss_last_4_weeks": 420,
    "max_volume_last_12_weeks_km": 58,
    "last_interval_session_days_ago": 3,
    "consecutive_load_days_current": 4
  }
}
```

**Expected Output:**
```json
{
  "decision": "REJECTED",
  "violations": [
    {
      "check_name": "recovery_adequacy",
      "severity": "CRITICAL",
      "description": "TSB at -28 indicates severe accumulated fatigue. Adding a high-load week risks injury and illness.",
      "actual_value": "TSB: -28",
      "threshold_value": "Critical threshold: -25",
      "suggested_fix": "Insert a recovery week (TSS ≤ 280, all Z1-Z2) before resuming BUILD load"
    },
    {
      "check_name": "load_progression",
      "severity": "CRITICAL",
      "description": "Volume increase of 63.5% far exceeds the 10% safe weekly progression rule.",
      "actual_value": "85 km vs 4-week avg of 52 km",
      "threshold_value": "Max safe: +10% = 57.2 km",
      "suggested_fix": "Cap volume at 57 km for this week"
    },
    {
      "check_name": "periodization_coherence",
      "severity": "CRITICAL",
      "description": "Back-to-back INTERVAL sessions (MON+TUE) violate minimum recovery between high-intensity sessions.",
      "actual_value": "INTERVAL on MON, INTERVAL on TUE",
      "threshold_value": "Min 1 easy/rest day between interval sessions",
      "suggested_fix": "Replace TUE session with RECOVERY or EASY"
    },
    {
      "check_name": "monotony_index",
      "severity": "WARNING",
      "description": "High monotony (2.4) — insufficient day-to-day load variation increases illness risk.",
      "actual_value": "Monotony index: 2.4",
      "threshold_value": "Safe: < 1.5 | Critical: > 2.0",
      "suggested_fix": "Add a REST day and alternate hard/easy more clearly"
    }
  ],
  "summary": "REJECTED. 3 critical violations: severe fatigue (TSB -28), 63% volume spike, back-to-back intervals. High injury risk.",
  "coach_notes": "This plan would push an INTERMEDIATE athlete into overreaching territory during an already fatigued state. Strongly recommend a full recovery week with only Z1-Z2 runs (≤ 40 km, ≤ 280 TSS) before resuming BUILD loading.",
  "regeneration_constraints": {
    "max_volume_km": 45,
    "max_tss": 280,
    "max_consecutive_days": 4,
    "forbidden_workout_types": ["INTERVAL", "TEMPO"],
    "required_rest_days": ["WED", "FRI", "SUN"],
    "phase_constraints": "Recovery week: 95-100% Z1-Z2. No quality sessions. Active recovery and easy aerobic only. Athlete needs TSB to recover above -10 before next BUILD week."
  },
  "validation_score": 22
}
```

---

### Example 3: Adjustment Needed — Minor Zone Distribution Warning

**Input:**
```json
{
  "proposed_plan": {
    "week_number": 12,
    "total_volume_km": 55,
    "total_tss_estimated": 480,
    "workouts": [
      {"type": "INTERVAL", "distance_km": 12, "tss_estimated": 140, "day_of_week": "TUE"},
      {"type": "EASY",     "distance_km": 10, "tss_estimated": 55,  "day_of_week": "WED"},
      {"type": "TEMPO",    "distance_km": 12, "tss_estimated": 110, "day_of_week": "THU"},
      {"type": "REST",     "distance_km": 0,  "tss_estimated": 0,   "day_of_week": "FRI"},
      {"type": "LONG_RUN", "distance_km": 18, "tss_estimated": 130, "day_of_week": "SAT"},
      {"type": "EASY",     "distance_km": 3,  "tss_estimated": 20,  "day_of_week": "SUN"}
    ]
  },
  "athlete_context": {
    "tsb": -5, "ctl": 52, "atl": 57,
    "periodization_phase": "BASE",
    "athlete_level": "INTERMEDIATE",
    "active_injury": false,
    "available_days": 6
  },
  "historical_context": {
    "avg_volume_last_4_weeks_km": 51,
    "avg_tss_last_4_weeks": 450,
    "max_volume_last_12_weeks_km": 58,
    "last_interval_session_days_ago": 7,
    "consecutive_load_days_current": 0
  }
}
```

**Expected Output:**
```json
{
  "decision": "ADJUSTMENT_NEEDED",
  "violations": [
    {
      "check_name": "zone_distribution",
      "severity": "WARNING",
      "description": "In BASE phase, hard intensity (Z3-Z5) should not exceed 15%. This plan has 52% of TSS in INTERVAL/TEMPO sessions.",
      "actual_value": "Hard intensity: ~52% of TSS",
      "threshold_value": "BASE phase maximum: 15% hard intensity",
      "suggested_fix": "Consider replacing TEMPO with a second EASY or moving it to a future BUILD week. Alternatively, convert TEMPO to a steady Z2 progression run."
    }
  ],
  "summary": "Plan needs adjustment. Good structure and load, but intensity distribution (52% hard) exceeds BASE phase guidelines (15% max).",
  "coach_notes": "The plan is structurally sound with appropriate volume progression (+7.8%). The main concern is having both INTERVAL and TEMPO in a BASE week — this pushes intensity well above recommended 80/20 polarization for base building. Consider whether the athlete is ready to move to BUILD phase, or replace TEMPO with an easy aerobic session.",
  "regeneration_constraints": null,
  "validation_score": 72
}
```

---

## Implementation Notes

### Processing Sequence (Always Follow This Order)

1. **Run deterministic checks first** (Load Progression, Recovery, Monotony) — these have clear thresholds
2. **Run structural checks** (Periodization Coherence) — pattern matching on workout sequence
3. **Run interpretation checks last** (Zone Distribution) — requires reasoning about TSS distribution
4. **Apply injury override** — if `active_injury = true` AND any intense session exists → immediate CRITICAL
5. **Aggregate violations** — collect all, then apply decision logic
6. **Build regeneration constraints** — only when REJECTED; must be specific enough for LLM to retry

### Key Principles

✅ **Never reject for a single WARNING** — ADJUSTMENT_NEEDED is the appropriate response
✅ **TSB < -25 is always CRITICAL** — no exception regardless of athlete level
✅ **Be specific in suggested_fix** — "reduce by 10%" is better than "reduce load"
✅ **regeneration_constraints must be actionable** — the LLM needs concrete numbers
✅ **coach_notes explain the WHY** — coach must understand the physiological reason

### Common Pitfalls to Avoid

❌ **Don't approve plans with back-to-back INTERVAL** — always flag as CRITICAL
❌ **Don't ignore phase rules** — an INTERVAL in a RECOVERY week is always CRITICAL
❌ **Don't treat TSB as absolute** — context matters (elite vs beginner, phase, recent trend)
❌ **Don't generate vague coach_notes** — "be careful" is useless; "reduce to 57 km, no quality sessions" is actionable
❌ **Don't forget monotony** — a week of identical easy runs can have monotony > 2.0

### When to Use `regeneration_constraints`

Only populate when `decision = REJECTED`. Structure it so the plan generation LLM can:
1. Read `max_volume_km` and `max_tss` as hard limits
2. Read `forbidden_workout_types` as exclusion rules
3. Read `required_rest_days` as fixed REST placements
4. Read `phase_constraints` as the system instruction override for this regeneration attempt

---

## Scientific References

- **Training Stress Balance (TSB):** Banister et al. — Fitness-Fatigue model
- **10% Rule:** Buist et al. (2008) — Progressive running injury prevention
- **80/20 Polarization:** Seiler & Tønnessen (2009) — Optimal intensity distribution
- **Monotony Index:** Foster et al. (2001) — Training load monitoring
- **Periodization models:** Issurin (2010) — Block periodization theory

---

**This skill must be invoked for EVERY plan generated by the LLM before persistence.**

For plans where the LLM has already been corrected once (retry attempt), pass `is_retry: true` in context — the validator will apply the same rules but with awareness that the model has already received feedback.
