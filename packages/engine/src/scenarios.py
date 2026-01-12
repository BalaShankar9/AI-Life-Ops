"""Scenario DSL definitions and normalization helpers for simulations."""

# ScenarioPack shape:
# {
#   "baseline_name": "Current",
#   "scenarios": [Scenario, ...]
# }

from __future__ import annotations

from typing import Any, Dict, List, Tuple

SCENARIO_TYPES = {
    "add_job",
    "drop_job",
    "increase_expense",
    "reduce_expense",
    "add_recurring_obligation",
    "remove_recurring_obligation",
    "sleep_schedule_change",
    "commute_change",
    "study_plan",
}

# Scenario parameter expectations by type. Each param entry includes:
# - type: "number" or "string"
# - default: fallback value used when missing/invalid
# - min/max: numeric bounds (numbers only)
# - enum: list of valid string values (strings only)
SCENARIO_PARAM_SPECS: Dict[str, Dict[str, Dict[str, Any]]] = {
    "add_job": {
        "hours_per_week": {"type": "number", "min": 0, "max": 80, "default": 20},
        "shift_type": {
            "type": "string",
            "enum": ["day", "night", "mixed"],
            "default": "day",
        },
        "commute_min_per_day": {"type": "number", "min": 0, "max": 180, "default": 30},
        "pay_per_month": {"type": "number", "min": 0, "max": 20000, "default": 2500},
    },
    "drop_job": {
        "hours_per_week": {"type": "number", "min": 0, "max": 80, "default": 20},
        "shift_type": {
            "type": "string",
            "enum": ["day", "night", "mixed"],
            "default": "day",
        },
        "commute_min_per_day": {"type": "number", "min": 0, "max": 180, "default": 30},
        "pay_per_month": {"type": "number", "min": 0, "max": 20000, "default": 2500},
    },
    "increase_expense": {
        "amount_per_month": {"type": "number", "min": 0, "max": 20000, "default": 200},
        "category": {"type": "string", "default": "general"},
    },
    "reduce_expense": {
        "amount_per_month": {"type": "number", "min": 0, "max": 20000, "default": 200},
        "category": {"type": "string", "default": "general"},
    },
    "add_recurring_obligation": {
        "hours_per_week": {"type": "number", "min": 0, "max": 40, "default": 5},
        "deadline_pressure": {"type": "number", "min": 1, "max": 10, "default": 5},
    },
    "remove_recurring_obligation": {
        "hours_per_week": {"type": "number", "min": 0, "max": 40, "default": 5},
        "deadline_pressure": {"type": "number", "min": 1, "max": 10, "default": 5},
    },
    "sleep_schedule_change": {
        "sleep_hours_delta": {"type": "number", "min": -4, "max": 4, "default": 0},
        "bedtime_shift_min": {"type": "number", "min": -240, "max": 240, "default": 0},
    },
    "commute_change": {
        "delta_min_per_day": {"type": "number", "min": -120, "max": 120, "default": 0},
        "days_per_week": {"type": "number", "min": 0, "max": 7, "default": 5},
    },
    "study_plan": {
        "hours_per_week": {"type": "number", "min": 0, "max": 30, "default": 6},
        "intensity": {"type": "number", "min": 1, "max": 3, "default": 2},
        "deadline_pressure": {"type": "number", "min": 1, "max": 10, "default": 5},
    },
}

