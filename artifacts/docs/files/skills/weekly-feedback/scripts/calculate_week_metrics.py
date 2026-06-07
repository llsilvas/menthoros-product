"""
calculate_week_metrics.py
Weekly Feedback — Objective Metrics Calculator

Computes the week_score and derived metrics used by the weekly-feedback skill.
Called before LLM generation to provide objective data points.

week_score formula (0-100):
  adherence_score     = adherence_rate * 40         (max 40pts)
  volume_score        = volume_completion_rate * 20  (max 20pts, capped at 1.0)
  execution_score     = avg_execution_score/10 * 25  (max 25pts, if available)
  load_mgmt_score     = tsb_delta_score * 15         (max 15pts)

  If execution data unavailable: redistribute 25pts to adherence (60pts) and volume (25pts).

Usage:
    python calculate_week_metrics.py --input week.json
    python calculate_week_metrics.py --help
"""

import json
import math
import argparse
import sys
from dataclasses import dataclass, asdict
from typing import Optional


@dataclass
class WeekMetrics:
    # Core rates
    adherence_rate: float           # 0.0 – 1.0
    volume_completion_rate: float   # 0.0 – 1.0 (capped at 1.0 for scoring)
    tss_completion_rate: float      # 0.0 – 1.0

    # Execution quality (from workout-analyzer, optional)
    avg_execution_score: Optional[float]   # 1-10
    quality_sessions_completed: int        # INTERVAL + TEMPO + LONG_RUN done
    quality_sessions_planned: int
    has_execution_data: bool

    # Load management
    tsb_delta: float               # tsb_end - tsb_start
    tsb_end: float
    overreaching_flag: bool        # tsb_end < -25

    # Fatigue signals
    accumulated_fatigue_sessions: int   # sessions with primary_cause = ACCUMULATED_FATIGUE
    missed_quality_sessions: int        # quality session types that were missed

    # Streak
    consecutive_weeks_training: int

    # Score components
    adherence_component: float
    volume_component: float
    execution_component: float
    load_mgmt_component: float
    week_score: int                # 0-100 composite


QUALITY_TYPES = {"INTERVAL", "TEMPO", "LONG_RUN"}


