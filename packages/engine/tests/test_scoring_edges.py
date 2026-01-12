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


def test_confidence_penalty_on_contradiction():
    normal = _base_payload()
    contradictory = _base_payload()
    contradictory["checkin"].update({"sleep_hours": 1, "energy_level": 9})

    normal_output = run_engine(normal)
    contradictory_output = run_engine(contradictory)

    assert contradictory_output["confidence"] < normal_output["confidence"]
    assert contradictory_output["confidence_reasons"]
    assert any(
        "Contradictory inputs" in reason
        for reason in contradictory_output["confidence_reasons"]
    )


def test_flags_high_on_extreme_inputs():
    payload = _base_payload()
    payload["checkin"].update(
        {
            "sleep_hours": 1,
            "energy_level": 2,
            "stress_level": 10,
            "money_pressure": 9,
            "today_deadlines_count": 8,
            "critical_deadline": True,
            "available_time_hours": 0,
        }
    )

    output = run_engine(payload)

    flags = output["flags"]
    assert flags["burnout_risk"] == "high"
    assert flags["financial_risk"] == "high"
    assert flags["compliance_risk"] == "high"
    assert flags["overload_risk"] == "high"

    assert 0 <= output["life_stability_score"] <= 100
    for value in output["breakdown"].values():
        assert 0 <= value <= 20
    assert output["used_context"]


def test_crisis_risk_triggers_safe_path():
    payload = _base_payload()
    payload["checkin"]["notes"] = "I feel suicidal today."

    output = run_engine(payload)

    assert output["flags"]["crisis_risk"] == "high"
    assert len(output["priorities"]) == 1
    assert output["priorities"][0]["title"] == "Reach immediate support"
    assert output["safety_notice"]
