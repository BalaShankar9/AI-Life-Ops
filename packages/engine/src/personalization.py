"""Bounded learning for deterministic personalization."""

from __future__ import annotations

from typing import Any, Dict, List, Tuple

# Personalization constraints
MIN_WEIGHT = 0.05
MAX_WEIGHT = 0.40
MAX_WEIGHT_CHANGE_PER_UPDATE = 0.03
MIN_FEEDBACK_COUNT = 8

DIMENSIONS = ["energy", "money", "obligations", "growth", "stability"]


def normalize_weights(weights: Dict[str, float]) -> Dict[str, float]:
    """Normalize weights to sum to 1.0, clamping each to [MIN_WEIGHT, MAX_WEIGHT]."""
    clamped = {dim: max(MIN_WEIGHT, min(MAX_WEIGHT, weights.get(dim, 0.2))) for dim in DIMENSIONS}
    total = sum(clamped.values())
    if total == 0:
        return {dim: 0.2 for dim in DIMENSIONS}
    return {dim: clamped[dim] / total for dim in DIMENSIONS}


def validate_weights(weights: Dict[str, float]) -> bool:
    """Check if weights are valid (all present, in range, sum close to 1)."""
    if not all(dim in weights for dim in DIMENSIONS):
        return False
    if not all(MIN_WEIGHT <= weights[dim] <= MAX_WEIGHT for dim in DIMENSIONS):
        return False
    total = sum(weights[dim] for dim in DIMENSIONS)
    return 0.95 <= total <= 1.05


def update_weights_from_feedback(
    current_weights: Dict[str, float],
    feedback_entries: List[Dict[str, Any]],
    baseline_scores: Dict[str, int],
) -> Tuple[Dict[str, float], List[str]]:
    """
    Deterministically update weights based on feedback.
    
    Rules:
    - Only small adjustments per run (max MAX_WEIGHT_CHANGE_PER_UPDATE per weight)
    - Clamp weights [MIN_WEIGHT, MAX_WEIGHT]
    - Re-normalize to sum 1
    - Only adjust if enough feedback exists (>= MIN_FEEDBACK_COUNT)
    - Returns (new_weights, reasons)
    """
    if len(feedback_entries) < MIN_FEEDBACK_COUNT:
        return current_weights, [
            f"Insufficient feedback ({len(feedback_entries)}/{MIN_FEEDBACK_COUNT} needed) - no weight adjustments made."
        ]

    # Categorize feedback by action category and outcome
    category_stats: Dict[str, Dict[str, int]] = {}
    for entry in feedback_entries:
        category = entry.get("action_category", "unknown")
        feedback_type = entry.get("feedback", "neutral")
        scheduled = entry.get("scheduled", False)
        
        if category not in category_stats:
            category_stats[category] = {"helped": 0, "neutral": 0, "did_not_help": 0, "total": 0}
        
        category_stats[category][feedback_type] = category_stats[category].get(feedback_type, 0) + 1
        category_stats[category]["total"] += 1

    # Map categories to dimensions
    category_to_dimension = {
        "energy": "energy",
        "recovery": "energy",
        "rest": "energy",
        "money": "money",
        "income": "money",
        "expense": "money",
        "admin": "obligations",
        "compliance": "obligations",
        "urgent": "obligations",
        "growth": "growth",
        "learning": "growth",
        "skill": "growth",
        "stability": "stability",
        "foundation": "stability",
        "safety": "stability",
    }

    # Calculate adjustments based on feedback signals
    adjustments = {dim: 0.0 for dim in DIMENSIONS}
    reasons = []

    for category, stats in category_stats.items():
        dimension = category_to_dimension.get(category)
        if not dimension:
            continue

        total = stats["total"]
        if total == 0:
            continue

        helped_ratio = stats["helped"] / total
        hurt_ratio = stats["did_not_help"] / total

        # If actions in this category helped consistently, increase weight slightly
        if helped_ratio >= 0.6:
            adjustment = min(0.02, helped_ratio * 0.03)
            adjustments[dimension] += adjustment
            reasons.append(
                f"Increased {dimension.capitalize()} weight: '{category}' actions were helpful ({int(helped_ratio*100)}%)."
            )

        # If actions in this category didn't help, decrease weight slightly
        elif hurt_ratio >= 0.5:
            adjustment = -min(0.02, hurt_ratio * 0.03)
            adjustments[dimension] += adjustment
            reasons.append(
                f"Decreased {dimension.capitalize()} weight: '{category}' actions were not helpful ({int(hurt_ratio*100)}%)."
            )

    # Incorporate baseline scores: boost dimensions where user is scoring low
    # (more room for improvement likely means actions there have higher value)
    for dim in DIMENSIONS:
        if baseline_scores.get(dim, 15) < 12:
            adjustments[dim] += 0.01
            if adjustments[dim] > 0:
                reasons.append(
                    f"Slightly increased {dim.capitalize()} weight due to low baseline score ({baseline_scores.get(dim, 0)})."
                )

    # Apply bounded adjustments
    new_weights = {}
    for dim in DIMENSIONS:
        old_weight = current_weights.get(dim, 0.2)
        adjustment = max(-MAX_WEIGHT_CHANGE_PER_UPDATE, min(MAX_WEIGHT_CHANGE_PER_UPDATE, adjustments[dim]))
        new_weights[dim] = old_weight + adjustment

    # Normalize and clamp
    new_weights = normalize_weights(new_weights)

    if not reasons:
        reasons.append("No significant patterns detected in feedback; weights unchanged.")
        return current_weights, reasons

    return new_weights, reasons