SENSITIVITY_GUIDANCE: Dict[str, Dict[str, str]] = {
    "add_job": {
        "hours_per_week": "If work hours are higher, energy and free time would drop further.",
        "shift_type": "Different shift timing could change sleep and stress impacts.",
        "commute_min_per_day": "Longer commutes reduce free time and increase stress.",
        "pay_per_month": "Lower pay reduces the financial improvement.",
    },
    "drop_job": {
        "hours_per_week": "If hours removed are lower, free time gains shrink.",
        "shift_type": "Shift timing affects how much sleep and stress improve.",
        "commute_min_per_day": "Commute changes shift available time and stress.",
        "pay_per_month": "Larger income loss worsens money pressure further.",
    },
    "increase_expense": {
        "amount_per_month": "Higher costs increase money pressure more than shown.",
        "category": "Category mix can change which obligations feel urgent.",
    },
    "reduce_expense": {
        "amount_per_month": "Smaller savings reduce the money pressure improvement.",
        "category": "Category mix can change near-term obligations.",
    },
    "add_recurring_obligation": {
        "hours_per_week": "More hours add heavier obligations and reduce free time further.",
        "deadline_pressure": "Higher pressure raises compliance and overload risks.",
    },
    "remove_recurring_obligation": {
        "hours_per_week": "Fewer hours removed means less relief than shown.",
        "deadline_pressure": "Lower pressure changes the compliance relief.",
    },
    "sleep_schedule_change": {
        "sleep_hours_delta": "Smaller sleep gains reduce energy improvements.",
        "bedtime_shift_min": "Larger shifts can add instability and stress.",
    },
    "commute_change": {
        "delta_min_per_day": "Commute changes directly alter free time and stress.",
        "days_per_week": "More commute days amplify time loss.",
    },
    "study_plan": {
        "hours_per_week": "Additional study time further reduces free time.",
        "intensity": "Higher intensity can raise stress and fatigue.",
        "deadline_pressure": "Pressure affects overload and compliance risk.",
    },
}


def normalize_scenario(
    scenario: Dict[str, Any],
) -> Tuple[Dict[str, Any], List[str], List[Dict[str, str]], int]:
    """Normalize a scenario dict and return assumptions, sensitivity notes, and missing count."""
    if not isinstance(scenario, dict):
        raise ValueError("Scenario must be an object")
    scenario_id = scenario.get("id")
    scenario_type = scenario.get("type")
    if not isinstance(scenario_id, str) or not scenario_id.strip():
        raise ValueError("Scenario id is required")
    if scenario_type not in SCENARIO_TYPES:
        raise ValueError(f"Scenario type {scenario_type!r} is not supported")

    params = scenario.get("params", {})
    assumptions: List[str] = []
    sensitivity: List[Dict[str, str]] = []
    missing_count = 0

    if not isinstance(params, dict):
        params = {}
        assumptions.append("Scenario params were missing; defaults applied.")
        missing_count += 1

    normalized: Dict[str, Any] = {
        "id": scenario_id.strip(),
        "type": scenario_type,
        "params": {},
    }

    spec = SCENARIO_PARAM_SPECS.get(scenario_type, {})
    for key, meta in spec.items():
        value = params.get(key)
        default = meta.get("default")
        if value is None:
            normalized_value = default
            assumptions.append(f"Assumed {key}={default} due to missing parameter.")
            sensitivity.append(
                _sensitivity_entry(
                    scenario_type,
                    key,
                    f"Assumed {key}={default}.",
                )
            )
            missing_count += 1
        else:
            normalized_value, was_adjusted = _normalize_param(value, meta)
            if was_adjusted:
                assumptions.append(
                    f"Adjusted {key} to {normalized_value} to stay within expected bounds."
                )
                sensitivity.append(
                    _sensitivity_entry(
                        scenario_type,
                        key,
                        f"Adjusted {key} to {normalized_value}.",
                    )
                )
                missing_count += 1
        normalized["params"][key] = normalized_value

    return normalized, assumptions, sensitivity, missing_count


def _normalize_param(value: Any, meta: Dict[str, Any]) -> Tuple[Any, bool]:
    param_type = meta.get("type")
    if param_type == "number":
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            return meta.get("default"), True
        minimum = meta.get("min")
        maximum = meta.get("max")
        numeric = float(value)
        if minimum is not None:
            numeric = max(float(minimum), numeric)
        if maximum is not None:
            numeric = min(float(maximum), numeric)
        return numeric, numeric != value
    if param_type == "string":
        if not isinstance(value, str) or not value.strip():
            return meta.get("default"), True
        cleaned = value.strip()
        enum = meta.get("enum")
        if enum and cleaned not in enum:
            return meta.get("default"), True
        return cleaned, False

    return meta.get("default"), True


def _sensitivity_entry(
    scenario_type: str, param: str, assumption: str
) -> Dict[str, str]:
    guidance = SENSITIVITY_GUIDANCE.get(scenario_type, {}).get(
        param, "If this assumption is wrong, the score delta could shift."
    )
    return {
        "assumption": assumption,
        "if_wrong_effect": guidance,
    }
