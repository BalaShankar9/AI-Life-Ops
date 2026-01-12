"""Priority generation and ranking logic for the engine."""

from __future__ import annotations

from typing import Any, Dict, List, Set, Tuple

from life_systems import (
    ActionTemplate,
    COMPLIANCE_CATEGORY,
    DAMAGE_CONTROL_MAX_ITEM_MIN,
    RECOVERY_CATEGORY,
)
from personalization import apply_focus_preference, compute_utility
from schedule import (
    compute_free_windows,
    derive_day_bounds,
    free_time_summary,
    infer_schedule_date,
    normalize_busy_blocks,
    pick_windows_for_actions,
    SPLITTABLE_CATEGORIES,
)


def generate_plan(checkin: dict, flags: dict, profile_context: dict, schedule: dict, personalization: dict = None) -> dict:
    """Generate priorities, next-best actions, and reasoning."""
    if personalization is None:
        personalization = {
            "weights": {"energy": 0.2, "money": 0.2, "obligations": 0.2, "growth": 0.2, "stability": 0.2},
            "risk_aversion": 0.6,
            \"focus_preference\": \"mixed\",
        }
    
    used_context: Set[str] = set()
    damage_control = checkin[\"available_time_hours\"] < 2

    candidates = _build_candidates(checkin, flags, profile_context, used_context)

    if damage_control:
        candidates = [
            action for action in candidates if action.time_estimate_min <= DAMAGE_CONTROL_MAX_ITEM_MIN
        ]

    breakdown = {\"energy\": checkin[\"energy_level\"], \"money\": 20 - checkin[\"money_pressure\"], 
                 \"obligations\": 15, \"growth\": 10, \"stability\": 15}  # approximate baseline
    ranked, personalization_effects = _rank_candidates(candidates, flags, profile_context, personalization, breakdown, used_context)
    priorities, focus_capped = _select_priorities(
        ranked, flags, damage_control, profile_context
    )

    if focus_capped:
        used_context.add("max_daily_focus_blocks")

    schedule_result = _build_schedule(
        priorities, checkin, profile_context, schedule, used_context
    )

    # Apply focus preference to schedule
    schedule_plan = apply_focus_preference(
        schedule_result[\"schedule_plan\"], 
        personalization[\"focus_preference\"]
    )
    schedule_result[\"schedule_plan\"] = schedule_plan

    selected_titles = {item.title for item in priorities}
    next_best_actions = [
        action.title for action in ranked if action.title not in selected_titles
    ][:3]

    avoid_today = _build_avoid_today(flags)
    reasoning = _build_reasoning(
        checkin,
        flags,
        priorities,
        damage_control,
        profile_context,
        used_context,
        schedule_result,
    )
    assumptions = _collect_assumptions(
        priorities, checkin, profile_context, schedule_result
    )
    variability = _collect_variability(priorities)

    return {
        "priorities": schedule_result["priorities"],
        "avoid_today": avoid_today,
        "next_best_actions": next_best_actions,
        "reasoning": reasoning,
        "assumptions": assumptions,
        "variability_notes": variability,
        "used_context": sorted(used_context),
        "schedule_plan": schedule_result["schedule_plan"],
        "schedule_conflicts": schedule_result["schedule_conflicts"],
        "free_time_summary": schedule_result["free_time_summary"],        \"personalization_effects\": personalization_effects,    }


def _build_candidates(
    checkin: dict,
    flags: dict,
    profile_context: dict,
    used_context: Set[str],
) -> List[ActionTemplate]:
    """Generate candidate actions based on risk flags and constraints."""
    actions: List[ActionTemplate] = []

    critical_deadline = checkin["critical_deadline"]
    compliance_domains = _sanitize_domains(profile_context["compliance_domains"])
    domain_label = ", ".join(compliance_domains[:3])

    timing_note = _timing_note(profile_context)
    if timing_note:
        used_context.update(["work_pattern", "wake_window_start", "wake_window_end"])
    used_context.add("timezone")

    # Compliance actions for deadline risk.
    if flags["compliance_risk"] in ("high", "medium") or critical_deadline:
        used_context.add("compliance_domains")
        actions.append(
            ActionTemplate(
                title=f"Resolve compliance items ({domain_label})",
                category=COMPLIANCE_CATEGORY,
                time_estimate_min=30,
                effort=3,
                impact=5,
                why="Targets obligations most likely to trigger compliance risk.",
                assumptions=[
                    "Compliance items can be scoped to a minimum viable action.",
                    f"Focus on {domain_label} first.",
                ],
                variability=["Access to documentation may vary."],
                risk_targets=["compliance_risk", "overload_risk"],
            )
        )
        actions.append(
            ActionTemplate(
                title="Send a compliance status update",
                category=COMPLIANCE_CATEGORY,
                time_estimate_min=15,
                effort=2,
                impact=4,
                why="Prevents silent slippage on compliance commitments.",
                assumptions=["Stakeholders are reachable today."],
                variability=["Response time may vary."],
                risk_targets=["compliance_risk"],
            )
        )

    # Burnout recovery actions.
    if flags["burnout_risk"] in ("high", "medium"):
        actions.append(
            ActionTemplate(
                title="Schedule a 20-minute recovery break",
                category=RECOVERY_CATEGORY,
                time_estimate_min=20,
                effort=1,
                impact=4,
                why=f"Lowers acute stress and protects energy {timing_note}.",
                assumptions=["A short break is feasible today."],
                variability=["Recovery impact varies by environment."],
                risk_targets=["burnout_risk", "overload_risk"],
            )
        )
        actions.append(
            ActionTemplate(
                title="Do a 15-minute reset ritual",
                category=RECOVERY_CATEGORY,
                time_estimate_min=15,
                effort=1,
                impact=3,
                why=f"Creates a calmer baseline before high-stakes work {timing_note}.",
                assumptions=["A quiet space is available."],
                variability=["Impact depends on consistency."],
                risk_targets=["burnout_risk"],
            )
        )

    # Overload management actions.
    if flags["overload_risk"] in ("high", "medium"):
        actions.append(
            ActionTemplate(
                title="Trim today to three outcomes",
                category="planning",
                time_estimate_min=20,
                effort=2,
                impact=4,
                why="Reduces context switching and protects critical work.",
                assumptions=["Tasks can be deferred without severe impact."],
                variability=["External dependencies may limit trimming."],
                risk_targets=["overload_risk"],
            )
        )

    # Financial risk actions.
    if flags["financial_risk"] in ("high", "medium"):
        actions.append(
            ActionTemplate(
                title="Review cash runway and upcoming obligations",
                category="finance",
                time_estimate_min=30,
                effort=3,
                impact=4,
                why="Clarifies near-term constraints for decisions today.",
                assumptions=["Financial data is accessible."],
                variability=["Data freshness may vary."],
                risk_targets=["financial_risk"],
            )
        )

    # Baseline planning actions to keep the day coherent.
    actions.append(
        ActionTemplate(
            title="Confirm the top three outcomes for today",
            category="planning",
            time_estimate_min=20,
            effort=2,
            impact=4,
            why="Anchors the day around the highest-impact outcomes.",
            assumptions=["Priorities can be articulated in one pass."],
            variability=["May require quick stakeholder alignment."],
            risk_targets=["overload_risk"],
        )
    )
    actions.append(
        ActionTemplate(
            title="Protect one focused work block",
            category="focus",
            time_estimate_min=60,
            effort=3,
            impact=5,
            why=f"Secures momentum during your peak window {timing_note}.",
            assumptions=["A focus block can be defended."],
            variability=["Interruptions may reduce effectiveness."],
            risk_targets=["overload_risk", "compliance_risk"],
        )
    )
    actions.append(
        ActionTemplate(
            title="Reserve a secondary focus block if time allows",
            category="focus",
            time_estimate_min=45,
            effort=3,
            impact=4,
            why=f"Adds buffer for deep work {timing_note}.",
            assumptions=["The day can support an extra block."],
            variability=["Meetings may compress availability."],
            risk_targets=["overload_risk"],
        )
    )
    actions.append(
        ActionTemplate(
            title="Clear one blocker that could stall execution",
            category="admin",
            time_estimate_min=20,
            effort=2,
            impact=3,
            why="Removes friction before focused work begins.",
            assumptions=["A blocker is known or discoverable quickly."],
            variability=["Resolution time varies by dependency."],
            risk_targets=["overload_risk"],
        )
    )

    return actions


def _rank_candidates(
    candidates: List[ActionTemplate],
    flags: dict,
    profile_context: dict,
    personalization: dict,
    baseline_breakdown: dict,
    used_context: Set[str],
) -> Tuple[List[ActionTemplate], List[str]]:
    \"\"\"Rank actions by risk reduction, then effort and time, with personalization utility.\"\"\"
    risk_weight = {\"low\": 0, \"medium\": 2, \"high\": 3}
    priority_bias = profile_context[\"priority_bias\"]
    used_context.add(\"priority_bias\")
    
    personalization_effects = []
    highest_risk = max([flags.get(key, \"low\") for key in [\"burnout_risk\", \"financial_risk\", \"compliance_risk\", \"overload_risk\"]])

    def score(action: ActionTemplate) -> Tuple[int, float, int, int, int, str]:
        risk_score = sum(risk_weight.get(flags.get(target, \"low\"), 0) for target in action.risk_targets)
        bias_score = _bias_score(action, priority_bias)
        priority_score = risk_score + bias_score
        
        # Compute personalization utility for tie-breaking
        action_dict = {\"category\": action.category, \"effort\": action.effort}
        utility = compute_utility(action_dict, personalization, baseline_breakdown, highest_risk)
        
        # Lower effort and time is better after risk reduction.
        # Utility is negative so higher utility comes first
        return (-priority_score, -utility, action.effort, action.time_estimate_min, -action.impact, action.title)

    ranked = sorted(candidates, key=score)
    
    # Build personalization effects explanation
    if personalization[\"risk_aversion\"] > 0.7:
        personalization_effects.append(\"High risk aversion: safety-focused actions prioritized.\")    elif personalization["risk_aversion"] < 0.4:
        personalization_effects.append("Low risk aversion: growth-focused actions prioritized.")
    
    # Identify which weight categories are emphasized
    weights = personalization["weights"]
    max_weight = max(weights.values())
    emphasized = [cat for cat, w in weights.items() if w >= max_weight - 0.05]
    if len(emphasized) <= 2:
        personalization_effects.append(f"Emphasis on {', '.join(emphasized)} categories.")
    
    return ranked, personalization_effects

def _bias_score(action: ActionTemplate, priority_bias: str) -> int:
    if priority_bias == "stability_first":
        if action.category in (RECOVERY_CATEGORY, COMPLIANCE_CATEGORY, "planning"):
            return 2
        if action.category == "admin":
            return 1
    if priority_bias == "income_first":
        if action.category in ("finance", COMPLIANCE_CATEGORY):
            return 2
        if action.category == "focus":
            return 1
    if priority_bias == "growth_first":
        if action.category in ("focus", "planning"):
            return 2
    return 0


def _select_priorities(
    ranked: List[ActionTemplate],
    flags: dict,
    damage_control: bool,
    profile_context: dict,
) -> Tuple[List[ActionTemplate], bool]:
    """Pick up to 3 actions while enforcing compliance and recovery requirements."""
    max_priorities = 2 if damage_control else 3
    max_focus_blocks = profile_context["max_daily_focus_blocks"]
    selected: List[ActionTemplate] = []
    focus_count = 0
    focus_capped = False

    if flags["compliance_risk"] == "high":
        compliance_action = _first_by_category(ranked, COMPLIANCE_CATEGORY)
        if compliance_action:
            selected.append(compliance_action)

    if flags["burnout_risk"] == "high":
        recovery_action = _first_by_category(ranked, RECOVERY_CATEGORY)
        if recovery_action and recovery_action not in selected:
            selected.append(recovery_action)

    for action in ranked:
        if len(selected) >= max_priorities:
            break
        if action in selected:
            continue
        if action.category == "focus":
            if focus_count >= max_focus_blocks:
                focus_capped = True
                continue
            focus_count += 1
        selected.append(action)

    return selected, focus_capped


def _first_by_category(ranked: List[ActionTemplate], category: str) -> ActionTemplate | None:
    for action in ranked:
        if action.category == category:
            return action
    return None


def _build_avoid_today(flags: dict) -> List[str]:
    avoid: List[str] = []
    if flags["overload_risk"] in ("high", "medium"):
        avoid.extend([
            "New commitments that are not tied to today",
            "Back-to-back meetings without breaks",
            "Context switching across unrelated tasks",
        ])
    if flags["burnout_risk"] in ("high", "medium"):
        avoid.append("Skipping recovery time")
    if flags["compliance_risk"] == "high":
        avoid.append("Non-essential work that delays compliance items")
    return _dedupe(avoid)


def _build_reasoning(
    checkin: dict,
    flags: dict,
    priorities: List[ActionTemplate],
    damage_control: bool,
    profile_context: dict,
    used_context: Set[str],
    schedule_result: dict,
) -> str:
    reasons: List[str] = []
    if flags["compliance_risk"] == "high":
        reasons.append("compliance risk is high due to critical deadlines")
    if flags["burnout_risk"] == "high":
        reasons.append("burnout risk is high based on sleep, energy, and stress")
    if flags["overload_risk"] == "high":
        reasons.append("overload risk is high relative to available time")
    if flags["financial_risk"] == "high":
        reasons.append("financial pressure is high")

    if damage_control:
        reasons.append("available time is under two hours, so the plan is compressed")

    if schedule_result["schedule_used"]:
        reasons.append("calendar busy blocks were used to place time blocks")
    if schedule_result["compressed"]:
        reasons.append("the plan was compressed to fit the available windows")
        if schedule_result["compression_notes"]:
            reasons.append(schedule_result["compression_notes"][0])
    if schedule_result["schedule_conflicts"]:
        conflict = schedule_result["schedule_conflicts"][0]
        reasons.append(f"conflict noted: {conflict}")

    context_reason = _context_reason(profile_context, used_context)
    if context_reason:
        reasons.append(context_reason)

    if not reasons:
        reasons.append("risk signals are moderate, so the plan emphasizes steady execution")

    selected_titles = ", ".join(action.title for action in priorities)
    return (
        "Best-next actions are selected from today's inputs to reduce risk and stay feasible. "
        "Expected impact varies with execution conditions. "
        + "; ".join(reasons)
        + f". Priorities: {selected_titles}."
    )


def _context_reason(profile_context: dict, used_context: Set[str]) -> str:
    notes: List[str] = []
    if "work_pattern" in used_context:
        notes.append(f"aligned to your {profile_context['work_pattern']} work pattern")
    if "wake_window_start" in used_context:
        notes.append(
            f"keeps focus within your wake window {profile_context['wake_window_start']}-{profile_context['wake_window_end']}"
        )
    if "max_daily_focus_blocks" in used_context:
        notes.append(
            f"caps deep work at {profile_context['max_daily_focus_blocks']} focus blocks"
        )
    if "priority_bias" in used_context:
        notes.append(f"biases decisions toward {profile_context['priority_bias'].replace('_', ' ')}")
    if "compliance_domains" in used_context:
        domain_label = ", ".join(_sanitize_domains(profile_context["compliance_domains"]))
        notes.append(f"targets compliance domains: {domain_label}")
    if "calendar_busy_blocks" in used_context:
        notes.append("respects calendar busy blocks")

    if notes:
        return " and ".join(notes)
    return ""


def _collect_assumptions(
    priorities: List[ActionTemplate],
    checkin: dict,
    profile_context: dict,
    schedule_result: dict,
) -> List[str]:
    assumptions: List[str] = []
    assumptions.append("Available time is accurate for today.")
    assumptions.append("Deadline count reflects all commitments due today.")
    assumptions.append(f"Wake window is {profile_context['wake_window_start']}-{profile_context['wake_window_end']}.")
    if schedule_result["schedule_used"]:
        assumptions.append("Calendar busy blocks reflect today's commitments.")
    if not checkin.get("notes"):
        assumptions.append("No additional constraints beyond the inputs.")

    for action in priorities:
        assumptions.extend(action.assumptions)

    return _dedupe(assumptions)


def _collect_variability(priorities: List[ActionTemplate]) -> List[str]:
    variability: List[str] = []
    for action in priorities:
        variability.extend(action.variability)
    return _dedupe(variability)


def _timing_note(profile_context: dict) -> str:
    work_pattern = profile_context["work_pattern"]
    window = f"{profile_context['wake_window_start']}-{profile_context['wake_window_end']}"
    if work_pattern == "night":
        return f"after your night shift window ({window})"
    if work_pattern == "mixed":
        return f"inside your clearest wake window ({window})"
    if work_pattern == "unemployed":
        return f"inside your preferred wake window ({window})"
    return f"during your day shift window ({window})"


def _sanitize_domains(domains: List[str]) -> List[str]:
    cleaned = [domain.strip() for domain in domains if domain.strip()]
    return cleaned or ["compliance"]


def _dedupe(items: List[str]) -> List[str]:
    seen = set()
    result: List[str] = []
    for item in items:
        if item not in seen:
            seen.add(item)
            result.append(item)
    return result


def _build_schedule(
    priorities: List[ActionTemplate],
    checkin: dict,
    profile_context: dict,
    schedule: dict,
    used_context: Set[str],
) -> dict:
    timezone = schedule["timezone"]
    busy_blocks = schedule.get("busy_blocks", [])

    if busy_blocks:
        used_context.add("calendar_busy_blocks")
    used_context.add("schedule_timezone")

    schedule_date = infer_schedule_date(busy_blocks, timezone)
    day_bounds = derive_day_bounds(profile_context, timezone, schedule_date)
    merged_busy = normalize_busy_blocks(busy_blocks, timezone)
    free_windows = compute_free_windows(day_bounds, merged_busy)
    summary = free_time_summary(free_windows)

    actions = _build_action_payloads(priorities)
    schedule_plan, conflicts, assigned = pick_windows_for_actions(actions, free_windows)

    compressed = False
    compression_notes: List[str] = []
    total_required = sum(action["time_estimate_min"] for action in actions)
    if total_required > summary["total_free_min"] or conflicts:
        compressed_actions, compression_notes = _compress_actions(
            actions, summary, priorities
        )
        schedule_plan, conflicts, assigned = pick_windows_for_actions(
            compressed_actions, free_windows
        )
        actions = compressed_actions
        compressed = any(action.get("compressed") for action in actions)

    priorities_output = _build_priorities_output(priorities, actions, assigned)

    return {
        "priorities": priorities_output,
        "schedule_plan": schedule_plan,
        "schedule_conflicts": conflicts,
        "free_time_summary": summary,
        "schedule_used": len(busy_blocks) > 0,
        "compressed": compressed,
        "compression_notes": compression_notes,
    }


def _build_action_payloads(priorities: List[ActionTemplate]) -> List[Dict[str, Any]]:
    actions: List[Dict[str, Any]] = []
    for action in priorities:
        actions.append(
            {
                "title": action.title,
                "category": action.category,
                "time_estimate_min": action.time_estimate_min,
                "original_time_estimate_min": action.time_estimate_min,
                "split_allowed": action.category in SPLITTABLE_CATEGORIES,
                "compressed": False,
            }
        )
    return actions


def _build_priorities_output(
    priorities: List[ActionTemplate],
    actions: List[Dict[str, Any]],
    assigned: Dict[str, int],
) -> List[Dict[str, Any]]:
    duration_by_title = {
        action["title"]: action["time_estimate_min"] for action in actions
    }
    output: List[Dict[str, Any]] = []
    for action in priorities:
        payload = action.to_output()
        if action.title in duration_by_title:
            payload["time_estimate_min"] = duration_by_title[action.title]
        output.append(payload)
    return output


def _compress_actions(
    actions: List[Dict[str, Any]],
    summary: Dict[str, int],
    priorities: List[ActionTemplate],
) -> Tuple[List[Dict[str, Any]], List[str]]:
    compressed = [dict(action) for action in actions]
    notes: List[str] = []
    total_free = summary["total_free_min"]
    largest_window = summary["largest_window_min"]

    for action in compressed:
        action["min_duration"] = _min_duration(action["category"])

    def compress_priority(action: Dict[str, Any]) -> int:
        category = action["category"]
        if category == "focus":
            return 0
        if category == "planning":
            return 1
        if category == "finance":
            return 2
        if category == "admin":
            return 3
        if category in (COMPLIANCE_CATEGORY, RECOVERY_CATEGORY):
            return 4
        return 5

    excess = sum(action["time_estimate_min"] for action in compressed) - total_free
    if excess > 0:
        for action in sorted(compressed, key=compress_priority):
            if excess <= 0:
                break
            current = action["time_estimate_min"]
            minimum = action["min_duration"]
            if current <= minimum:
                continue
            reduction = min(current - minimum, excess)
            action["time_estimate_min"] = current - reduction
            excess -= reduction

    if largest_window > 0:
        for action in compressed:
            if action["split_allowed"]:
                continue
            if action["time_estimate_min"] > largest_window:
                action["time_estimate_min"] = max(
                    action["min_duration"], largest_window
                )

    for action in compressed:
        if action["time_estimate_min"] < action["original_time_estimate_min"]:
            action["compressed"] = True
            notes.append(
                f"Compressed {action['title']} to {action['time_estimate_min']} min."
            )

    if notes:
        priorities_titles = ", ".join(item.title for item in priorities)
        notes.append(f"Compression applied across priorities: {priorities_titles}.")

    return compressed, notes


def _min_duration(category: str) -> int:
    if category == COMPLIANCE_CATEGORY:
        return 15
    if category == RECOVERY_CATEGORY:
        return 10
    if category == "admin":
        return 10
    if category == "planning":
        return 15
    if category == "finance":
        return 20
    if category == "focus":
        return 30
    return 15
