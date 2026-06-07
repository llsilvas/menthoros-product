"""
calculate_plan_metrics.py
Weekly Plan Validator — Objective Metrics Calculator

Computes deterministic metrics for the weekly plan validator skill.
Called before LLM interpretation to provide objective data points.

Usage:
    python calculate_plan_metrics.py --input plan.json
    python calculate_plan_metrics.py --help
"""

import json
import math
import argparse
import sys
from dataclasses import dataclass, asdict
from typing import Optional


@dataclass
class PlanMetrics:
    # Load Progression
    total_volume_km: float
    total_tss_estimated: float
    volume_increase_percent: float
    tss_increase_percent: float
    exceeds_absolute_volume_cap: bool

    # Recovery
    max_consecutive_load_days: int
    has_rest_day: bool
    back_to_back_intervals: bool
    days_since_last_interval: Optional[int]

    # Monotony
    monotony_index: float
    avg_daily_tss: float
    std_daily_tss: float

    # Zone Distribution
    easy_recovery_tss_percent: float
    moderate_tss_percent: float
    hard_tss_percent: float

    # Structural
    interval_count: int
    long_run_count: int
    tempo_count: int
    rest_day_count: int

    # Derived flags
    injury_with_intense_sessions: bool


# Workout type to zone mapping
WORKOUT_ZONE = {
    "REST":     "easy",
    "RECOVERY": "easy",
    "EASY":     "easy",
    "LONG_RUN": "easy",     # defaults to Z2 unless flagged otherwise
    "TEMPO":    "moderate",
    "INTERVAL": "hard",
}

# Workout types considered "intense" (blocked during injury)
INTENSE_TYPES = {"INTERVAL", "TEMPO", "LONG_RUN"}

# Absolute weekly volume caps by athlete level (km)
VOLUME_CAPS = {
    "BEGINNER":     30,
    "INTERMEDIATE": 60,
    "ADVANCED":     120,
    "ELITE":        200,
}

DAYS_ORDER = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]


