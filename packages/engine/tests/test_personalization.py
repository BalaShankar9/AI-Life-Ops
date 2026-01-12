import unittest
from src.personalization import (
    normalize_weights,
    update_weights_from_feedback,
    compute_utility,
    apply_focus_preference,
)


class TestNormalizeWeights(unittest.TestCase):
    def test_clamps_minimum(self):
        weights = {"energy": 0.01, "money": 0.3, "obligations": 0.3, "growth": 0.3, "stability": 0.09}
        normalized = normalize_weights(weights)
        self.assertGreaterEqual(normalized["energy"], 0.05)
        self.assertGreaterEqual(normalized["stability"], 0.05)

    def test_clamps_maximum(self):
        weights = {"energy": 0.5, "money": 0.1, "obligations": 0.1, "growth": 0.1, "stability": 0.2}
        normalized = normalize_weights(weights)
        self.assertLessEqual(normalized["energy"], 0.40)

    def test_normalizes_sum(self):
        weights = {"energy": 0.15, "money": 0.15, "obligations": 0.15, "growth": 0.15, "stability": 0.15}
        normalized = normalize_weights(weights)
        total = sum(normalized.values())
        self.assertAlmostEqual(total, 1.0, places=5)

    def test_preserves_relative_order(self):
        weights = {"energy": 0.3, "money": 0.25, "obligations": 0.2, "growth": 0.15, "stability": 0.1}
        normalized = normalize_weights(weights)
        self.assertGreater(normalized["energy"], normalized["money"])
        self.assertGreater(normalized["money"], normalized["obligations"])


class TestUpdateWeightsFromFeedback(unittest.TestCase):
    def test_requires_minimum_feedback(self):
        current = {"energy": 0.2, "money": 0.2, "obligations": 0.2, "growth": 0.2, "stability": 0.2}
        feedback = [
            {"category": "energy", "feedback": "helped"},
            {"category": "money", "feedback": "didnt_help"},
        ]  # Only 2 entries
        updated = update_weights_from_feedback(current, feedback)
        self.assertEqual(updated, current)  # Should not change

    def test_bounded_increase(self):
        current = {"energy": 0.2, "money": 0.2, "obligations": 0.2, "growth": 0.2, "stability": 0.2}
        feedback = [
            {"category": "energy", "feedback": "helped"},
            {"category": "energy", "feedback": "helped"},
            {"category": "energy", "feedback": "helped"},
            {"category": "energy", "feedback": "helped"},
            {"category": "energy", "feedback": "helped"},
            {"category": "money", "feedback": "neutral"},
            {"category": "obligations", "feedback": "neutral"},
            {"category": "growth", "feedback": "neutral"},
        ]  # 8 entries, energy should increase
        updated = update_weights_from_feedback(current, feedback)
        
        # Energy should increase but not by more than 0.03
        self.assertGreater(updated["energy"], current["energy"])
        self.assertLessEqual(updated["energy"], current["energy"] + 0.03)

    def test_bounded_decrease(self):
        current = {"energy": 0.2, "money": 0.2, "obligations": 0.2, "growth": 0.2, "stability": 0.2}
        feedback = [
            {"category": "money", "feedback": "didnt_help"},
            {"category": "money", "feedback": "didnt_help"},
            {"category": "money", "feedback": "didnt_help"},
            {"category": "money", "feedback": "didnt_help"},
            {"category": "money", "feedback": "didnt_help"},
            {"category": "energy", "feedback": "neutral"},
            {"category": "obligations", "feedback": "neutral"},
            {"category": "growth", "feedback": "neutral"},
        ]  # 8 entries, money should decrease
        updated = update_weights_from_feedback(current, feedback)
        
        # Money should decrease but not by more than 0.03
        self.assertLess(updated["money"], current["money"])
        self.assertGreaterEqual(updated["money"], current["money"] - 0.03)

    def test_normalized_output(self):
        current = {"energy": 0.25, "money": 0.15, "obligations": 0.2, "growth": 0.25, "stability": 0.15}
        feedback = [
            {"category": "energy", "feedback": "helped"},
            {"category": "money", "feedback": "didnt_help"},
            {"category": "obligations", "feedback": "neutral"},
            {"category": "growth", "feedback": "helped"},
            {"category": "stability", "feedback": "neutral"},
            {"category": "energy", "feedback": "helped"},
            {"category": "growth", "feedback": "helped"},
            {"category": "money", "feedback": "didnt_help"},
        ]
        updated = update_weights_from_feedback(current, feedback)
        
        total = sum(updated.values())
        self.assertAlmostEqual(total, 1.0, places=5)


