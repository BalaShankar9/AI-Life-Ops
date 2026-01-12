"""Weekly review generator based on stored daily snapshots."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple

from life_systems import RISK_LEVELS, SYSTEM_KEYS

FLAG_KEYS = ("burnout_risk", "financial_risk", "compliance_risk", "overload_risk")
RISK_ORDER = {"low": 0, "medium": 1, "high": 2}

_DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_TIME_PATTERN = re.compile(r"^\d{2}:\d{2}$")
_TIMEZONE_PATTERN = re.compile(r"^(UTC|[A-Za-z_]+\/[A-Za-z_]+)$")
_WORK_PATTERNS = {"day", "night", "mixed", "unemployed"}
_PRIORITY_BIASES = {"stability_first", "income_first", "growth_first"}


RISK_EXPLANATIONS = {
    "burnout_risk": "Sustained burnout risk erodes execution quality and recovery.",
    "financial_risk": "Persistent financial pressure constrains optionality.",
    "compliance_risk": "Compliance slippage compounds risk quickly.",
    "overload_risk": "Overload reduces follow-through on critical work.",
}


def generate_weekly_review(
    weekly_snapshots: List[Dict[str, Any]],
    profile_context: Dict[str, Any],
    week_range_override: Dict[str, str] | None = None,
) -> Dict[str, Any]:
    """Generate a deterministic weekly review from stored snapshot data."""
    normalized_profile = _validate_profile_context(profile_context)
    snapshots = [_normalize_snapshot(item) for item in weekly_snapshots]
    snapshots.sort(key=lambda item: item["date"])

    week_range = _derive_week_range(snapshots)
    if week_range_override:
        week_range = week_range_override
    score_trend = _score_trend(snapshots)
    breakdown_trends = _breakdown_trends(snapshots)
    top_risks = _top_risks(snapshots)
    wins, misses = _wins_and_misses(snapshots, score_trend)
    most_effective = _most_effective_actions(snapshots)
    recurring_bottlenecks = _recurring_bottlenecks(snapshots)
    next_week_focus = _next_week_focus(
        snapshots, normalized_profile, top_risks, recurring_bottlenecks
    )
    confidence = _confidence(snapshots)
    confidence_reasons = _confidence_reasons(snapshots)
    variability_notes = _variability_notes(snapshots)
    assumptions = _assumptions(week_range, normalized_profile, len(snapshots))
    summary = _summary(
        week_range,
        score_trend,
        breakdown_trends,
        top_risks,
        normalized_profile,
        len(snapshots),
    )

    return {
        "week_range": week_range,
        "summary": summary,
        "score_trend": score_trend,
        "breakdown_trends": breakdown_trends,
        "top_risks": top_risks,
        "wins": wins,
        "misses": misses,
        "most_effective_actions": most_effective,
        "recurring_bottlenecks": recurring_bottlenecks,
        "next_week_focus": next_week_focus,
        "confidence": confidence,
        "confidence_reasons": confidence_reasons,
        "variability_notes": variability_notes,
        "assumptions": assumptions,
    }


def validate_weekly_payload(payload: Any) -> Tuple[List[Dict[str, Any]], Dict[str, Any], Dict[str, str] | None]:
    if not isinstance(payload, dict):
        raise ValueError("Payload must be an object")

    snapshots = payload.get("weekly_snapshots")
    profile_context = payload.get("profile_context")
    if not isinstance(snapshots, list):
        raise ValueError("weekly_snapshots must be a list")
    if not isinstance(profile_context, dict):
        raise ValueError("profile_context must be an object")

    week_range = payload.get("week_range")
    if week_range is not None:
        if not isinstance(week_range, dict):
            raise ValueError("week_range must be an object if provided")
        start = week_range.get("start")
        end = week_range.get("end")
        if not isinstance(start, str) or not _DATE_PATTERN.match(start):
            raise ValueError("week_range.start must be YYYY-MM-DD")
        if not isinstance(end, str) or not _DATE_PATTERN.match(end):
            raise ValueError("week_range.end must be YYYY-MM-DD")
        week_range = {"start": start, "end": end}

    return snapshots, profile_context, week_range


def _normalize_snapshot(item: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(item, dict):
        raise ValueError("Snapshot entries must be objects")

    date = item.get("date")
    if not isinstance(date, str) or not _DATE_PATTERN.match(date):
        raise ValueError("Snapshot date must be YYYY-MM-DD")

    score = _parse_int(item.get("life_stability_score"), "life_stability_score", 0, 100)

    breakdown = item.get("breakdown")
    if not isinstance(breakdown, dict):
        raise ValueError("breakdown must be an object")
    normalized_breakdown: Dict[str, int] = {}
    for key in SYSTEM_KEYS:
        value = breakdown.get(key)
        normalized_breakdown[key] = _parse_int(value, f"breakdown.{key}", 0, 20)

    flags = item.get("flags")
    if not isinstance(flags, dict):
        raise ValueError("flags must be an object")
    normalized_flags: Dict[str, str] = {}
    for key in FLAG_KEYS:
        value = flags.get(key)
        if value not in RISK_LEVELS:
            raise ValueError(f"flags.{key} must be low, medium, or high")
        normalized_flags[key] = value

    priorities = item.get("priorities", [])
    if priorities is None:
        priorities = []
    if not isinstance(priorities, list):
        raise ValueError("priorities must be a list")

    normalized_priorities: List[Dict[str, str]] = []
    for entry in priorities:
        if not isinstance(entry, dict):
            continue
        title = entry.get("title")
        category = entry.get("category")
        if isinstance(title, str) and title.strip() and isinstance(category, str):
            normalized_priorities.append(
                {"title": title.strip(), "category": category.strip()}
            )

    return {
        "date": date,
        "life_stability_score": score,
        "breakdown": normalized_breakdown,
        "flags": normalized_flags,
        "priorities": normalized_priorities,
    }


def _validate_profile_context(profile_context: Dict[str, Any]) -> Dict[str, Any]:
    timezone = _parse_string(profile_context.get("timezone"), "timezone")
    if not _TIMEZONE_PATTERN.match(timezone):
        raise ValueError("timezone must be a valid IANA string")

    wake_start = _parse_time(profile_context.get("wake_window_start"), "wake_window_start")
    wake_end = _parse_time(profile_context.get("wake_window_end"), "wake_window_end")
    sleep_start = _parse_time(profile_context.get("sleep_window_start"), "sleep_window_start")
    sleep_end = _parse_time(profile_context.get("sleep_window_end"), "sleep_window_end")

    work_pattern = _parse_string(profile_context.get("work_pattern"), "work_pattern")
    if work_pattern not in _WORK_PATTERNS:
        raise ValueError("work_pattern must be a valid enum")

    max_blocks = _parse_int(
        profile_context.get("max_daily_focus_blocks"),
        "max_daily_focus_blocks",
        1,
        4,
    )

    priority_bias = _parse_string(profile_context.get("priority_bias"), "priority_bias")
    if priority_bias not in _PRIORITY_BIASES:
        raise ValueError("priority_bias must be a valid enum")

    compliance_domains = profile_context.get("compliance_domains")
    if not isinstance(compliance_domains, list):
        raise ValueError("compliance_domains must be a list")

    cleaned_domains = [domain.strip() for domain in compliance_domains if isinstance(domain, str)]
    cleaned_domains = [domain for domain in cleaned_domains if domain]
    if not cleaned_domains:
        raise ValueError("compliance_domains must include at least one item")

    return {
        "timezone": timezone,
        "wake_window_start": wake_start,
        "wake_window_end": wake_end,
        "sleep_window_start": sleep_start,
        "sleep_window_end": sleep_end,
        "work_pattern": work_pattern,
        "max_daily_focus_blocks": max_blocks,
        "priority_bias": priority_bias,
        "compliance_domains": cleaned_domains,
    }


def _derive_week_range(snapshots: List[Dict[str, Any]]) -> Dict[str, str]:
    if not snapshots:
        return {"start": "1970-01-01", "end": "1970-01-01"}
    return {"start": snapshots[0]["date"], "end": snapshots[-1]["date"]}


def _score_trend(snapshots: List[Dict[str, Any]]) -> Dict[str, int]:
    if not snapshots:
        return {"start_score": 0, "end_score": 0, "delta": 0}
    start = snapshots[0]["life_stability_score"]
    end = snapshots[-1]["life_stability_score"]
    return {"start_score": start, "end_score": end, "delta": end - start}


def _breakdown_trends(snapshots: List[Dict[str, Any]]) -> Dict[str, Dict[str, int]]:
    if not snapshots:
        return {key: {"start": 0, "end": 0, "delta": 0} for key in SYSTEM_KEYS}

    start = snapshots[0]["breakdown"]
    end = snapshots[-1]["breakdown"]
    trends: Dict[str, Dict[str, int]] = {}
    for key in SYSTEM_KEYS:
        trends[key] = {
            "start": start[key],
            "end": end[key],
            "delta": end[key] - start[key],
        }
    return trends


def _top_risks(snapshots: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not snapshots:
        return []

    counts = {key: 0 for key in FLAG_KEYS}
    for snapshot in snapshots:
        for key in FLAG_KEYS:
            level = snapshot["flags"][key]
            if level in ("medium", "high"):
                counts[key] += 1

    recurring = [
        {"flag": key, "frequency": counts[key]}
        for key in FLAG_KEYS
        if counts[key] >= 2
    ]

    if not recurring:
        recurring = [
            {"flag": key, "frequency": counts[key]}
            for key in FLAG_KEYS
            if counts[key] > 0
        ]

    recurring.sort(key=lambda item: (-item["frequency"], item["flag"]))
    top = recurring[:3]

    return [
        {
            "flag": item["flag"],
            "frequency": item["frequency"],
            "why_it_matters": RISK_EXPLANATIONS[item["flag"]],
        }
        for item in top
    ]


def _wins_and_misses(
    snapshots: List[Dict[str, Any]],
    score_trend: Dict[str, int],
) -> Tuple[List[str], List[str]]:
    wins: List[str] = []
    misses: List[str] = []

    if not snapshots:
        return wins, misses

    delta = score_trend["delta"]
    if delta > 0:
        wins.append(f"Stability score improved by {delta} points.")
    elif delta < 0:
        misses.append(f"Stability score dropped by {abs(delta)} points.")

    start_flags = snapshots[0]["flags"]
    end_flags = snapshots[-1]["flags"]

    for key in FLAG_KEYS:
        start_level = RISK_ORDER[start_flags[key]]
        end_level = RISK_ORDER[end_flags[key]]
        if end_level < start_level:
            wins.append(
                f"{_flag_label(key)} eased from {start_flags[key]} to {end_flags[key]}."
            )
        elif end_level > start_level:
            misses.append(
                f"{_flag_label(key)} rose from {start_flags[key]} to {end_flags[key]}."
            )

    low_risk_days = sum(
        1
        for snapshot in snapshots
        if all(snapshot["flags"][key] == "low" for key in FLAG_KEYS)
    )
    if low_risk_days >= 2:
        wins.append(f"{low_risk_days} days stayed fully low-risk.")

    return _unique_preserve(wins), _unique_preserve(misses)


def _most_effective_actions(snapshots: List[Dict[str, Any]]) -> List[str]:
    if len(snapshots) < 2:
        return []

    candidates: Dict[str, int] = {}
    for index in range(1, len(snapshots)):
        prev = snapshots[index - 1]
        curr = snapshots[index]
        if curr["life_stability_score"] <= prev["life_stability_score"]:
            continue
        for item in prev["priorities"]:
            title = item["title"]
            candidates[title] = candidates.get(title, 0) + 1

    if not candidates:
        for snapshot in snapshots:
            for item in snapshot["priorities"]:
                title = item["title"]
                candidates[title] = candidates.get(title, 0) + 1

    ranked = sorted(candidates.items(), key=lambda item: (-item[1], item[0]))
    return [title for title, _count in ranked[:3]]


def _recurring_bottlenecks(snapshots: List[Dict[str, Any]]) -> List[str]:
    if not snapshots:
        return []

    counts = {key: 0 for key in FLAG_KEYS}
    for snapshot in snapshots:
        for key in FLAG_KEYS:
            if snapshot["flags"][key] in ("medium", "high"):
                counts[key] += 1

    bottlenecks = [
        f"{_flag_label(key)} appeared on {counts[key]} days."
        for key in FLAG_KEYS
        if counts[key] >= 2
    ]

    return _unique_preserve(bottlenecks)


def _next_week_focus(
    snapshots: List[Dict[str, Any]],
    profile_context: Dict[str, Any],
    top_risks: List[Dict[str, Any]],
    recurring_bottlenecks: List[str],
) -> List[Dict[str, str]]:
    bias = profile_context["priority_bias"]
    domains = ", ".join(profile_context["compliance_domains"][:3])

    focus_templates = {
        "burnout_risk": {
            "title": "Protect recovery windows",
            "why": "Burnout risk showed up repeatedly this week.",
            "target": "Schedule 2 recovery blocks (20+ min) on at least 4 days.",
        },
        "financial_risk": {
            "title": "Stabilize cash runway",
            "why": "Financial pressure stayed elevated across the week.",
            "target": "Review runway twice and lock one revenue action by midweek.",
        },
        "compliance_risk": {
            "title": "Close compliance loop",
            "why": "Compliance risk needs steady attention to avoid compounding.",
            "target": f"Complete one {domains} item on 2 separate days.",
        },
        "overload_risk": {
            "title": "Reduce daily scope",
            "why": "Overload signals were persistent this week.",
            "target": "Limit each day to 3 outcomes and a single focus block.",
        },
    }

    focus_items: List[Dict[str, str]] = []
    for risk in top_risks:
        template = focus_templates.get(risk["flag"])
        if template:
            focus_items.append(template)

    if bias == "income_first" and not any(
        item["title"] in ("Stabilize cash runway", "Close compliance loop")
        for item in focus_items
    ):
        focus_items.insert(0, focus_templates["financial_risk"])

    if bias == "growth_first" and not any(
        item["title"] == "Protect deep work blocks" for item in focus_items
    ):
        focus_items.insert(
            0,
            {
                "title": "Protect deep work blocks",
                "why": "Growth focus benefits from protected, uninterrupted work time.",
                "target": "Reserve 2 focus blocks on 3 days next week.",
            },
        )

    if bias == "stability_first" and not focus_items:
        focus_items.append(focus_templates["burnout_risk"])

    if recurring_bottlenecks and not focus_items:
        focus_items.append(focus_templates["overload_risk"])

    deduped: List[Dict[str, str]] = []
    seen_titles = set()
    for item in focus_items:
        if item["title"] in seen_titles:
            continue
        seen_titles.add(item["title"])
        deduped.append(item)

    return deduped[:3]


def _confidence(snapshots: List[Dict[str, Any]]) -> float:
    count = len(snapshots)
    if count < 3:
        return 0.3
    base = 0.5 + 0.05 * count
    return min(base, 0.9)


def _confidence_reasons(snapshots: List[Dict[str, Any]]) -> List[str]:
    count = len(snapshots)
    reasons: List[str] = []
    if count < 3:
        reasons.append("Fewer than 3 snapshots this week; confidence reduced.")
    else:
        reasons.append("Snapshot coverage supports a directional trend read.")
    reasons.append("Weekly review is derived only from stored snapshots.")
    return reasons


def _variability_notes(snapshots: List[Dict[str, Any]]) -> List[str]:
    count = len(snapshots)
    notes = [
        "Weekly trends are directional; day-to-day conditions can vary.",
        "Missing days can shift trend strength.",
    ]
    if count < 3:
        notes.append("Low data week increases variability.")
    return _unique_preserve(notes)


def _assumptions(
    week_range: Dict[str, str],
    profile_context: Dict[str, Any],
    snapshot_count: int,
) -> List[str]:
    assumptions = [
        "Weekly review is derived only from stored daily snapshots.",
        f"Week range spans {week_range['start']} to {week_range['end']} (UTC).",
        f"Priority bias used: {profile_context['priority_bias']}.",
        "Compliance domains considered: "
        + ", ".join(profile_context["compliance_domains"][:3]),
    ]
    if snapshot_count < 3:
        assumptions.append("Low snapshot volume reduces confidence.")
    return assumptions


def _summary(
    week_range: Dict[str, str],
    score_trend: Dict[str, int],
    breakdown_trends: Dict[str, Dict[str, int]],
    top_risks: List[Dict[str, Any]],
    profile_context: Dict[str, Any],
    snapshot_count: int,
) -> str:
    parts: List[str] = []
    parts.append(
        f"Week {week_range['start']} to {week_range['end']} includes {snapshot_count} snapshot(s)."
    )

    delta = score_trend["delta"]
    if delta > 0:
        parts.append(f"Stability score rose by {delta} points.")
    elif delta < 0:
        parts.append(f"Stability score fell by {abs(delta)} points.")
    else:
        parts.append("Stability score stayed flat.")

    movers = sorted(
        breakdown_trends.items(),
        key=lambda item: abs(item[1]["delta"]),
        reverse=True,
    )
    if movers:
        top = movers[:2]
        change_notes = [
            f"{key} {item['delta']:+d}" for key, item in top if item["delta"] != 0
        ]
        if change_notes:
            parts.append("Biggest shifts came from " + ", ".join(change_notes) + ".")

    if top_risks:
        risks = ", ".join(
            f"{_flag_label(item['flag'])} ({item['frequency']} days)"
            for item in top_risks
        )
        parts.append(f"Recurring risks: {risks}.")
    else:
        parts.append("No recurring high risks; flags were intermittent.")

    bias_label = profile_context["priority_bias"].replace("_", " ")
    domains = ", ".join(profile_context["compliance_domains"][:3])
    parts.append(
        f"Next-week focus aligns to {bias_label} and compliance domains: {domains}."
    )

    if snapshot_count < 3:
        parts.append("Low data week; treat recommendations as directional.")

    return " ".join(parts)


def _flag_label(flag: str) -> str:
    return flag.replace("_", " ").capitalize()


def _unique_preserve(items: List[str]) -> List[str]:
    seen = set()
    result: List[str] = []
    for item in items:
        if item not in seen:
            seen.add(item)
            result.append(item)
    return result


def _parse_int(value: Any, label: str, minimum: int, maximum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{label} must be a number")
    if isinstance(value, float) and not value.is_integer():
        raise ValueError(f"{label} must be an integer")
    value = int(value)
    if value < minimum or value > maximum:
        raise ValueError(f"{label} must be between {minimum} and {maximum}")
    return value


def _parse_string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} must be a non-empty string")
    return value.strip()


def _parse_time(value: Any, label: str) -> str:
    text = _parse_string(value, label)
    if not _TIME_PATTERN.match(text):
        raise ValueError(f"{label} must use HH:MM format")
    return text
