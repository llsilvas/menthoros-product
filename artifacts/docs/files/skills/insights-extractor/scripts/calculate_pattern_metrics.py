"""
calculate_pattern_metrics.py
Insights Extractor — Pattern Confidence Calculator

Computes recency-weighted confidence scores for each existing pattern,
determines evidence windows per category, and calculates profile maturity delta.

Confidence formula:
  base_score      = min(occurrences, 8) / 8 * 60   (max 60pts)
  recency_bonus   = recency_weight * 25             (max 25pts)
  consistency_bonus = consistency_rate * 15         (max 15pts)
  confidence = base_score + recency_bonus + consistency_bonus

Status transitions:
  EMERGING → CONFIRMED: confidence >= 60 AND occurrences >= 3
  CONFIRMED → INVALIDATED: 3+ consecutive weeks without supporting evidence

Usage:
    python calculate_pattern_metrics.py --input profile.json
    python calculate_pattern_metrics.py --help
"""

import json
import argparse
import sys
from dataclasses import dataclass, field, asdict
from typing import Optional


# Recency weights by weeks ago (index 0 = current week, 1 = 1 week ago, etc.)
RECENCY_WEIGHTS = [1.0, 0.85, 0.70, 0.55, 0.40, 0.30, 0.20, 0.15]

# Confidence thresholds
CONFIRMED_CONFIDENCE_THRESHOLD = 60
CONFIRMED_OCCURRENCES_THRESHOLD = 3
INVALIDATION_CONSECUTIVE_MISSES = 3

# Maturity score formula
MATURITY_PER_CONFIRMED_PATTERN = 10
MATURITY_PER_WEEK_TRACKED = 2
MATURITY_MAX = 100


@dataclass
class PatternScore:
    pattern_id: str
    category: str
    current_confidence: int
    updated_confidence: int
    confidence_delta: int
    current_status: str
    projected_status: str       # what status would be after this week
    occurrences: int
    weeks_since_last_seen: int
    consecutive_misses: int     # weeks without supporting evidence
    should_transition: bool     # status will change this week
    evidence_this_week: bool    # did current week support this pattern?


@dataclass
class CategoryWindow:
    category: str
    supporting_weeks: list      # week numbers with supporting evidence
    contradicting_weeks: list   # week numbers with counter-evidence
    neutral_weeks: list         # weeks where pattern context didn't apply
    support_rate: float         # supporting / (supporting + contradicting)


@dataclass
class PatternMetricsResult:
    pattern_scores: list[PatternScore]
    category_windows: list[CategoryWindow]
    profile_maturity_current: int
    profile_maturity_projected: int
    maturity_delta: int
    confirmed_pattern_count: int
    emerging_pattern_count: int
    weeks_tracked: int


def calculate_confidence(
    occurrences: int,
    evidence_weeks: list,
    current_week_number: int,
    all_week_numbers: list,
) -> int:
    """Compute confidence score 0-100 for a pattern."""

    # Base score from frequency
    base_score = min(occurrences, 8) / 8 * 60

    # Recency bonus — weight evidence by how recent it is
    recency_score = 0.0
    for week_num in evidence_weeks:
        weeks_ago = current_week_number - week_num
        weight_index = min(weeks_ago, len(RECENCY_WEIGHTS) - 1)
        recency_score += RECENCY_WEIGHTS[weight_index]

    # Normalize recency score to 0-25
    max_possible_recency = sum(RECENCY_WEIGHTS[:min(occurrences, len(RECENCY_WEIGHTS))])
    recency_bonus = (recency_score / max_possible_recency * 25) if max_possible_recency > 0 else 0

    # Consistency bonus — penalize gaps in the pattern
    if len(evidence_weeks) >= 2:
        sorted_weeks = sorted(evidence_weeks)
        gaps = [sorted_weeks[i+1] - sorted_weeks[i] for i in range(len(sorted_weeks)-1)]
        max_gap = max(gaps) if gaps else 0
        # Perfect consistency (gap=1) = full 15pts; gap of 4+ weeks = 0pts
        consistency_rate = max(0.0, 1.0 - (max_gap - 1) / 4)
        consistency_bonus = consistency_rate * 15
    else:
        consistency_bonus = 0.0

    total = base_score + recency_bonus + consistency_bonus
    return max(0, min(100, round(total)))


