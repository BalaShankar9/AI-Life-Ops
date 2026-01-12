"""System definitions and shared constants for the engine."""

from __future__ import annotations

from dataclasses import dataclass
from typing import List

# Canonical system keys used across scoring and invariants.
SYSTEM_KEYS = ("energy", "money", "obligations", "growth", "stability")

# Risk levels are ordered from lowest to highest.
RISK_LEVELS = ("low", "medium", "high")

# Categories are used to enforce priority invariants.
COMPLIANCE_CATEGORY = "compliance"
RECOVERY_CATEGORY = "recovery"

# Damage control mode constraints when time is extremely limited.
DAMAGE_CONTROL_MAX_TOTAL_MIN = 60
DAMAGE_CONTROL_MAX_ITEM_MIN = 30


@dataclass(frozen=True)
class ActionTemplate:
    """Action candidate used by the planner before ranking."""

    title: str
    category: str
    time_estimate_min: int
    effort: int
    impact: int
    why: str
    assumptions: List[str]
    variability: List[str]
    risk_targets: List[str]

    def to_output(self) -> dict:
        """Return the public priority schema without internal ranking fields."""
        return {
            "title": self.title,
            "category": self.category,
            "time_estimate_min": self.time_estimate_min,
            "effort": self.effort,
            "impact": self.impact,
            "why": self.why,
            "assumptions": list(self.assumptions),
            "variability": list(self.variability),
        }