def calculate_week_metrics(
    week_summary: dict,
    completed_workouts: list,
    missed_workouts: list,
    athlete_context: dict,
) -> WeekMetrics:

    planned_count = week_summary.get("planned_workouts_count", 0)
    completed_count = week_summary.get("completed_workouts_count", 0)
    planned_volume = week_summary.get("planned_volume_km", 0)
    actual_volume = week_summary.get("actual_volume_km", 0)
    planned_tss = week_summary.get("planned_tss", 0)
    actual_tss = week_summary.get("actual_tss", 0)

    tsb_start = athlete_context.get("tsb_start_of_week", 0)
    tsb_end = athlete_context.get("tsb_end_of_week", 0)
    consecutive_weeks = athlete_context.get("consecutive_weeks_training", 1)

    # --- Core rates ---
    adherence_rate = (completed_count / planned_count) if planned_count > 0 else 0.0
    volume_rate = min(1.0, (actual_volume / planned_volume)) if planned_volume > 0 else 0.0
    tss_rate = min(1.0, (actual_tss / planned_tss)) if planned_tss > 0 else 0.0

    # --- Execution quality ---
    scores = [
        w.get("execution_score")
        for w in completed_workouts
        if w.get("execution_score") is not None
    ]
    has_execution_data = len(scores) > 0
    avg_exec = (sum(scores) / len(scores)) if scores else None

    accumulated_fatigue_sessions = sum(
        1 for w in completed_workouts
        if w.get("primary_cause") == "ACCUMULATED_FATIGUE"
    )

    # Quality sessions
    quality_planned = sum(
        1 for w in missed_workouts + completed_workouts
        if w.get("workout_type") in QUALITY_TYPES
    )
    # Completed quality sessions
    quality_completed = sum(
        1 for w in completed_workouts
        if w.get("workout_type") in QUALITY_TYPES
    )
    missed_quality = quality_planned - quality_completed

    # --- Load management ---
    tsb_delta = tsb_end - tsb_start
    overreaching = tsb_end < -25

    # --- Score calculation ---
    if has_execution_data:
        # With execution data: adherence 40, volume 20, execution 25, load 15
        adherence_component = adherence_rate * 40
        volume_component = volume_rate * 20
        execution_component = (avg_exec / 10.0) * 25
        load_mgmt_component = _load_mgmt_score(tsb_delta, tsb_end) * 15
    else:
        # Without execution data: adherence 60, volume 25, load 15
        adherence_component = adherence_rate * 60
        volume_component = volume_rate * 25
        execution_component = 0.0
        load_mgmt_component = _load_mgmt_score(tsb_delta, tsb_end) * 15

    # Penalties
    penalty = 0
    if accumulated_fatigue_sessions >= 2:
        penalty += 10
    if overreaching:
        penalty += 15
    if missed_quality > 0:
        penalty += missed_quality * 5   # -5 pts per missed quality session

    raw_score = (
        adherence_component
        + volume_component
        + execution_component
        + load_mgmt_component
        - penalty
    )
    week_score = max(0, min(100, round(raw_score)))

    return WeekMetrics(
        adherence_rate=round(adherence_rate, 3),
        volume_completion_rate=round(volume_rate, 3),
        tss_completion_rate=round(tss_rate, 3),
        avg_execution_score=round(avg_exec, 2) if avg_exec is not None else None,
        quality_sessions_completed=quality_completed,
        quality_sessions_planned=quality_planned,
        has_execution_data=has_execution_data,
        tsb_delta=round(tsb_delta, 1),
        tsb_end=tsb_end,
        overreaching_flag=overreaching,
        accumulated_fatigue_sessions=accumulated_fatigue_sessions,
        missed_quality_sessions=missed_quality,
        consecutive_weeks_training=consecutive_weeks,
        adherence_component=round(adherence_component, 2),
        volume_component=round(volume_component, 2),
        execution_component=round(execution_component, 2),
        load_mgmt_component=round(load_mgmt_component, 2),
        week_score=week_score,
    )


def _load_mgmt_score(tsb_delta: float, tsb_end: float) -> float:
    """
    Returns 0.0 – 1.0 representing how well load was managed.

    Best case: TSB stable or improving (delta >= 0) AND tsb_end in good range.
    Worst case: TSB deep negative AND still dropping.
    """
    # Base score from TSB end value
    if tsb_end > 0:
        base = 1.0
    elif tsb_end >= -10:
        base = 0.85
    elif tsb_end >= -15:
        base = 0.65
    elif tsb_end >= -20:
        base = 0.45
    elif tsb_end >= -25:
        base = 0.25
    else:
        base = 0.05

    # Adjustment from delta direction
    if tsb_delta > 5:
        adjustment = 0.10    # recovering
    elif tsb_delta > 0:
        adjustment = 0.05    # slight recovery
    elif tsb_delta >= -5:
        adjustment = 0.0     # neutral
    elif tsb_delta >= -10:
        adjustment = -0.10   # adding fatigue
    else:
        adjustment = -0.20   # significant fatigue accumulation

    return max(0.0, min(1.0, base + adjustment))


def main():
    parser = argparse.ArgumentParser(
        description="Calculate objective metrics for weekly feedback generation."
    )
    parser.add_argument(
        "--input", required=True,
        help="Path to JSON file with week_summary, completed_workouts, missed_workouts, athlete_context"
    )
    args = parser.parse_args()

    try:
        with open(args.input, "r") as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"ERROR: File not found: {args.input}", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"ERROR: Invalid JSON: {e}", file=sys.stderr)
        sys.exit(1)

    metrics = calculate_week_metrics(
        week_summary=data.get("week_summary", {}),
        completed_workouts=data.get("completed_workouts", []),
        missed_workouts=data.get("missed_workouts", []),
        athlete_context=data.get("athlete_context", {}),
    )

    print(json.dumps(asdict(metrics), indent=2))


if __name__ == "__main__":
    main()