def determine_projected_status(
    current_status: str,
    updated_confidence: int,
    occurrences: int,
    consecutive_misses: int,
    evidence_this_week: bool,
) -> tuple[str, bool]:
    """
    Returns (projected_status, should_transition).
    """
    if current_status == "INVALIDATED":
        return "INVALIDATED", False

    if current_status == "EMERGING":
        if (updated_confidence >= CONFIRMED_CONFIDENCE_THRESHOLD
                and occurrences >= CONFIRMED_OCCURRENCES_THRESHOLD):
            return "CONFIRMED", True
        if consecutive_misses >= INVALIDATION_CONSECUTIVE_MISSES:
            return "INVALIDATED", True
        return "EMERGING", False

    if current_status == "CONFIRMED":
        if consecutive_misses >= INVALIDATION_CONSECUTIVE_MISSES:
            return "INVALIDATED", True
        return "CONFIRMED", False

    return current_status, False


def calculate_maturity(
    confirmed_count: int,
    weeks_tracked: int,
) -> int:
    score = (confirmed_count * MATURITY_PER_CONFIRMED_PATTERN
             + weeks_tracked * MATURITY_PER_WEEK_TRACKED)
    return min(MATURITY_MAX, score)


def calculate_pattern_metrics(
    current_profile: dict,
    recent_history: dict,
    current_week: dict,
) -> PatternMetricsResult:

    existing_patterns = current_profile.get("existing_patterns", [])
    total_weeks = current_profile.get("total_weeks_tracked", 0) + 1  # including current
    current_week_number = current_week.get("week_number", total_weeks)
    current_maturity = current_profile.get("profile_maturity_score", 0)

    weekly_summaries = recent_history.get("weekly_summaries", [])
    workout_signals = recent_history.get("workout_signals", [])
    all_week_numbers = [w.get("week_number") for w in weekly_summaries] + [current_week_number]

    # Build simple evidence maps from history
    # In a real system, this would be richer — here we use grade as a proxy
    grade_by_week = {w["week_number"]: w["grade"] for w in weekly_summaries}
    grade_by_week[current_week_number] = current_week.get("grade", "SOLID")

    fatigue_weeks = {
        w["week_number"] for w in weekly_summaries
        if w.get("accumulated_fatigue_sessions", 0) > 0
    }
    if current_week.get("accumulated_fatigue_sessions", 0) > 0:
        fatigue_weeks.add(current_week_number)

    pattern_scores = []
    confirmed_count = 0
    emerging_count = 0

    for pattern in existing_patterns:
        if pattern.get("status") == "INVALIDATED":
            continue

        pattern_id = pattern.get("pattern_id", "")
        category = pattern.get("category", "")
        current_confidence = pattern.get("confidence", 0)
        current_status = pattern.get("status", "EMERGING")
        occurrences = pattern.get("occurrences", 0)
        last_observed_week = pattern.get("last_observed_week", 0)

        weeks_since_last = current_week_number - last_observed_week

        # Heuristic: determine evidence this week based on category and available signals
        evidence_this_week = _infer_evidence(
            category=category,
            current_week=current_week,
            fatigue_weeks=fatigue_weeks,
            grade_by_week=grade_by_week,
        )

        # Update occurrence and consecutive miss tracking
        if evidence_this_week:
            new_occurrences = occurrences + 1
            consecutive_misses = 0
            evidence_weeks = list(range(
                max(1, last_observed_week - occurrences + 1),
                last_observed_week + 1
            )) + [current_week_number]
        else:
            new_occurrences = occurrences
            # Count consecutive weeks without evidence (simplified)
            consecutive_misses = max(0, weeks_since_last - 1)
            evidence_weeks = list(range(
                max(1, last_observed_week - occurrences + 1),
                last_observed_week + 1
            ))

        updated_confidence = calculate_confidence(
            occurrences=new_occurrences,
            evidence_weeks=evidence_weeks,
            current_week_number=current_week_number,
            all_week_numbers=all_week_numbers,
        )

        projected_status, should_transition = determine_projected_status(
            current_status=current_status,
            updated_confidence=updated_confidence,
            occurrences=new_occurrences,
            consecutive_misses=consecutive_misses,
            evidence_this_week=evidence_this_week,
        )

        confidence_delta = updated_confidence - current_confidence

        score = PatternScore(
            pattern_id=pattern_id,
            category=category,
            current_confidence=current_confidence,
            updated_confidence=updated_confidence,
            confidence_delta=confidence_delta,
            current_status=current_status,
            projected_status=projected_status,
            occurrences=new_occurrences,
            weeks_since_last_seen=weeks_since_last,
            consecutive_misses=consecutive_misses,
            should_transition=should_transition,
            evidence_this_week=evidence_this_week,
        )
        pattern_scores.append(score)

        if projected_status == "CONFIRMED":
            confirmed_count += 1
        elif projected_status == "EMERGING":
            emerging_count += 1

    # Build category windows
    category_windows = _build_category_windows(
        patterns=existing_patterns,
        grade_by_week=grade_by_week,
        fatigue_weeks=fatigue_weeks,
        current_week_number=current_week_number,
        weekly_summaries=weekly_summaries,
    )

    projected_maturity = calculate_maturity(confirmed_count, total_weeks)
    maturity_delta = projected_maturity - current_maturity

    return PatternMetricsResult(
        pattern_scores=pattern_scores,
        category_windows=category_windows,
        profile_maturity_current=current_maturity,
        profile_maturity_projected=projected_maturity,
        maturity_delta=maturity_delta,
        confirmed_pattern_count=confirmed_count,
        emerging_pattern_count=emerging_count,
        weeks_tracked=total_weeks,
    )


