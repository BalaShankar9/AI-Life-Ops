"""Deterministic scenario simulation engine."""

from __future__ import annotations

from copy import deepcopy
from datetime import timedelta
from typing import Any, Dict, List, Tuple

from invariants import validate_engine_input
from life_score import calculate_confidence, derive_flags, score_breakdown
from planner import generate_plan
from schedule import compute_free_windows, derive_day_bounds, infer_schedule_date, normalize_busy_blocks
from scenarios import normalize_scenario

RISK_SCORE = {"low": 0, "medium": 1, "high": 2}


def simulate_scenario(baseline_input: Dict[str, Any], scenario: Dict[str, Any]) -> Dict[str, Any]:
    """Simulate a single scenario against a baseline input and return a result payload."""
    checkin, profile_context, schedule = validate_engine_input(baseline_input)

    baseline_breakdown = score_breakdown(checkin)
    baseline_score = sum(baseline_breakdown.values())
    baseline_flags = derive_flags(checkin)
    baseline_confidence, baseline_confidence_reasons, _ = calculate_confidence(checkin)

    normalized_scenario, scenario_assumptions, scenario_sensitivity, missing_count = normalize_scenario(
        scenario
    )

    simulated_checkin = deepcopy(checkin)
    simulated_schedule = deepcopy(schedule)

    scenario_effects = _apply_scenario(
        simulated_checkin, profile_context, simulated_schedule, normalized_scenario
    )

    new_breakdown = score_breakdown(simulated_checkin)
    new_score = sum(new_breakdown.values())
    new_flags = derive_flags(simulated_checkin)

    delta_breakdown = {
        key: new_breakdown[key] - baseline_breakdown[key]
        for key in baseline_breakdown
    }

    risk_changes = _build_risk_changes(
        baseline_flags, new_flags, normalized_scenario["type"]
    )

    confidence, confidence_reasons = _compute_confidence(
        baseline_confidence, baseline_confidence_reasons, missing_count
    )

    plan = generate_plan(simulated_checkin, new_flags, profile_context, simulated_schedule)

    mitigation_plan = {
        "priorities": plan["priorities"][:3],
        "avoid_today": plan["avoid_today"],
        "next_best_actions": plan["next_best_actions"],
    }

    assumptions = _dedupe(
        scenario_assumptions
        + scenario_effects["assumptions"]
        + [
            "Simulation reuses baseline profile context and schedule window.",
            "Mitigation plan reflects simulated inputs, not guarantees.",
        ]
    )

    sensitivity = scenario_sensitivity + scenario_effects["sensitivity"]

    explanation = _build_explanation(
        normalized_scenario,
        new_score - baseline_score,
        delta_breakdown,
        risk_changes,
        scenario_effects,
        confidence_reasons,
    )

    return {
        "scenario_id": normalized_scenario["id"],
        "scenario_type": normalized_scenario["type"],
        "delta": {
            "life_stability_score": new_score - baseline_score,
            "breakdown": delta_breakdown,
        },
        "new_estimate": {
            "life_stability_score": new_score,
            "breakdown": new_breakdown,
            "flags": new_flags,
        },
        "risk_changes": risk_changes,
        "constraints_impact": {
            "free_time_delta_min": scenario_effects["free_time_delta_min"],
            "largest_window_delta_min": scenario_effects["largest_window_delta_min"],
            "sleep_delta_hours": scenario_effects["sleep_delta_hours"],
            "stress_pressure_delta": scenario_effects["stress_pressure_delta"],
        },
        "mitigation_plan": mitigation_plan,
        "assumptions": assumptions,
        "sensitivity": sensitivity,
        "confidence": confidence,
        "explanation": explanation,
    }


