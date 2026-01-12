import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from weekly_review import generate_weekly_review


def _profile_context():
    return {
        "timezone": "UTC",
        "wake_window_start": "07:00",
        "wake_window_end": "10:00",
        "sleep_window_start": "22:00",
        "sleep_window_end": "06:00",
        "work_pattern": "day",
        "max_daily_focus_blocks": 2,
        "priority_bias": "stability_first",
        "compliance_domains": ["bills", "visa/legal"],
    }


def _snapshot(date: str, score: int, flags_override=None):
    flags = {
        "burnout_risk": "medium",
        "financial_risk": "low",
        "compliance_risk": "medium",
        "overload_risk": "medium",
    }
    if flags_override:
        flags.update(flags_override)
    return {
        "date": date,
        "life_stability_score": score,
        "breakdown": {
            "energy": 10,
            "money": 10,
            "obligations": 10,
            "growth": 10,
            "stability": 10,
        },
        "flags": flags,
        "priorities": [
            {"title": "Protect one focus block", "category": "focus"},
            {"title": "Resolve compliance items", "category": "compliance"},
        ],
    }


def test_next_week_focus_is_capped():
    snapshots = [
        _snapshot("2024-01-01", 40, {"burnout_risk": "high"}),
        _snapshot("2024-01-02", 45, {"financial_risk": "high"}),
        _snapshot("2024-01-03", 50, {"overload_risk": "high"}),
        _snapshot("2024-01-04", 55, {"compliance_risk": "high"}),
    ]

    output = generate_weekly_review(snapshots, _profile_context())

    assert len(output["next_week_focus"]) <= 3


def test_low_data_reduces_confidence():
    snapshots = [_snapshot("2024-01-01", 40), _snapshot("2024-01-02", 42)]

    output = generate_weekly_review(snapshots, _profile_context())

    assert output["confidence"] < 0.5
    assert output["confidence_reasons"]
    assert output["variability_notes"]


def test_trend_delta_matches_start_and_end_scores():
    snapshots = [_snapshot("2024-01-01", 42), _snapshot("2024-01-07", 60)]

    output = generate_weekly_review(snapshots, _profile_context())

    trend = output["score_trend"]
    assert trend["start_score"] == 42
    assert trend["end_score"] == 60
    assert trend["delta"] == 18
