import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from engine import run_engine_mode


def _baseline_input():
    return {
        "checkin": {
            "sleep_hours": 7,
            "energy_level": 6,
            "stress_level": 4,
            "money_pressure": 5,
            "today_deadlines_count": 2,
            "critical_deadline": False,
            "available_time_hours": 6,
            "notes": "",
        },
        "profile_context": {
            "timezone": "UTC",
            "wake_window_start": "07:00",
            "wake_window_end": "10:00",
            "sleep_window_start": "22:00",
            "sleep_window_end": "06:00",
            "work_pattern": "day",
            "max_daily_focus_blocks": 2,
            "priority_bias": "stability_first",
            "compliance_domains": ["bills", "visa/legal"],
        },
        "schedule": {"timezone": "UTC", "busy_blocks": []},
    }


def test_analyze_mode_default():
    output = run_engine_mode(_baseline_input())
    assert "life_stability_score" in output
    assert "priorities" in output


def test_simulate_mode_dispatch():
    payload = {
        "mode": "simulate",
        "baseline_input": _baseline_input(),
        "scenario": {
            "id": "expense-1",
            "type": "increase_expense",
            "params": {"amount_per_month": 1200, "category": "housing"},
        },
    }
    output = run_engine_mode(payload)
    assert output["scenario_id"] == "expense-1"
    assert "delta" in output
    assert "mitigation_plan" in output


def test_compare_mode_dispatch():
    payload = {
        "mode": "compare",
        "baseline_input": _baseline_input(),
        "scenarios": [
            {
                "id": "scenario-1",
                "type": "reduce_expense",
                "params": {"amount_per_month": 300, "category": "general"},
            },
            {
                "id": "scenario-2",
                "type": "add_recurring_obligation",
                "params": {"hours_per_week": 4, "deadline_pressure": 6},
            },
        ],
    }
    output = run_engine_mode(payload)
    assert "baseline" in output
    assert output["ranked"]
    assert "recommendation" in output


def test_invalid_mode_raises():
    payload = {"mode": "unknown", "checkin": {}}
    with pytest.raises(ValueError):
        run_engine_mode(payload)
