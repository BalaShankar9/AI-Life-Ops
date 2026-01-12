import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from engine import run_engine


def _base_payload():
    return {
        "checkin": {
            "sleep_hours": 7,
            "energy_level": 6,
            "stress_level": 5,
            "money_pressure": 5,
            "today_deadlines_count": 2,
            "critical_deadline": False,
            "available_time_hours": 6,
            "notes": "",
        },
        "profile_context": {
            "timezone": "America/Los_Angeles",
            "wake_window_start": "07:00",
            "wake_window_end": "10:00",
            "sleep_window_start": "22:00",
            "sleep_window_end": "06:00",
            "work_pattern": "day",
            "max_daily_focus_blocks": 2,
            "priority_bias": "stability_first",
            "compliance_domains": ["bills", "visa/legal"],
        },
        "schedule": {
            "timezone": "America/Los_Angeles",
            "busy_blocks": [],
        },
    }


def test_invariants_compliance_and_recovery_in_damage_control():
    payload = _base_payload()
    payload["checkin"].update(
        {
            "sleep_hours": 3,
            "energy_level": 2,
            "stress_level": 9,
            "today_deadlines_count": 6,
            "critical_deadline": True,
            "available_time_hours": 1.5,
        }
    )

    output = run_engine(payload)

    categories = {item["category"] for item in output["priorities"]}
    assert "compliance" in categories
    assert "recovery" in categories
    assert len(output["priorities"]) <= 3

    total_time = sum(item["time_estimate_min"] for item in output["priorities"])
    assert total_time <= 60
    assert all(item["time_estimate_min"] <= 30 for item in output["priorities"])
    assert output["used_context"]