def compute_utility(
    action: Dict[str, Any],
    personalization: Dict[str, Any],
    baseline_breakdown: Dict[str, int],
    risk_level: str,
) -> float:
    """
    Compute a deterministic utility score for ranking tie-breaking.
    
    utility = (risk_reduction_benefit * risk_aversion_weight) 
              + (system_boost based on weights) 
              - (effort_cost)
    
    Higher utility = higher priority in tie-breaks.
    """
    weights = personalization.get("weights", {dim: 0.2 for dim in DIMENSIONS})
    risk_aversion = personalization.get("risk_aversion", 0.6)

    # Risk reduction benefit: high if action reduces a high risk
    risk_reduction_benefit = 0.0
    if risk_level in ["high", "medium"]:
        risk_reduction_benefit = 3.0 if risk_level == "high" else 1.5

    # System boost: favor actions that target low subsystems weighted heavily by user
    category = action.get("category", "general")
    category_to_dimension = {
        "energy": "energy",
        "recovery": "energy",
        "money": "money",
        "income": "money",
        "admin": "obligations",
        "compliance": "obligations",
        "growth": "growth",
        "learning": "growth",
        "stability": "stability",
        "foundation": "stability",
    }
    dimension = category_to_dimension.get(category, "stability")
    
    baseline_score = baseline_breakdown.get(dimension, 15)
    dimension_weight = weights.get(dimension, 0.2)
    
    # Boost if: low baseline score AND high user weight for that dimension
    system_boost = 0.0
    if baseline_score < 15:
        system_boost = (15 - baseline_score) * dimension_weight * 0.5

    # Effort cost
    effort = action.get("effort", 3)
    effort_cost = effort * 0.3

    utility = (risk_reduction_benefit * risk_aversion) + system_boost - effort_cost
    return utility


def apply_focus_preference(
    schedule_plan: List[Dict[str, Any]], focus_preference: str
) -> List[Dict[str, Any]]:
    """
    Apply focus preference to schedule plan.
    
    - deep_work: prefer fewer, longer blocks; avoid splitting; prioritize growth
    - light_tasks: prefer short tasks; allow more splitting
    - mixed: current behavior (no change)
    """
    if focus_preference == "mixed":
        return schedule_plan

    modified_plan = []
    for item in schedule_plan:
        category = item.get("category", "general")
        time_estimate = item.get("time_estimate_min", 30)

        if focus_preference == "deep_work":
            # Prefer longer blocks for growth/learning
            if category in ["growth", "learning"] and time_estimate < 60:
                item = {**item, "time_estimate_min": min(90, time_estimate * 1.5)}
                item["scheduling_notes"] = item.get("scheduling_notes", []) + [
                    "Extended block for deep focus (per user preference)."
                ]
            # Avoid splitting admin tasks
            if category in ["admin", "compliance"]:
                item["scheduling_notes"] = item.get("scheduling_notes", []) + [
                    "Batch with similar tasks if possible."
                ]

        elif focus_preference == "light_tasks":
            # Prefer shorter blocks
            if time_estimate > 45:
                item = {**item, "time_estimate_min": max(20, time_estimate * 0.7)}
                item["scheduling_notes"] = item.get("scheduling_notes", []) + [
                    "Shortened for lighter task preference."
                ]

        modified_plan.append(item)

    return modified_plan
