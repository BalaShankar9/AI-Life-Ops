"""Engine CLI: read stdin JSON, validate, score, plan, and emit stdout JSON."""

from __future__ import annotations

import json
import sys
import re
from typing import Any, Dict, List, Optional

from invariants import assert_invariants, validate_engine_input
from life_score import calculate_confidence, derive_flags, score_breakdown
from personalization import apply_focus_preference, normalize_weights, validate_weights
from planner import generate_plan
from simulator import compare_scenarios, simulate_scenario
from schedule import (
    compute_free_windows,
    derive_day_bounds,
    free_time_summary,
    infer_schedule_date,
    normalize_busy_blocks,
)

_CRISIS_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"\bsuicidal\b",
        r"\bkill myself\b",
        r"\bself[\s-]?harm\b",
    )
]


def run_engine(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Run the deterministic engine pipeline and return the output payload."""
    checkin, profile_context, schedule = validate_engine_input(payload)
    personalization = _extract_personalization(payload)
    breakdown = score_breakdown(checkin)
    life_stability_score = sum(breakdown.values())
    flags = derive_flags(checkin)
    flags["crisis_risk"] = "high" if _detect_crisis_risk(checkin.get("notes")) else "low"

    if flags["crisis_risk"] == "high":
        output = _build_crisis_output(
            checkin, profile_context, schedule, breakdown, life_stability_score, flags
        )
        assert_invariants(checkin, output)
        return output

    confidence, confidence_reasons, data_quality_warnings = calculate_confidence(checkin)
    plan = generate_plan(checkin, flags, profile_context, schedule, personalization)

    variability_notes = _merge_lists(
        plan["variability_notes"],
        confidence_reasons,
        [
            "Outputs reflect a single-day snapshot; conditions can shift quickly.",
            "Expected improvements vary with execution conditions.",
        ],
    )
    variability_notes = _merge_lists(
        variability_notes,
        ["Trend data unavailable; using single-day snapshot."],
    )

    assumptions = _merge_lists(
        plan["assumptions"],
        _base_assumptions(checkin, profile_context),
    )

    used_personalization = _build_used_personalization(personalization)
    personalization_effects = plan.get("personalization_effects", [])

    output = {
        "life_stability_score": life_stability_score,
        "breakdown": breakdown,
        "confidence": confidence,
        "confidence_reasons": confidence_reasons,
        "data_quality_warnings": data_quality_warnings,
        "flags": flags,
        "priorities": plan["priorities"],
        "avoid_today": plan["avoid_today"],
        "next_best_actions": plan["next_best_actions"],
        "reasoning": plan["reasoning"],
        "used_context": plan["used_context"],
        "assumptions": assumptions,
        "variability_notes": variability_notes,
        "safety_notice": None,
        "schedule_plan": plan["schedule_plan"],
        "schedule_conflicts": plan["schedule_conflicts"],
        "free_time_summary": plan["free_time_summary"],
        "used_personalization": used_personalization,
        "personalization_effects": personalization_effects,
    }

    assert_invariants(checkin, output)
    return output


def run_engine_mode(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Dispatch engine behavior based on mode (analyze/simulate/compare)."""
    if not isinstance(payload, dict):
        raise ValueError("Input payload must be a JSON object")

    mode_raw = payload.get("mode")
    if mode_raw is None:
        mode = "analyze"
    else:
        if not isinstance(mode_raw, str) or not mode_raw.strip():
            raise ValueError("Field mode must be a non-empty string")
        mode = mode_raw.strip().lower()

    if mode == "analyze":
        return run_engine(payload)

    if mode == "simulate":
        baseline_input = payload.get("baseline_input")
        scenario = payload.get("scenario")
        if not isinstance(baseline_input, dict):
            raise ValueError("simulate mode requires baseline_input object")
        if not isinstance(scenario, dict):
            raise ValueError("simulate mode requires scenario object")
        return simulate_scenario(baseline_input, scenario)

    if mode == "compare":
        baseline_input = payload.get("baseline_input")
        scenarios = payload.get("scenarios")
        if not isinstance(baseline_input, dict):
            raise ValueError("compare mode requires baseline_input object")
        if not isinstance(scenarios, list):
            raise ValueError("compare mode requires scenarios list")
        return compare_scenarios(baseline_input, scenarios)

    raise ValueError(f"Unsupported mode: {mode}")


def main() -> None:
    raw = sys.stdin.read()
    if not raw.strip():
        print("Input payload required on stdin", file=sys.stderr)
        sys.exit(1)

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(f"Invalid JSON: {exc}", file=sys.stderr)
        sys.exit(1)

    try:
        output = run_engine_mode(payload)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)

    sys.stdout.write(json.dumps(output))


def _merge_lists(*lists: List[str]) -> List[str]:
    seen = set()
    merged: List[str] = []
    for items in lists:
        for item in items:
            if item not in seen:
                seen.add(item)
                merged.append(item)
    return merged