def calculate_metrics(
    proposed_plan: dict,
    athlete_context: dict,
    historical_context: dict,
) -> PlanMetrics:
    workouts = proposed_plan.get("workouts", [])
    athlete_level = athlete_context.get("athlete_level", "INTERMEDIATE")
    active_injury = athlete_context.get("active_injury", False)

    avg_volume_4w = historical_context.get("avg_volume_last_4_weeks_km", 0)
    avg_tss_4w = historical_context.get("avg_tss_last_4_weeks", 0)
    last_interval_days = historical_context.get("last_interval_session_days_ago", 999)

    total_volume = proposed_plan.get("total_volume_km", 0)
    total_tss = proposed_plan.get("total_tss_estimated", 0)

    # --- Load Progression ---
    volume_increase_pct = (
        ((total_volume - avg_volume_4w) / avg_volume_4w * 100)
        if avg_volume_4w > 0 else 0.0
    )
    tss_increase_pct = (
        ((total_tss - avg_tss_4w) / avg_tss_4w * 100)
        if avg_tss_4w > 0 else 0.0
    )
    volume_cap = VOLUME_CAPS.get(athlete_level, 60)
    exceeds_cap = total_volume > volume_cap

    # --- Workout counts and TSS by zone ---
    interval_count = 0
    long_run_count = 0
    tempo_count = 0
    rest_day_count = 0
    easy_tss = 0.0
    moderate_tss = 0.0
    hard_tss = 0.0
    has_intense_with_injury = False

    for w in workouts:
        wtype = w.get("type", "EASY")
        tss = w.get("tss_estimated", 0)
        zone = WORKOUT_ZONE.get(wtype, "easy")

        if wtype == "INTERVAL":
            interval_count += 1
        if wtype == "LONG_RUN":
            long_run_count += 1
        if wtype == "TEMPO":
            tempo_count += 1
        if wtype == "REST":
            rest_day_count += 1

        if zone == "easy":
            easy_tss += tss
        elif zone == "moderate":
            moderate_tss += tss
        elif zone == "hard":
            hard_tss += tss

        if active_injury and wtype in INTENSE_TYPES:
            has_intense_with_injury = True

    total_zone_tss = easy_tss + moderate_tss + hard_tss
    easy_pct = (easy_tss / total_zone_tss * 100) if total_zone_tss > 0 else 0
    moderate_pct = (moderate_tss / total_zone_tss * 100) if total_zone_tss > 0 else 0
    hard_pct = (hard_tss / total_zone_tss * 100) if total_zone_tss > 0 else 0

    # --- Consecutive load days ---
    tss_by_day = {day: 0.0 for day in DAYS_ORDER}
    type_by_day = {day: "REST" for day in DAYS_ORDER}

    for w in workouts:
        day = w.get("day_of_week")
        if day in tss_by_day:
            tss_by_day[day] += w.get("tss_estimated", 0)
            if w.get("type") != "REST":
                type_by_day[day] = w.get("type", "EASY")

    max_consecutive = _max_consecutive_load_days(tss_by_day)
    has_rest = rest_day_count > 0

    # --- Back-to-back intervals ---
    back_to_back = _has_back_to_back_intervals(type_by_day)

    # --- Monotony Index ---
    daily_tss_values = [tss_by_day[day] for day in DAYS_ORDER]
    avg_daily = sum(daily_tss_values) / 7
    variance = sum((x - avg_daily) ** 2 for x in daily_tss_values) / 7
    std_daily = math.sqrt(variance)
    monotony = (avg_daily / std_daily) if std_daily > 0 else 0.0

    return PlanMetrics(
        total_volume_km=round(total_volume, 2),
        total_tss_estimated=round(total_tss, 1),
        volume_increase_percent=round(volume_increase_pct, 1),
        tss_increase_percent=round(tss_increase_pct, 1),
        exceeds_absolute_volume_cap=exceeds_cap,
        max_consecutive_load_days=max_consecutive,
        has_rest_day=has_rest,
        back_to_back_intervals=back_to_back,
        days_since_last_interval=last_interval_days,
        monotony_index=round(monotony, 2),
        avg_daily_tss=round(avg_daily, 1),
        std_daily_tss=round(std_daily, 1),
        easy_recovery_tss_percent=round(easy_pct, 1),
        moderate_tss_percent=round(moderate_pct, 1),
        hard_tss_percent=round(hard_pct, 1),
        interval_count=interval_count,
        long_run_count=long_run_count,
        tempo_count=tempo_count,
        rest_day_count=rest_day_count,
        injury_with_intense_sessions=has_intense_with_injury,
    )


def _max_consecutive_load_days(tss_by_day: dict) -> int:
    max_streak = 0
    current_streak = 0
    for day in DAYS_ORDER:
        if tss_by_day[day] > 0:
            current_streak += 1
            max_streak = max(max_streak, current_streak)
        else:
            current_streak = 0
    return max_streak


def _has_back_to_back_intervals(type_by_day: dict) -> bool:
    prev_was_interval = False
    for day in DAYS_ORDER:
        current_is_interval = type_by_day[day] == "INTERVAL"
        if prev_was_interval and current_is_interval:
            return True
        prev_was_interval = current_is_interval
    return False


def main():
    parser = argparse.ArgumentParser(
        description="Calculate objective metrics for weekly plan validation."
    )
    parser.add_argument(
        "--input", required=True,
        help="Path to JSON file with proposed_plan, athlete_context, historical_context"
    )
    args = parser.parse_args()

    try:
        with open(args.input, "r") as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"ERROR: Input file not found: {args.input}", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"ERROR: Invalid JSON: {e}", file=sys.stderr)
        sys.exit(1)

    metrics = calculate_metrics(
        proposed_plan=data.get("proposed_plan", {}),
        athlete_context=data.get("athlete_context", {}),
        historical_context=data.get("historical_context", {}),
    )

    print(json.dumps(asdict(metrics), indent=2))


if __name__ == "__main__":
    main()
