"""Input validation and output invariants for the engine."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple

from life_systems import (
    COMPLIANCE_CATEGORY,
    DAMAGE_CONTROL_MAX_ITEM_MIN,
    DAMAGE_CONTROL_MAX_TOTAL_MIN,
    RECOVERY_CATEGORY,
    RISK_LEVELS,
    SYSTEM_KEYS,
)

# Canonical engine input schema.
# checkin:
# - sleep_hours: 0..12
# - energy_level: 1..10
# - stress_level: 1..10
# - money_pressure: 1..10
# - today_deadlines_count: 0..10
# - critical_deadline: boolean
# - available_time_hours: 0..16
# - notes: optional string
# profile_context:
# - timezone: IANA string
# - wake_window_start: HH:MM
# - wake_window_end: HH:MM
# - sleep_window_start: HH:MM
# - sleep_window_end: HH:MM
# - work_pattern: day | night | mixed | unemployed
# - max_daily_focus_blocks: int 1..4
# - priority_bias: stability_first | income_first | growth_first
# - compliance_domains: list[str]
# schedule:
# - timezone: IANA string
# - busy_blocks: list[{start_ts: ISO string, end_ts: ISO string}]

_TIME_PATTERN = re.compile(r"^\d{2}:\d{2}$")
_TIMEZONE_PATTERN = re.compile(r"^(UTC|[A-Za-z_]+\/[A-Za-z_]+)$")
_WORK_PATTERNS = {"day", "night", "mixed", "unemployed"}
_PRIORITY_BIASES = {"stability_first", "income_first", "growth_first"}


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _parse_float_field(payload: Dict[str, Any], key: str, minimum: float, maximum: float) -> float:
    if key not in payload:
        raise ValueError(f"Missing required field: {key}")
    value = payload[key]
    if not _is_number(value):
        raise ValueError(f"Field {key} must be a number")
    value = float(value)
    if value < minimum or value > maximum:
        raise ValueError(f"Field {key} must be between {minimum} and {maximum}")
    return value


def _parse_int_field(payload: Dict[str, Any], key: str, minimum: int, maximum: int) -> int:
    if key not in payload:
        raise ValueError(f"Missing required field: {key}")
    value = payload[key]
    if isinstance(value, bool):
        raise ValueError(f"Field {key} must be an integer")
    if isinstance(value, float) and not value.is_integer():
        raise ValueError(f"Field {key} must be an integer")
    if not isinstance(value, (int, float)):
        raise ValueError(f"Field {key} must be an integer")
    value = int(value)
    if value < minimum or value > maximum:
        raise ValueError(f"Field {key} must be between {minimum} and {maximum}")
    return value


def _parse_bool_field(payload: Dict[str, Any], key: str) -> bool:
    if key not in payload:
        raise ValueError(f"Missing required field: {key}")
    value = payload[key]
    if not isinstance(value, bool):
        raise ValueError(f"Field {key} must be a boolean")
    return value


def _parse_string_field(payload: Dict[str, Any], key: str) -> str:
    if key not in payload:
        raise ValueError(f"Missing required field: {key}")
    value = payload[key]
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Field {key} must be a non-empty string")
    return value.strip()


def _parse_time_field(payload: Dict[str, Any], key: str) -> str:
    value = _parse_string_field(payload, key)
    if not _TIME_PATTERN.match(value):
        raise ValueError(f"Field {key} must use HH:MM 24h format")
    return value


def _parse_timezone_field(payload: Dict[str, Any], key: str) -> str:
    value = _parse_string_field(payload, key)
    if not _TIMEZONE_PATTERN.match(value):
        raise ValueError(f"Field {key} must be a valid IANA timezone")
    return value


def _parse_list_field(payload: Dict[str, Any], key: str) -> List[str]:
    if key not in payload:
        raise ValueError(f"Missing required field: {key}")
    value = payload[key]
    if not isinstance(value, list):
        raise ValueError(f"Field {key} must be a list")
    cleaned: List[str] = []
    for entry in value:
        if not isinstance(entry, str) or not entry.strip():
            raise ValueError(f"Field {key} must contain non-empty strings")
        cleaned.append(entry.strip())
    if not cleaned:
        raise ValueError(f"Field {key} must include at least one item")
    return cleaned


def validate_engine_input(payload: Any) -> Tuple[Dict[str, Any], Dict[str, Any], Dict[str, Any]]:
    """Validate and normalize the engine input payload."""
    if not isinstance(payload, dict):
        raise ValueError("Input payload must be a JSON object")

    checkin_payload = payload.get("checkin")
    profile_payload = payload.get("profile_context")
    schedule_payload = payload.get("schedule")

    if not isinstance(checkin_payload, dict):
        raise ValueError("Input payload must include checkin object")
    if not isinstance(profile_payload, dict):
        raise ValueError("Input payload must include profile_context object")
    if not isinstance(schedule_payload, dict):
        raise ValueError("Input payload must include schedule object")

    checkin = {
        "sleep_hours": _parse_float_field(checkin_payload, "sleep_hours", 0, 12),
        "energy_level": _parse_float_field(checkin_payload, "energy_level", 1, 10),
        "stress_level": _parse_float_field(checkin_payload, "stress_level", 1, 10),
        "money_pressure": _parse_float_field(checkin_payload, "money_pressure", 1, 10),
        "today_deadlines_count": _parse_int_field(checkin_payload, "today_deadlines_count", 0, 10),
        "critical_deadline": _parse_bool_field(checkin_payload, "critical_deadline"),
        "available_time_hours": _parse_float_field(
            checkin_payload, "available_time_hours", 0, 16
        ),
    }

    notes = checkin_payload.get("notes")
    if notes is None:
        checkin["notes"] = None
    elif isinstance(notes, str):
        checkin["notes"] = notes.strip()
    else:
        raise ValueError("Field notes must be a string if provided")

    work_pattern = _parse_string_field(profile_payload, "work_pattern")
    if work_pattern not in _WORK_PATTERNS:
        raise ValueError("Field work_pattern must be a valid enum value")

    priority_bias = _parse_string_field(profile_payload, "priority_bias")
    if priority_bias not in _PRIORITY_BIASES:
        raise ValueError("Field priority_bias must be a valid enum value")

    profile_context = {
        "timezone": _parse_timezone_field(profile_payload, "timezone"),
        "wake_window_start": _parse_time_field(profile_payload, "wake_window_start"),
        "wake_window_end": _parse_time_field(profile_payload, "wake_window_end"),
        "sleep_window_start": _parse_time_field(profile_payload, "sleep_window_start"),
        "sleep_window_end": _parse_time_field(profile_payload, "sleep_window_end"),
        "work_pattern": work_pattern,
        "max_daily_focus_blocks": _parse_int_field(
            profile_payload, "max_daily_focus_blocks", 1, 4
        ),
        "priority_bias": priority_bias,
        "compliance_domains": _parse_list_field(profile_payload, "compliance_domains"),
    }

    schedule_timezone = _parse_timezone_field(schedule_payload, "timezone")
    busy_blocks_raw = schedule_payload.get("busy_blocks", [])
    if not isinstance(busy_blocks_raw, list):
        raise ValueError("Field schedule.busy_blocks must be a list")
    busy_blocks: List[Dict[str, str]] = []
    for block in busy_blocks_raw:
        if not isinstance(block, dict):
            raise ValueError("schedule.busy_blocks entries must be objects")
        start_ts = block.get("start_ts")
        end_ts = block.get("end_ts")
        if not isinstance(start_ts, str) or not start_ts.strip():
            raise ValueError("schedule.busy_blocks start_ts must be a string")
        if not isinstance(end_ts, str) or not end_ts.strip():
            raise ValueError("schedule.busy_blocks end_ts must be a string")
        busy_blocks.append({"start_ts": start_ts.strip(), "end_ts": end_ts.strip()})

    schedule = {
        "timezone": schedule_timezone,
        "busy_blocks": busy_blocks,
    }

    return checkin, profile_context, schedule


def assert_invariants(checkin: Dict[str, Any], output: Dict[str, Any]) -> None:
    """Enforce strict output invariants before returning results."""
    required_keys = {
        "life_stability_score",
        "breakdown",
        "confidence",
        "confidence_reasons",
        "data_quality_warnings",
        "flags",
        "priorities",
        "avoid_today",
        "next_best_actions",
        "reasoning",
        "assumptions",
        "variability_notes",
        "used_context",
        "safety_notice",
        "schedule_plan",
        "schedule_conflicts",
        "free_time_summary",
    }

    missing = required_keys.difference(output.keys())
    if missing:
        raise ValueError(f"Output missing required keys: {sorted(missing)}")

    breakdown = output["breakdown"]
    if not isinstance(breakdown, dict):
        raise ValueError("breakdown must be an object")
    if set(breakdown.keys()) != set(SYSTEM_KEYS):
        raise ValueError("breakdown must include exactly the 5 system keys")
    for key, value in breakdown.items():
        if not isinstance(value, int):
            raise ValueError(f"breakdown {key} must be an integer")
        if value < 0 or value > 20:
            raise ValueError(f"breakdown {key} out of range")

    life_stability_score = output["life_stability_score"]
    if not isinstance(life_stability_score, int):
        raise ValueError("life_stability_score must be an integer")
    if life_stability_score < 0 or life_stability_score > 100:
        raise ValueError("life_stability_score out of range")
    if life_stability_score != sum(breakdown.values()):
        raise ValueError("life_stability_score must equal breakdown sum")

    confidence = output["confidence"]
    if not isinstance(confidence, (int, float)):
        raise ValueError("confidence must be numeric")
    if confidence < 0 or confidence > 1:
        raise ValueError("confidence out of range")

    flags = output["flags"]
    if not isinstance(flags, dict):
        raise ValueError("flags must be an object")
    for key in (
        "burnout_risk",
        "financial_risk",
        "compliance_risk",
        "overload_risk",
        "crisis_risk",
    ):
        if key not in flags:
            raise ValueError(f"flags missing {key}")
        if flags[key] not in RISK_LEVELS:
            raise ValueError(f"flags {key} invalid")

    crisis_high = flags.get("crisis_risk") == "high"

    priorities = output["priorities"]
    if not isinstance(priorities, list):
        raise ValueError("priorities must be a list")
    if len(priorities) > 3:
        raise ValueError("priorities must be 3 items max")

    compliance_required = flags["compliance_risk"] == "high"
    burnout_required = flags["burnout_risk"] == "high"
    compliance_present = False
    recovery_present = False

    for item in priorities:
        if not isinstance(item, dict):
            raise ValueError("priority items must be objects")
        for field in (
            "title",
            "category",
            "time_estimate_min",
            "effort",
            "impact",
            "why",
            "assumptions",
            "variability",
        ):
            if field not in item:
                raise ValueError(f"priority item missing {field}")
        if not isinstance(item["title"], str):
            raise ValueError("priority title must be string")
        if not isinstance(item["category"], str):
            raise ValueError("priority category must be string")
        if not isinstance(item["time_estimate_min"], int):
            raise ValueError("time_estimate_min must be integer")
        if item["time_estimate_min"] <= 0:
            raise ValueError("time_estimate_min must be positive")
        if not isinstance(item["effort"], int) or not (1 <= item["effort"] <= 5):
            raise ValueError("effort must be 1..5")
        if not isinstance(item["impact"], int) or not (1 <= item["impact"] <= 5):
            raise ValueError("impact must be 1..5")
        if not isinstance(item["assumptions"], list):
            raise ValueError("assumptions must be list")
        if not isinstance(item["variability"], list):
            raise ValueError("variability must be list")

        if item["category"] == COMPLIANCE_CATEGORY:
            compliance_present = True
        if item["category"] == RECOVERY_CATEGORY:
            recovery_present = True

    if not crisis_high:
        if compliance_required and not compliance_present:
            raise ValueError("Compliance action required but missing")
        if burnout_required and not recovery_present:
            raise ValueError("Recovery action required but missing")
    else:
        if len(priorities) != 1:
            raise ValueError("Crisis path must return a single priority")
        if priorities[0].get("title") != "Reach immediate support":
            raise ValueError("Crisis priority must be immediate support")

    if checkin["available_time_hours"] < 2:
        total_time = sum(item["time_estimate_min"] for item in priorities)
        if total_time > DAMAGE_CONTROL_MAX_TOTAL_MIN:
            raise ValueError("Damage control mode must keep total time short")
        for item in priorities:
            if item["time_estimate_min"] > DAMAGE_CONTROL_MAX_ITEM_MIN:
                raise ValueError("Damage control mode requires short actions")

    for list_key in (
        "avoid_today",
        "next_best_actions",
        "confidence_reasons",
        "data_quality_warnings",
        "assumptions",
        "variability_notes",
        "used_context",
    ):
        if not isinstance(output[list_key], list):
            raise ValueError(f"{list_key} must be a list")
        for entry in output[list_key]:
            if not isinstance(entry, str):
                raise ValueError(f"{list_key} entries must be strings")

    if not isinstance(output["reasoning"], str):
        raise ValueError("reasoning must be a string")

    safety_notice = output["safety_notice"]
    if safety_notice is not None and not isinstance(safety_notice, str):
        raise ValueError("safety_notice must be a string or null")
    if crisis_high and not safety_notice:
        raise ValueError("safety_notice required for crisis path")

    schedule_plan = output["schedule_plan"]
    if not isinstance(schedule_plan, list):
        raise ValueError("schedule_plan must be a list")
    for item in schedule_plan:
        if not isinstance(item, dict):
            raise ValueError("schedule_plan entries must be objects")
        for key in ("title", "start_ts", "end_ts", "duration_min", "category", "why_this_time"):
            if key not in item:
                raise ValueError(f"schedule_plan entry missing {key}")
        if not isinstance(item["title"], str):
            raise ValueError("schedule_plan title must be string")
        if not isinstance(item["start_ts"], str):
            raise ValueError("schedule_plan start_ts must be string")
        if not isinstance(item["end_ts"], str):
            raise ValueError("schedule_plan end_ts must be string")
        if not isinstance(item["duration_min"], int) or item["duration_min"] <= 0:
            raise ValueError("schedule_plan duration_min must be positive integer")
        if not isinstance(item["category"], str):
            raise ValueError("schedule_plan category must be string")
        if not isinstance(item["why_this_time"], str):
            raise ValueError("schedule_plan why_this_time must be string")

    schedule_conflicts = output["schedule_conflicts"]
    if not isinstance(schedule_conflicts, list):
        raise ValueError("schedule_conflicts must be a list")
    for entry in schedule_conflicts:
        if not isinstance(entry, str):
            raise ValueError("schedule_conflicts entries must be strings")

    free_time_summary = output["free_time_summary"]
    if not isinstance(free_time_summary, dict):
        raise ValueError("free_time_summary must be an object")
    for key in ("total_free_min", "largest_window_min", "windows_count"):
        if key not in free_time_summary:
            raise ValueError(f"free_time_summary missing {key}")
        value = free_time_summary[key]
        if not isinstance(value, int) or value < 0:
            raise ValueError(f"free_time_summary {key} must be non-negative integer")
