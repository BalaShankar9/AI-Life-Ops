import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from engine import run_engine
from schedule import compute_free_windows, derive_day_bounds, normalize_busy_blocks, pick_windows_for_actions


def _profile_context():
    return {
        "timezone": "UTC",
        "wake_window_start": "08:00",
        "wake_window_end": "10:00",
        "sleep_window_start": "22:00",
        "sleep_window_end": "12:00",
        "work_pattern": "day",
        "max_daily_focus_blocks": 2,
        "priority_bias": "growth_first",
        "compliance_domains": ["bills", "visa/legal"],
    }


def _base_payload():
    return {
        "checkin": {
            "sleep_hours": 7,
            "energy_level": 7,
            "stress_level": 3,
            "money_pressure": 2,
            "today_deadlines_count": 0,
            "critical_deadline": False,
            "available_time_hours": 6,
            "notes": "",
        },
        "profile_context": _profile_context(),
        "schedule": {
            "timezone": "UTC",
            "busy_blocks": [],
        },
    }


def test_busy_block_merging():
    busy_blocks = [
        {"start_ts": "2024-01-01T09:00:00Z", "end_ts": "2024-01-01T10:00:00Z"},
        {"start_ts": "2024-01-01T10:04:00Z", "end_ts": "2024-01-01T11:00:00Z"},
    ]
    merged = normalize_busy_blocks(busy_blocks, "UTC")
    assert len(merged) == 1
    assert merged[0][0].isoformat().startswith("2024-01-01T09:00:00")
    assert merged[0][1].isoformat().startswith("2024-01-01T11:00:00")


def test_free_windows_computed_correctly():
    profile = _profile_context()
    day = datetime(2024, 1, 1, tzinfo=ZoneInfo("UTC"))
    bounds = derive_day_bounds(profile, "UTC", day)
    busy = normalize_busy_blocks(
        [{"start_ts": "2024-01-01T09:00:00Z", "end_ts": "2024-01-01T10:00:00Z"}],
        "UTC",
    )
    free = compute_free_windows(bounds, busy)
    assert len(free) == 2
    assert int((free[0][1] - free[0][0]).total_seconds() / 60) == 60
    assert int((free[1][1] - free[1][0]).total_seconds() / 60) == 120


def test_deep_work_not_split():
    free_windows = [
        (
            datetime(2024, 1, 1, 9, 0, tzinfo=ZoneInfo("UTC")),
            datetime(2024, 1, 1, 9, 20, tzinfo=ZoneInfo("UTC")),
        ),
        (
            datetime(2024, 1, 1, 9, 30, tzinfo=ZoneInfo("UTC")),
            datetime(2024, 1, 1, 9, 50, tzinfo=ZoneInfo("UTC")),
        ),
    ]
    actions = [
        {
            "title": "Protect one focused work block",
            "category": "focus",
            "time_estimate_min": 30,
            "original_time_estimate_min": 30,
            "split_allowed": False,
            "compressed": False,
        }
    ]
    plan, conflicts, assigned = pick_windows_for_actions(actions, free_windows)
    assert plan == []
    assert assigned == {}
    assert conflicts


def test_compliance_actions_can_split():
    free_windows = [
        (
            datetime(2024, 1, 1, 9, 0, tzinfo=ZoneInfo("UTC")),
            datetime(2024, 1, 1, 9, 10, tzinfo=ZoneInfo("UTC")),
        ),
        (
            datetime(2024, 1, 1, 9, 20, tzinfo=ZoneInfo("UTC")),
            datetime(2024, 1, 1, 9, 30, tzinfo=ZoneInfo("UTC")),
        ),
    ]
    actions = [
        {
            "title": "Resolve compliance items",
            "category": "compliance",
            "time_estimate_min": 15,
            "original_time_estimate_min": 15,
            "split_allowed": True,
            "compressed": False,
        }
    ]
    plan, conflicts, assigned = pick_windows_for_actions(actions, free_windows)
    assert len(plan) == 2
    assert not conflicts
    assert assigned["Resolve compliance items"] == 15


def test_compression_triggers_when_no_window_fits():
    payload = _base_payload()
    payload["schedule"]["busy_blocks"] = [
        {"start_ts": "2024-01-01T08:00:00Z", "end_ts": "2024-01-01T09:30:00Z"},
        {"start_ts": "2024-01-01T10:00:00Z", "end_ts": "2024-01-01T12:00:00Z"},
    ]

    output = run_engine(payload)

    focus = next(
        (item for item in output["priorities"] if item["title"] == "Protect one focused work block"),
        None,
    )
    assert focus is not None
    assert focus["time_estimate_min"] <= 30
    assert output["schedule_plan"]
