import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from life_score import calculate_confidence, score_breakdown
from simulator import compare_scenarios, simulate_scenario


def _baseline_input():
    return {
        "checkin": {
            "sleep_hours": 8,
            "energy_level": 8,
            "stress_level": 3,
            "money_pressure": 6,
            "today_deadlines_count": 1,
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


def test_add_job_increases_money_but_may_increase_burnout():
    baseline = _baseline_input()
    baseline_breakdown = score_breakdown(baseline["checkin"])

    scenario = {
        "id": "job-1",
        "type": "add_job",
        "params": {
            "hours_per_week": 50,
            "shift_type": "night",
            "commute_min_per_day": 60,
            "pay_per_month": 4000,
        },
    }

    result = simulate_scenario(baseline, scenario)
    assert result["delta"]["breakdown"]["money"] > 0
    assert (
        result["new_estimate"]["breakdown"]["money"]
        >= baseline_breakdown["money"]
    )
    assert result["new_estimate"]["flags"]["burnout_risk"] in ("medium", "high")


def test_increase_expense_reduces_money_score():
    baseline = _baseline_input()
    scenario = {
        "id": "expense-1",
        "type": "increase_expense",
        "params": {"amount_per_month": 2000, "category": "housing"},
    }

    result = simulate_scenario(baseline, scenario)
    assert result["delta"]["breakdown"]["money"] < 0


def test_compare_scenarios_ranks_by_net_benefit_score_deterministically():
    baseline = _baseline_input()
    scenarios = [
        {
            "id": "reduce-expense",
            "type": "reduce_expense",
            "params": {"amount_per_month": 800, "category": "subscriptions"},
        },
        {
            "id": "add-job",
            "type": "add_job",
            "params": {
                "hours_per_week": 45,
                "shift_type": "night",
                "commute_min_per_day": 60,
                "pay_per_month": 2200,
            },
        },
    ]

    comparison = compare_scenarios(baseline, scenarios)
    assert comparison["ranked"][0]["scenario_id"] == "reduce-expense"
    assert comparison["ranked"][0]["overall_rank"] == 1


def test_invariants_hold_in_mitigation_plan():
    baseline = _baseline_input()
    baseline["checkin"].update(
        {
            "sleep_hours": 3,
            "energy_level": 2,
            "stress_level": 9,
            "today_deadlines_count": 6,
            "critical_deadline": True,
            "available_time_hours": 1.5,
        }
    )

    scenario = {
        "id": "obligation-1",
        "type": "add_recurring_obligation",
        "params": {"hours_per_week": 10, "deadline_pressure": 9},
    }

    result = simulate_scenario(baseline, scenario)
    priorities = result["mitigation_plan"]["priorities"]
    categories = {item["category"] for item in priorities}
    assert len(priorities) <= 3
    assert "compliance" in categories
    assert "recovery" in categories


def test_low_confidence_when_missing_params():
    baseline = _baseline_input()
    baseline_confidence, _, _ = calculate_confidence(baseline["checkin"])

    scenario = {"id": "missing", "type": "add_job", "params": {}}
    result = simulate_scenario(baseline, scenario)

    assert result["confidence"] < baseline_confidence