def compare_scenarios(
    baseline_input: Dict[str, Any], scenarios: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """Compare multiple scenarios and return a ranked comparison payload."""
    checkin, _profile_context, _schedule = validate_engine_input(baseline_input)
    baseline_breakdown = score_breakdown(checkin)
    baseline_score = sum(baseline_breakdown.values())
    baseline_flags = derive_flags(checkin)

    results = [simulate_scenario(baseline_input, scenario) for scenario in scenarios]
    ranked = []
    for result in results:
        net_benefit = _net_benefit_score(result, baseline_flags)
        ranked.append(
            {
                "scenario_id": result["scenario_id"],
                "net_benefit_score": net_benefit,
                "summary": _summary_line(result),
                "key_tradeoffs": _tradeoffs(result),
                "top_risks": _top_risks(result["new_estimate"]["flags"]),
            }
        )

    ranked.sort(
        key=lambda item: (
            -item["net_benefit_score"],
            -results[_scenario_index(results, item["scenario_id"])]["delta"]["life_stability_score"],
            item["scenario_id"],
        )
    )

    for index, item in enumerate(ranked, start=1):
        item["overall_rank"] = index

    best_scenario_id = ranked[0]["scenario_id"] if ranked else None
    best_result = next((item for item in results if item["scenario_id"] == best_scenario_id), None)

    recommendation = {
        "best_scenario_id": best_scenario_id,
        "why_best": _why_best(best_result) if best_result else [],
        "who_should_not_choose_this": _who_should_not_choose(best_result) if best_result else [],
    }

    return {
        "baseline": {
            "score": baseline_score,
            "breakdown": baseline_breakdown,
            "flags": baseline_flags,
        },
        "ranked": ranked,
        "recommendation": recommendation,
    }


def _apply_scenario(
    checkin: Dict[str, Any],
    profile_context: Dict[str, Any],
    schedule: Dict[str, Any],
    scenario: Dict[str, Any],
) -> Dict[str, Any]:
    """Apply scenario deltas to the checkin/schedule in-place and return impact metadata."""
    scenario_type = scenario["type"]
    params = scenario["params"]
    assumptions: List[str] = []
    sensitivity: List[Dict[str, str]] = []
    free_time_delta_min = 0
    largest_window_delta_min = 0
    base_sleep = float(checkin["sleep_hours"])
    base_stress = float(checkin["stress_level"])

    if scenario_type in ("add_job", "drop_job"):
        direction = 1 if scenario_type == "add_job" else -1
        job_effects = _apply_job_change(checkin, params, direction)
        free_time_delta_min = job_effects["free_time_delta_min"]
        largest_window_delta_min = job_effects["largest_window_delta_min"]
        assumptions.extend(job_effects["assumptions"])
    elif scenario_type in ("increase_expense", "reduce_expense"):
        direction = 1 if scenario_type == "increase_expense" else -1
        _apply_expense_change(checkin, params, direction)
    elif scenario_type in ("add_recurring_obligation", "remove_recurring_obligation"):
        direction = 1 if scenario_type == "add_recurring_obligation" else -1
        obligations_effects = _apply_obligation_change(checkin, params, direction)
        free_time_delta_min = obligations_effects["free_time_delta_min"]
        largest_window_delta_min = obligations_effects["largest_window_delta_min"]
        assumptions.extend(obligations_effects["assumptions"])
    elif scenario_type == "sleep_schedule_change":
        _apply_sleep_change(checkin, profile_context, params)
    elif scenario_type == "commute_change":
        commute_effects = _apply_commute_change(checkin, params)
        free_time_delta_min = commute_effects["free_time_delta_min"]
        largest_window_delta_min = commute_effects["largest_window_delta_min"]
    elif scenario_type == "study_plan":
        study_effects = _apply_study_plan(checkin, params)
        free_time_delta_min = study_effects["free_time_delta_min"]
        largest_window_delta_min = study_effects["largest_window_delta_min"]
        assumptions.extend(study_effects["assumptions"])

    # If the scenario reduces free time, add a synthetic busy block to reflect compression.
    if free_time_delta_min < 0:
        schedule["busy_blocks"] = _apply_time_reduction(
            schedule, profile_context, abs(free_time_delta_min)
        )
        assumptions.append("Schedule impact modeled as added busy time blocks.")

    return {
        "free_time_delta_min": int(round(free_time_delta_min)),
        "largest_window_delta_min": int(round(largest_window_delta_min)),
        "sleep_delta_hours": _round(checkin["sleep_hours"] - base_sleep),
        "stress_pressure_delta": int(round(checkin["stress_level"] - base_stress)),
        "assumptions": assumptions,
        "sensitivity": sensitivity,
    }


def _apply_job_change(
    checkin: Dict[str, Any], params: Dict[str, Any], direction: int
) -> Dict[str, Any]:
    hours_per_week = float(params["hours_per_week"])
    shift_type = params["shift_type"]
    commute_min_per_day = float(params["commute_min_per_day"])
    pay_per_month = float(params["pay_per_month"])

    days_per_week = 5 if hours_per_week >= 20 else 3
    if shift_type == "mixed":
        days_per_week = 4
    if hours_per_week == 0:
        days_per_week = 0

    energy_drop = min(4, int(round(hours_per_week / 12))) or 0
    stress_rise = min(3, int(round(hours_per_week / 20))) or 0
    deadline_rise = min(4, int(round(hours_per_week / 15))) or 0

    if shift_type == "night":
        energy_drop += 1
        stress_rise += 1
    if commute_min_per_day >= 60:
        stress_rise = min(4, stress_rise + 1)

    money_pressure_delta = -_pressure_delta_from_amount(pay_per_month) * direction
    energy_delta = -energy_drop * direction
    stress_delta = stress_rise * direction
    deadline_delta = deadline_rise * direction

    sleep_delta = 0.0
    if shift_type == "night":
        sleep_delta -= 0.5 * direction
    if hours_per_week >= 45:
        sleep_delta -= 0.5 * direction

    hours_per_day = hours_per_week / days_per_week if days_per_week else 0
    if days_per_week == 0:
        time_impact_min = 0
    else:
        time_impact_min = int(round((hours_per_day * 60) + commute_min_per_day))
    free_time_delta_min = -time_impact_min * direction
    largest_window_delta_min = int(round(free_time_delta_min * 0.4))

    _apply_delta(checkin, "money_pressure", money_pressure_delta, 1, 10)
    _apply_delta(checkin, "energy_level", energy_delta, 1, 10)
    _apply_delta(checkin, "stress_level", stress_delta, 1, 10)
    _apply_deadlines(checkin, deadline_delta)
    _apply_delta(checkin, "sleep_hours", sleep_delta, 0, 12)

    _apply_delta(
        checkin,
        "available_time_hours",
        free_time_delta_min / 60,
        0,
        16,
    )

    assumptions = []
    if days_per_week:
        assumptions.append(f"Assumed {days_per_week} work days per week.")

    return {
        "free_time_delta_min": free_time_delta_min,
        "largest_window_delta_min": _clamp(largest_window_delta_min, -240, 240),
        "assumptions": assumptions,
    }


def _apply_expense_change(checkin: Dict[str, Any], params: Dict[str, Any], direction: int) -> None:
    amount = float(params["amount_per_month"])
    pressure_delta = _pressure_delta_from_amount(amount) * direction
    _apply_delta(checkin, "money_pressure", pressure_delta, 1, 10)
    if amount >= 1000:
        _apply_delta(checkin, "stress_level", 1 * direction, 1, 10)


def _apply_obligation_change(
    checkin: Dict[str, Any], params: Dict[str, Any], direction: int
) -> Dict[str, Any]:
    hours_per_week = float(params["hours_per_week"])
    deadline_pressure = float(params["deadline_pressure"])

    deadline_delta = min(4, max(0, int(round(hours_per_week / 5)))) * direction
    stress_delta = min(3, int(round(deadline_pressure / 3))) * direction
    energy_delta = -1 * direction if hours_per_week >= 8 else 0

    _apply_deadlines(checkin, deadline_delta)
    _apply_delta(checkin, "stress_level", stress_delta, 1, 10)
    if energy_delta:
        _apply_delta(checkin, "energy_level", energy_delta, 1, 10)

    if deadline_pressure >= 8 and direction == 1:
        checkin["critical_deadline"] = True

    free_time_delta_min = -(hours_per_week / 7) * 60 * direction
    largest_window_delta_min = int(round(free_time_delta_min * 0.5))

    _apply_delta(
        checkin,
        "available_time_hours",
        free_time_delta_min / 60,
        0,
        16,
    )

    assumptions = []
    if hours_per_week > 0:
        assumptions.append("Recurring obligation spread across the week.")

    return {
        "free_time_delta_min": free_time_delta_min,
        "largest_window_delta_min": _clamp(largest_window_delta_min, -240, 240),
        "assumptions": assumptions,
    }


def _apply_sleep_change(
    checkin: Dict[str, Any], profile_context: Dict[str, Any], params: Dict[str, Any]
) -> None:
    sleep_delta = float(params["sleep_hours_delta"])
    bedtime_shift = float(params["bedtime_shift_min"])

    _apply_delta(checkin, "sleep_hours", sleep_delta, 0, 12)
    _apply_delta(checkin, "energy_level", int(round(sleep_delta)), 1, 10)

    if sleep_delta >= 1:
        _apply_delta(checkin, "stress_level", -1, 1, 10)
    elif sleep_delta <= -1:
        _apply_delta(checkin, "stress_level", 1, 1, 10)

    if abs(bedtime_shift) >= 120:
        _apply_delta(checkin, "stress_level", 1, 1, 10)

    if profile_context["work_pattern"] == "day" and abs(bedtime_shift) >= 90:
        _apply_delta(checkin, "energy_level", -1, 1, 10)


def _apply_commute_change(checkin: Dict[str, Any], params: Dict[str, Any]) -> Dict[str, Any]:
    delta_min_per_day = float(params["delta_min_per_day"])
    daily_delta_hours = delta_min_per_day / 60

    _apply_delta(checkin, "available_time_hours", -daily_delta_hours, 0, 16)

    if delta_min_per_day > 0:
        _apply_delta(checkin, "stress_level", min(2, int(round(delta_min_per_day / 45))), 1, 10)
    elif delta_min_per_day < 0:
        _apply_delta(checkin, "stress_level", -min(2, int(round(abs(delta_min_per_day) / 45))), 1, 10)

    free_time_delta_min = -delta_min_per_day
    largest_window_delta_min = int(round(free_time_delta_min * 0.4))

    return {
        "free_time_delta_min": free_time_delta_min,
        "largest_window_delta_min": _clamp(largest_window_delta_min, -120, 120),
    }


def _apply_study_plan(checkin: Dict[str, Any], params: Dict[str, Any]) -> Dict[str, Any]:
    hours_per_week = float(params["hours_per_week"])
    intensity = int(round(params["intensity"]))
    deadline_pressure = float(params["deadline_pressure"])

    deadline_delta = min(4, max(0, int(round(hours_per_week / 6))))
    stress_delta = min(3, int(round(deadline_pressure / 4))) + max(0, intensity - 1)

    _apply_deadlines(checkin, deadline_delta)
    _apply_delta(checkin, "stress_level", stress_delta, 1, 10)
    if intensity >= 3:
        _apply_delta(checkin, "energy_level", -1, 1, 10)

    free_time_delta_min = -(hours_per_week / 7) * 60
    largest_window_delta_min = int(round(free_time_delta_min * 0.4))

    _apply_delta(
        checkin,
        "available_time_hours",
        free_time_delta_min / 60,
        0,
        16,
    )

    assumptions = []
    if hours_per_week > 0:
        assumptions.append("Study time is distributed across the week.")

    return {
        "free_time_delta_min": free_time_delta_min,
        "largest_window_delta_min": _clamp(largest_window_delta_min, -240, 240),
        "assumptions": assumptions,
    }


def _pressure_delta_from_amount(amount_per_month: float) -> int:
    if amount_per_month <= 0:
        return 0
    step = 800
    return min(4, max(1, int(round(amount_per_month / step))))


def _apply_deadlines(checkin: Dict[str, Any], delta: int) -> None:
    current = int(round(checkin["today_deadlines_count"]))
    checkin["today_deadlines_count"] = _clamp_int(current + delta, 0, 10)


def _apply_delta(
    checkin: Dict[str, Any], field: str, delta: float, minimum: float, maximum: float
) -> None:
    new_value = checkin[field] + delta
    checkin[field] = _round(_clamp(new_value, minimum, maximum))


def _apply_time_reduction(
    schedule: Dict[str, Any], profile_context: Dict[str, Any], minutes_to_reduce: float
) -> List[Dict[str, str]]:
    if minutes_to_reduce <= 0:
        return schedule.get("busy_blocks", [])

    timezone = schedule["timezone"]
    busy_blocks = list(schedule.get("busy_blocks", []))
    schedule_date = infer_schedule_date(busy_blocks, timezone)
    day_bounds = derive_day_bounds(profile_context, timezone, schedule_date)
    merged_busy = normalize_busy_blocks(busy_blocks, timezone)
    free_windows = compute_free_windows(day_bounds, merged_busy)

    remaining = minutes_to_reduce
    new_blocks = []
    for start, end in free_windows:
        if remaining <= 0:
            break
        window_minutes = int(round((end - start).total_seconds() / 60))
        if window_minutes <= 0:
            continue
        block_minutes = min(window_minutes, int(round(remaining)))
        block_end = start + timedelta(minutes=block_minutes)
        new_blocks.append(
            {
                "start_ts": start.isoformat(),
                "end_ts": block_end.isoformat(),
            }
        )
        remaining -= block_minutes

    return busy_blocks + new_blocks


def _build_risk_changes(
    baseline_flags: Dict[str, str], new_flags: Dict[str, str], scenario_type: str
) -> List[Dict[str, str]]:
    changes = []
    for key, value in baseline_flags.items():
        if new_flags.get(key) != value:
            changes.append(
                {
                    "flag": key,
                    "from": value,
                    "to": new_flags.get(key, value),
                    "why": _risk_change_reason(key, scenario_type),
                }
            )
    return changes


def _risk_change_reason(flag: str, scenario_type: str) -> str:
    reasons = {
        "burnout_risk": {
            "add_job": "Added workload reduces recovery capacity.",
            "drop_job": "Reduced workload improves recovery capacity.",
            "sleep_schedule_change": "Sleep changes shift energy recovery.",
            "study_plan": "Study load can raise fatigue if intensity is high.",
        },
        "financial_risk": {
            "add_job": "Income change shifts money pressure.",
            "drop_job": "Income change shifts money pressure.",
            "increase_expense": "Added costs raise money pressure.",
            "reduce_expense": "Reduced costs lower money pressure.",
        },
        "compliance_risk": {
            "add_recurring_obligation": "More obligations raise compliance risk.",
            "remove_recurring_obligation": "Reduced obligations ease compliance risk.",
            "study_plan": "Study deadlines can add compliance pressure.",
        },
        "overload_risk": {
            "add_job": "Less free time increases overload risk.",
            "drop_job": "More free time reduces overload risk.",
            "add_recurring_obligation": "New obligations tighten the schedule.",
            "commute_change": "Commute time changes available capacity.",
        },
    }
    return reasons.get(flag, {}).get(
        scenario_type, "Risk level changed based on updated inputs."
    )


def _compute_confidence(
    baseline_confidence: float, baseline_reasons: List[str], missing_count: int
) -> Tuple[float, List[str]]:
    confidence = baseline_confidence
    reasons = list(baseline_reasons)

    if baseline_confidence < 0.6:
        confidence -= 0.1
        reasons.append("Baseline confidence is low; scenario inherits uncertainty.")

    if missing_count > 0:
        penalty = min(0.25, 0.05 * missing_count)
        confidence -= penalty
        reasons.append("Scenario inputs were partially assumed; confidence reduced.")

    confidence = float(_clamp(confidence, 0.3, 0.95))
    return round(confidence, 2), reasons


def _build_explanation(
    scenario: Dict[str, Any],
    delta_score: int,
    delta_breakdown: Dict[str, int],
    risk_changes: List[Dict[str, str]],
    effects: Dict[str, Any],
    confidence_reasons: List[str],
) -> str:
    parts = [
        f"Scenario '{scenario['type']}' shifts the stability score by {delta_score:+d}.",
    ]

    money_delta = delta_breakdown.get("money", 0)
    if money_delta != 0:
        parts.append(f"Money score changes by {money_delta:+d}.")

    obligations_delta = delta_breakdown.get("obligations", 0)
    if obligations_delta != 0:
        parts.append(f"Obligations score changes by {obligations_delta:+d}.")

    if risk_changes:
        change_notes = ", ".join(
            f"{change['flag'].replace('_', ' ')} {change['from']}→{change['to']}"
            for change in risk_changes
        )
        parts.append(f"Risk shifts: {change_notes}.")

    if effects["free_time_delta_min"]:
        parts.append(
            f"Estimated free time delta {effects['free_time_delta_min']:+d} min/day."
        )

    parts.append("Expected outcomes vary; this is a deterministic estimate, not a guarantee.")
    parts.append("Confidence notes: " + "; ".join(confidence_reasons))

    return " ".join(parts)


def _net_benefit_score(result: Dict[str, Any], baseline_flags: Dict[str, str]) -> int:
    delta_score = int(result["delta"]["life_stability_score"])
    baseline_risk_score = sum(RISK_SCORE.get(value, 0) for value in baseline_flags.values())
    new_risk_score = sum(
        RISK_SCORE.get(value, 0) for value in result["new_estimate"]["flags"].values()
    )
    risk_improvement = baseline_risk_score - new_risk_score
    free_time_delta = int(result["constraints_impact"]["free_time_delta_min"])
    free_time_bonus = int(free_time_delta / 30)
    return int(delta_score + (risk_improvement * 5) + free_time_bonus)


def _summary_line(result: Dict[str, Any]) -> str:
    delta = result["delta"]["life_stability_score"]
    free_time = result["constraints_impact"]["free_time_delta_min"]
    risk_changes = result["risk_changes"]
    risk_note = "Risks stable."
    if risk_changes:
        risk_note = "Risk changes: " + ", ".join(
            f"{change['flag'].replace('_', ' ')} {change['to']}" for change in risk_changes
        )
    return (
        f"Score {delta:+d}; free time {free_time:+d} min/day. {risk_note}"
    )


def _tradeoffs(result: Dict[str, Any]) -> List[str]:
    tradeoffs = []
    delta = result["delta"]["life_stability_score"]
    if delta < 0:
        tradeoffs.append(f"Stability score drops by {abs(delta)}.")
    free_time = result["constraints_impact"]["free_time_delta_min"]
    if free_time < 0:
        tradeoffs.append(f"Free time decreases by {abs(free_time)} min/day.")
    for change in result["risk_changes"]:
        if change["to"] in ("medium", "high") and change["to"] != change["from"]:
            tradeoffs.append(
                f"{change['flag'].replace('_', ' ')} rises to {change['to']}."
            )
    return tradeoffs or ["No major tradeoffs identified."]


def _top_risks(flags: Dict[str, str]) -> List[str]:
    ordered = sorted(
        flags.items(),
        key=lambda item: (RISK_SCORE.get(item[1], 0), item[0]),
        reverse=True,
    )
    return [
        f"{flag.replace('_', ' ')}: {level}"
        for flag, level in ordered
        if level in ("high", "medium")
    ][:3]


def _why_best(result: Dict[str, Any]) -> List[str]:
    if not result:
        return []
    why = []
    delta = result["delta"]["life_stability_score"]
    if delta > 0:
        why.append(f"Stability score improves by {delta}.")
    free_time = result["constraints_impact"]["free_time_delta_min"]
    if free_time > 0:
        why.append(f"Free time improves by {free_time} min/day.")
    if result["risk_changes"]:
        why.append("Risk signals improve compared to baseline.")
    return why or ["Highest composite benefit score in this comparison."]


def _who_should_not_choose(result: Dict[str, Any]) -> List[str]:
    if not result:
        return []
    warnings = []
    flags = result["new_estimate"]["flags"]
    if flags.get("burnout_risk") == "high":
        warnings.append("Anyone already near burnout should avoid this scenario.")
    if flags.get("compliance_risk") == "high":
        warnings.append("Users with strict compliance obligations may struggle.")
    free_time = result["constraints_impact"]["free_time_delta_min"]
    if free_time < -90:
        warnings.append("Users with limited time buffers may feel overloaded.")
    return warnings or ["No major exclusion criteria identified."]


def _scenario_index(results: List[Dict[str, Any]], scenario_id: str) -> int:
    for index, result in enumerate(results):
        if result["scenario_id"] == scenario_id:
            return index
    return 0


def _dedupe(items: List[str]) -> List[str]:
    seen = set()
    result = []
    for item in items:
        if item not in seen:
            seen.add(item)
            result.append(item)
    return result


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _clamp_int(value: int, minimum: int, maximum: int) -> int:
    return int(max(minimum, min(maximum, value)))


def _round(value: float) -> float:
    return round(float(value), 2)
