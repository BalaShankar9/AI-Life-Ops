"""Deterministic scoring and flag derivation for the engine."""

from __future__ import annotations

from typing import Dict, List, Tuple

from life_systems import RISK_LEVELS, SYSTEM_KEYS


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _scale(value: float, in_min: float, in_max: float, out_min: float, out_max: float) -> float:
    if in_max == in_min:
        return out_min
    ratio = (value - in_min) / (in_max - in_min)
    return out_min + ratio * (out_max - out_min)


def _to_int(score: float) -> int:
    return int(round(_clamp(score, 0, 20)))


def score_breakdown(payload: dict) -> Dict[str, int]:
    """Return the 5-system breakdown (0..20 each)."""
    sleep_hours = payload["sleep_hours"]
    energy_level = payload["energy_level"]
    stress_level = payload["stress_level"]
    money_pressure = payload["money_pressure"]
    today_deadlines_count = payload["today_deadlines_count"]
    critical_deadline = payload["critical_deadline"]
    available_time_hours = payload["available_time_hours"]

    # Energy system balances sleep, reported energy, and stress recovery load.
    energy_score = (
        _scale(sleep_hours, 0, 12, 0, 8)
        + _scale(energy_level, 1, 10, 0, 8)
        + _scale(stress_level, 1, 10, 4, 0)
    )

    # Money system is primarily pressure-based (lower pressure = higher score).
    money_score = _scale(money_pressure, 1, 10, 20, 0)

    # Obligations system captures deadline load and criticality.
    obligations_score = _scale(today_deadlines_count, 0, 10, 20, 2)
    if critical_deadline:
        obligations_score -= 4

    # Growth system favors available time and energy, but discounts high stress.
    growth_score = (
        _scale(available_time_hours, 0, 16, 0, 12)
        + _scale(energy_level, 1, 10, 0, 6)
        + _scale(stress_level, 1, 10, 2, 0)
    )

    # Stability system smooths across sleep, stress, money pressure, and deadlines.
    stability_score = (
        _scale(sleep_hours, 0, 12, 0, 6)
        + _scale(stress_level, 1, 10, 6, 0)
        + _scale(money_pressure, 1, 10, 5, 0)
        + _scale(today_deadlines_count, 0, 10, 5, 0)
    )

    breakdown = {
        "energy": _to_int(energy_score),
        "money": _to_int(money_score),
        "obligations": _to_int(obligations_score),
        "growth": _to_int(growth_score),
        "stability": _to_int(stability_score),
    }

    # Ensure all keys exist and are within range.
    for key in SYSTEM_KEYS:
        breakdown[key] = int(_clamp(breakdown[key], 0, 20))

    return breakdown


def derive_flags(payload: dict) -> Dict[str, str]:
    """Return risk flags based on deterministic thresholds."""
    sleep_hours = payload["sleep_hours"]
    energy_level = payload["energy_level"]
    stress_level = payload["stress_level"]
    money_pressure = payload["money_pressure"]
    today_deadlines_count = payload["today_deadlines_count"]
    critical_deadline = payload["critical_deadline"]
    available_time_hours = payload["available_time_hours"]

    # Burnout risk focuses on low sleep, low energy, or high stress.
    if sleep_hours <= 4 or energy_level <= 3 or stress_level >= 8:
        burnout_risk = "high"
    elif sleep_hours <= 6 or energy_level <= 5 or stress_level >= 6:
        burnout_risk = "medium"
    else:
        burnout_risk = "low"

    # Financial risk tracks money pressure.
    if money_pressure >= 8:
        financial_risk = "high"
    elif money_pressure >= 5:
        financial_risk = "medium"
    else:
        financial_risk = "low"

    # Compliance risk spikes with critical deadlines or heavy deadline load.
    if critical_deadline or today_deadlines_count >= 6:
        compliance_risk = "high"
    elif today_deadlines_count >= 3:
        compliance_risk = "medium"
    else:
        compliance_risk = "low"

    # Overload risk considers deadlines relative to available time.
    if available_time_hours < 2 or (today_deadlines_count >= 5 and available_time_hours <= 4):
        overload_risk = "high"
    elif today_deadlines_count >= 3 or available_time_hours <= 4:
        overload_risk = "medium"
    else:
        overload_risk = "low"

    flags = {
        "burnout_risk": burnout_risk,
        "financial_risk": financial_risk,
        "compliance_risk": compliance_risk,
        "overload_risk": overload_risk,
    }

    for key in flags:
        if flags[key] not in RISK_LEVELS:
            raise ValueError(f"Invalid risk level for {key}")

    return flags


def calculate_confidence(payload: dict) -> Tuple[float, List[str], List[str]]:
    """Return confidence (0..1) plus reasons and data quality warnings."""
    sleep_hours = payload["sleep_hours"]
    energy_level = payload["energy_level"]
    stress_level = payload["stress_level"]
    today_deadlines_count = payload["today_deadlines_count"]
    critical_deadline = payload["critical_deadline"]
    available_time_hours = payload["available_time_hours"]
    notes = payload.get("notes")

    confidence = 0.85
    reasons: List[str] = []
    warnings: List[str] = []

    # Contradictory signals reduce confidence and add a variability note.
    if sleep_hours <= 3 and energy_level >= 8:
        confidence -= 0.25
        reasons.append("Contradictory inputs: very low sleep but very high energy.")
    if sleep_hours >= 9 and energy_level <= 3:
        confidence -= 0.2
        reasons.append("Contradictory inputs: long sleep but very low energy.")
    if stress_level >= 8 and energy_level >= 8:
        confidence -= 0.1
        reasons.append("Contradictory inputs: high stress alongside high energy.")
    if stress_level <= 2 and energy_level <= 2:
        confidence -= 0.1
        reasons.append("Contradictory inputs: low stress alongside very low energy.")
    if available_time_hours == 0 and today_deadlines_count > 0:
        confidence -= 0.1
        reasons.append("Contradictory inputs: no available time while deadlines exist.")
    if critical_deadline and today_deadlines_count == 0:
        confidence -= 0.05
        reasons.append("Contradictory inputs: critical deadline flagged without a deadline count.")

    if not notes:
        warnings.append("No notes provided; using defaults.")
    if available_time_hours == 0:
        warnings.append("No available time reported; plan uses damage control mode.")

    confidence = float(_clamp(confidence, 0.3, 0.95))
    if not reasons:
        reasons.append("Inputs are internally consistent; confidence remains baseline.")

    return round(confidence, 2), reasons, warnings