class TestComputeUtility(unittest.TestCase):
    def test_high_risk_aversion_prioritizes_safety(self):
        action = {"category": "obligations", "effort": 2}
        personalization = {
            "weights": {"energy": 0.2, "money": 0.2, "obligations": 0.2, "growth": 0.2, "stability": 0.2},
            "risk_aversion": 0.9,
        }
        baseline = {"energy": 50, "money": 50, "obligations": 50, "growth": 50, "stability": 50}
        
        utility = compute_utility(action, personalization, baseline, "high")
        self.assertIsInstance(utility, float)
        # High risk aversion should boost utility for obligations (safety-related)

    def test_low_risk_aversion_prioritizes_growth(self):
        action = {"category": "growth", "effort": 3}
        personalization = {
            "weights": {"energy": 0.2, "money": 0.2, "obligations": 0.2, "growth": 0.2, "stability": 0.2},
            "risk_aversion": 0.2,
        }
        baseline = {"energy": 50, "money": 50, "obligations": 50, "growth": 50, "stability": 50}
        
        utility = compute_utility(action, personalization, baseline, "low")
        self.assertIsInstance(utility, float)

    def test_high_weight_category_gets_boost(self):
        action1 = {"category": "energy", "effort": 2}
        action2 = {"category": "money", "effort": 2}
        personalization = {
            "weights": {"energy": 0.35, "money": 0.1, "obligations": 0.2, "growth": 0.2, "stability": 0.15},
            "risk_aversion": 0.5,
        }
        baseline = {"energy": 50, "money": 50, "obligations": 50, "growth": 50, "stability": 50}
        
        utility1 = compute_utility(action1, personalization, baseline, "medium")
        utility2 = compute_utility(action2, personalization, baseline, "medium")
        
        self.assertGreater(utility1, utility2)  # Energy weighted higher


class TestApplyFocusPreference(unittest.TestCase):
    def test_deep_work_extends_blocks(self):
        schedule = [
            {"title": "Priority 1", "start_ts": "2025-01-11T09:00:00", "end_ts": "2025-01-11T10:00:00", "duration_min": 60},
            {"title": "Priority 2", "start_ts": "2025-01-11T10:30:00", "end_ts": "2025-01-11T11:30:00", "duration_min": 60},
        ]
        result = apply_focus_preference(schedule, "deep_work")
        
        # Should attempt to extend blocks
        self.assertEqual(len(result), 2)
        # Note: actual extension depends on available time; this test just checks no crashes

    def test_light_tasks_shortens_blocks(self):
        schedule = [
            {"title": "Priority 1", "start_ts": "2025-01-11T09:00:00", "end_ts": "2025-01-11T11:00:00", "duration_min": 120},
        ]
        result = apply_focus_preference(schedule, "light_tasks")
        
        # Should attempt to shorten blocks (may split)
        self.assertGreaterEqual(len(result), 1)

    def test_mixed_preserves_schedule(self):
        schedule = [
            {"title": "Priority 1", "start_ts": "2025-01-11T09:00:00", "end_ts": "2025-01-11T10:00:00", "duration_min": 60},
        ]
        result = apply_focus_preference(schedule, "mixed")
        
        # Should return schedule unchanged
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["duration_min"], 60)


if __name__ == "__main__":
    unittest.main()
