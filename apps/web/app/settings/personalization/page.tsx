"use client";

import { useState, useEffect } from "react";
import { apiClient } from "../../lib/api";
import type { PersonalizationResponse } from "@ai-life-ops/shared";

type Weights = {
  energy: number;
  money: number;
  obligations: number;
  growth: number;
  stability: number;
};

export default function PersonalizationSettings() {
  const [weights, setWeights] = useState<Weights>({
    energy: 0.2,
    money: 0.2,
    obligations: 0.2,
    growth: 0.2,
    stability: 0.2,
  });
  const [riskAversion, setRiskAversion] = useState(0.6);
  const [focusPreference, setFocusPreference] = useState<"deep_work" | "mixed" | "light_tasks">("mixed");
  const [isDefault, setIsDefault] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const response = await apiClient<PersonalizationResponse>("GET", "/api/personalization");
      setWeights(response.weights);
      setRiskAversion(response.riskAversion);
      setFocusPreference(response.focusPreference);
      setIsDefault(response.isDefault);
    } catch (err) {
      setMessage("Failed to load settings");
    }
  }

  async function handleSave() {
    setSaving(true);
    setMessage("");

    try {
      const response = await apiClient<PersonalizationResponse>("PUT", "/api/personalization", {
        weights,
        riskAversion,
        focusPreference,
      });

      setWeights(response.weights);
      setRiskAversion(response.riskAversion);
      setFocusPreference(response.focusPreference);
      setIsDefault(false);
      setMessage("Settings saved successfully");
    } catch (err) {
      setMessage("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  function updateWeight(category: keyof Weights, value: number) {
    setWeights((prev) => ({ ...prev, [category]: value }));
  }

  const weightSum = Object.values(weights).reduce((a, b) => a + b, 0);
  const isValid = weightSum >= 0.95 && weightSum <= 1.05;

  return (
    <div className="max-w-3xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-2">Personalization</h1>
      <p className="text-gray-600 mb-8">
        Adjust how the engine ranks actions. Changes are bounded (±0.03 per update) to prevent runaway optimization.
      </p>

      {isDefault && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-blue-800">
            You're using default settings. Adjust the sliders below to personalize recommendations.
          </p>
        </div>
      )}

      <div className="space-y-6 mb-8">
        <h2 className="text-xl font-semibold">Category Weights</h2>
        <p className="text-sm text-gray-600">
          Higher weight = actions in that category rank higher. Must sum to ~1.0.
        </p>

        {(["energy", "money", "obligations", "growth", "stability"] as const).map((category) => (
          <div key={category} className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium capitalize">{category}</label>
              <span className="text-sm text-gray-600">{weights[category].toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.05"
              max="0.40"
              step="0.01"
              value={weights[category]}
              onChange={(e) => updateWeight(category, parseFloat(e.target.value))}
              className="w-full"
            />
          </div>
        ))}

        <div className="text-sm">
          <span className={`font-medium ${isValid ? "text-green-600" : "text-red-600"}`}>
            Sum: {weightSum.toFixed(2)}
          </span>
          {!isValid && <span className="text-red-600 ml-2">(must be 0.95-1.05)</span>}
        </div>
      </div>

      <div className="space-y-6 mb-8">
        <h2 className="text-xl font-semibold">Risk Aversion</h2>
        <p className="text-sm text-gray-600">
          Higher = prioritize safety and compliance. Lower = prioritize growth and experimentation.
        </p>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-sm font-medium">Risk Aversion</label>
            <span className="text-sm text-gray-600">{riskAversion.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={riskAversion}
            onChange={(e) => setRiskAversion(parseFloat(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>Growth-focused</span>
            <span>Balanced</span>
            <span>Safety-focused</span>
          </div>
        </div>
      </div>

      <div className="space-y-6 mb-8">
        <h2 className="text-xl font-semibold">Focus Preference</h2>
        <p className="text-sm text-gray-600">
          Influences how the engine schedules your day: deep work blocks, balanced, or lighter tasks.
        </p>

        <select
          value={focusPreference}
          onChange={(e) => setFocusPreference(e.target.value as typeof focusPreference)}
          className="w-full p-2 border border-gray-300 rounded-lg"
        >
          <option value="deep_work">Deep Work (longer blocks, fewer switches)</option>
          <option value="mixed">Mixed (balanced)</option>
          <option value="light_tasks">Light Tasks (shorter blocks, more variety)</option>
        </select>
      </div>

      {message && (
        <div className={`p-4 rounded-lg mb-4 ${message.includes("success") ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          {message}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving || !isValid}
        className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
      >
        {saving ? "Saving..." : "Save Personalization"}
      </button>

      <div className="mt-8 p-4 bg-gray-50 rounded-lg">
        <h3 className="font-semibold mb-2">How Personalization Works</h3>
        <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
          <li>Actions are first ranked by risk reduction (safety always comes first)</li>
          <li>Weights influence ranking among equally safe actions</li>
          <li>The system learns from your feedback (👍/👎) with bounded updates (±0.03 max)</li>
          <li>Minimum 8 feedback entries required before weight adjustments</li>
          <li>Privacy: feedback never includes raw notes, only aggregated patterns</li>
        </ul>
      </div>
    </div>
  );
}