def _infer_evidence(
    category: str,
    current_week: dict,
    fatigue_weeks: set,
    grade_by_week: dict,
) -> bool:
    """
    Heuristic: infer whether current week provides supporting evidence
    for a pattern category. In a real system, the LLM does this with
    richer context. Here we use available signals as proxies.
    """
    current_week_num = current_week.get("week_number")
    grade = current_week.get("grade", "SOLID")
    adherence = current_week.get("adherence_rate", 1.0)
    missed_quality = current_week.get("missed_quality_sessions", 0)
    accumulated_fatigue = current_week.get("accumulated_fatigue_sessions", 0)

    if category == "recovery_pattern":
        # Evidence if accumulated fatigue sessions occurred
        return accumulated_fatigue > 0

    elif category == "fatigue_indicator":
        # Evidence if grade dropped despite normal circumstances
        return grade in ("CHALLENGING", "DIFFICULT") and accumulated_fatigue > 0

    elif category == "load_tolerance":
        # Evidence if performance was consistent (grade GOOD+)
        return grade in ("EXCEPTIONAL", "GOOD") and adherence >= 0.8

    elif category == "goal_alignment":
        # Evidence if adherence was high
        return adherence >= 0.9

    elif category == "pacing_behavior":
        # Neutral heuristic — LLM needs richer data
        return False

    elif category == "performance_response":
        # Evidence if execution was notably good or bad
        return grade in ("EXCEPTIONAL", "DIFFICULT")

    elif category == "contextual_factor":
        # Neutral — requires specific context data
        return False

    return False


def _build_category_windows(
    patterns: list,
    grade_by_week: dict,
    fatigue_weeks: set,
    current_week_number: int,
    weekly_summaries: list,
) -> list[CategoryWindow]:
    categories = [
        "recovery_pattern",
        "performance_response",
        "fatigue_indicator",
        "pacing_behavior",
        "load_tolerance",
        "contextual_factor",
        "goal_alignment",
    ]

    windows = []
    all_weeks = sorted(grade_by_week.keys())

    for cat in categories:
        supporting = []
        contradicting = []
        neutral = []

        for week in all_weeks:
            grade = grade_by_week.get(week, "SOLID")
            has_fatigue = week in fatigue_weeks

            # Simple heuristic classification per category
            if cat == "recovery_pattern":
                if has_fatigue:
                    supporting.append(week)
                elif grade in ("EXCEPTIONAL", "GOOD"):
                    contradicting.append(week)
                else:
                    neutral.append(week)

            elif cat == "load_tolerance":
                if grade in ("EXCEPTIONAL", "GOOD"):
                    supporting.append(week)
                elif grade in ("CHALLENGING", "DIFFICULT"):
                    contradicting.append(week)
                else:
                    neutral.append(week)

            elif cat == "goal_alignment":
                if grade in ("EXCEPTIONAL", "GOOD"):
                    supporting.append(week)
                else:
                    neutral.append(week)

            else:
                neutral.append(week)

        total_decisive = len(supporting) + len(contradicting)
        support_rate = (len(supporting) / total_decisive) if total_decisive > 0 else 0.5

        windows.append(CategoryWindow(
            category=cat,
            supporting_weeks=supporting,
            contradicting_weeks=contradicting,
            neutral_weeks=neutral,
            support_rate=round(support_rate, 3),
        ))

    return windows


def main():
    parser = argparse.ArgumentParser(
        description="Calculate pattern confidence metrics for insights extraction."
    )
    parser.add_argument(
        "--input", required=True,
        help="Path to JSON with current_profile, recent_history, current_week"
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

    result = calculate_pattern_metrics(
        current_profile=data.get("current_profile", {}),
        recent_history=data.get("recent_history", {}),
        current_week=data.get("current_week", {}),
    )

    print(json.dumps(asdict(result), indent=2))


if __name__ == "__main__":
    main()