def _base_assumptions(checkin: Dict[str, Any], profile_context: Dict[str, Any]) -> List[str]:
    assumptions = [
        "Inputs represent a single-day snapshot.",
        f"Profile timezone is {profile_context['timezone']}.",
        "Recommendations are best-next actions given inputs, not guarantees.",
    ]
    if checkin.get("notes"):
        assumptions.append("Notes are treated as context, not directives.")
    return assumptions


def _detect_crisis_risk(notes: Optional[str]) -> bool:
    if not notes:
        return False
    for pattern in _CRISIS_PATTERNS:
        if pattern.search(notes):
            return True
    return False


def _build_crisis_output(
    checkin: Dict[str, Any],
    profile_context: Dict[str, Any],
    schedule: Dict[str, Any],
    breakdown: Dict[str, int],
    life_stability_score: int,
    flags: Dict[str, str],
) -> Dict[str, Any]:
    safety_notice = (
        "If you are in immediate danger, call your local emergency number or contact "
        "a trusted person right now."
    )

    priority = {
        "title": "Reach immediate support",
        "category": "safety",
        "time_estimate_min": 10,
        "effort": 1,
        "impact": 5,
        "why": "A safety signal was detected in your notes, so immediate support is the priority.",
        "assumptions": ["A trusted person or local emergency number is reachable."],
        "variability": ["Support availability varies by location and time."],
    }

    output = {
        "life_stability_score": life_stability_score,
        "breakdown": breakdown,
        "confidence": 0.3,
        "confidence_reasons": [
            "High-risk language detected in notes; safety path activated."
        ],
        "data_quality_warnings": [],
        "flags": flags,
        "priorities": [priority],
        "avoid_today": [],
        "next_best_actions": [],
        "reasoning": (
            "Plan paused due to a safety signal in the notes. "
            "Best next action is reaching immediate support given the inputs. "
            "Expected outcomes vary based on response time and available help."
        ),
        "used_context": ["notes"],
        "assumptions": _merge_lists(
            _base_assumptions(checkin, profile_context),
            ["Safety path triggered due to high-risk language in notes."],
        ),
        "variability_notes": [
            "Support options vary by location and availability.",
            "If immediate support is not available, reach out to a trusted person.",
        ],
        "safety_notice": safety_notice,
        "schedule_plan": [],
        "schedule_conflicts": [],
        "free_time_summary": _build_free_time_summary(schedule, profile_context),
    }
    return output


def _build_free_time_summary(schedule: Dict[str, Any], profile_context: Dict[str, Any]) -> Dict[str, int]:
    timezone = schedule["timezone"]
    busy_blocks = schedule.get("busy_blocks", [])
    schedule_date = infer_schedule_date(busy_blocks, timezone)
    day_bounds = derive_day_bounds(profile_context, timezone, schedule_date)
    merged_busy = normalize_busy_blocks(busy_blocks, timezone)
    free_windows = compute_free_windows(day_bounds, merged_busy)
    return free_time_summary(free_windows)


def _extract_personalization(payload: Dict[str, Any]) -> Dict[str, Any]:
    \"\"\"Extract and validate personalization from payload, returning defaults if missing.\"\"\"
    personalization = payload.get(\"personalization\", {})
    
    default_weights = {\"energy\": 0.2, \"money\": 0.2, \"obligations\": 0.2, \"growth\": 0.2, \"stability\": 0.2}
    weights = personalization.get(\"weights\", default_weights)
    
    if not validate_weights(weights):
        weights = normalize_weights(weights)
    
    return {
        \"weights\": weights,
        \"risk_aversion\": personalization.get(\"risk_aversion\", 0.6),
        \"focus_preference\": personalization.get(\"focus_preference\", \"mixed\"),
    }


def _build_used_personalization(personalization: Dict[str, Any]) -> List[str]:
    \"\"\"Build list of personalization settings used.\"\"\"
    used = []
    
    weights = personalization[\"weights\"]
    top_weight = max(weights, key=weights.get)
    used.append(f\"Weights: {top_weight} emphasized ({weights[top_weight]:.2f})\")
    
    risk_aversion = personalization[\"risk_aversion\"]
    if risk_aversion < 0.4:
        used.append(f\"Risk tolerance: high ({risk_aversion:.1f})\")
    elif risk_aversion > 0.7:
        used.append(f\"Risk aversion: high ({risk_aversion:.1f})\")
    else:
        used.append(f\"Risk aversion: moderate ({risk_aversion:.1f})\")
    
    focus_pref = personalization[\"focus_preference\"]
    if focus_pref != \"mixed\":
        used.append(f\"Focus preference: {focus_pref}\")
    
    return used


if __name__ == \"__main__\":
    main()


if __name__ == "__main__":
    main()
