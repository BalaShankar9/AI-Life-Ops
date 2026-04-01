"use client";

import { useState, useEffect } from "react";
import { apiClient } from "../../lib/api";
import type { PersonalizationResponse } from "@ai-life-ops/shared";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";

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
  const [focusPreference, setFocusPreference] = useState<
    "deep_work" | "mixed" | "light_tasks"
  >("mixed");
  const [isDefault, setIsDefault] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const response = await apiClient<PersonalizationResponse>(
        "GET",
        "/api/personalization"
      );
      setWeights(response.weights);
      setRiskAversion(response.riskAversion);
      setFocusPreference(response.focusPreference);
      setIsDefault(response.isDefault);
    } catch {
      setMessage("Failed to load settings");
    }
  }

  async function handleSave() {
    setSaving(true);
    setMessage("");

    try {
      const response = await apiClient<PersonalizationResponse>(
        "PUT",
        "/api/personalization",
        { weights, riskAversion, focusPreference }
      );
      setWeights(response.weights);
      setRiskAversion(response.riskAversion);
      setFocusPreference(response.focusPreference);
      setIsDefault(false);
      setMessage("Settings saved successfully");
    } catch {
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
    <AppShell>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Personalization</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Adjust how the engine ranks actions. Changes are bounded (±0.03 per
            update) to prevent runaway optimization.
          </p>
        </div>

        {isDefault && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-4 pb-4">
              <p className="text-sm text-foreground">
                You&apos;re using default settings. Adjust the sliders below to
                personalize recommendations.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Category weights */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Category Weights</CardTitle>
              <Badge
                variant={isValid ? "default" : "destructive"}
                className="font-mono text-xs"
              >
                Sum: {weightSum.toFixed(2)}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Higher weight = actions in that category rank higher. Must sum to
              ~1.0.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            {(
              [
                "energy",
                "money",
                "obligations",
                "growth",
                "stability",
              ] as const
            ).map((category) => (
              <div key={category} className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label className="capitalize">{category}</Label>
                  <span className="text-sm font-mono text-muted-foreground">
                    {weights[category].toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="0.40"
                  step="0.01"
                  value={weights[category]}
                  onChange={(e) =>
                    updateWeight(category, parseFloat(e.target.value))
                  }
                  className="w-full accent-primary"
                />
              </div>
            ))}
            {!isValid && (
              <p className="text-xs text-destructive">
                Weights must sum to 0.95–1.05
              </p>
            )}
          </CardContent>
        </Card>

        {/* Risk aversion */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Risk Aversion</CardTitle>
            <p className="text-xs text-muted-foreground">
              Higher = prioritize safety and compliance. Lower = prioritize growth.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <Label>Risk Aversion</Label>
              <span className="text-sm font-mono text-muted-foreground">
                {riskAversion.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={riskAversion}
              onChange={(e) => setRiskAversion(parseFloat(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Growth-focused</span>
              <span>Balanced</span>
              <span>Safety-focused</span>
            </div>
          </CardContent>
        </Card>

        {/* Focus preference */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Focus Preference</CardTitle>
            <p className="text-xs text-muted-foreground">
              Influences how the engine schedules your day.
            </p>
          </CardHeader>
          <CardContent>
            <select
              value={focusPreference}
              onChange={(e) =>
                setFocusPreference(e.target.value as typeof focusPreference)
              }
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="deep_work">
                Deep Work (longer blocks, fewer switches)
              </option>
              <option value="mixed">Mixed (balanced)</option>
              <option value="light_tasks">
                Light Tasks (shorter blocks, more variety)
              </option>
            </select>
          </CardContent>
        </Card>

        {/* Message */}
        {message && (
          <div
            className={`rounded-lg px-4 py-3 text-sm ${
              message.includes("success")
                ? "border border-green-500/30 bg-green-500/10 text-green-400"
                : "border border-destructive/30 bg-destructive/10 text-destructive"
            }`}
          >
            {message}
          </div>
        )}

        <Button onClick={handleSave} disabled={saving || !isValid} className="w-full">
          {saving ? "Saving..." : "Save Personalization"}
        </Button>

        <Separator />

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">How Personalization Works</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-5">
              <li>
                Actions are first ranked by risk reduction (safety always comes
                first)
              </li>
              <li>Weights influence ranking among equally safe actions</li>
              <li>
                The system learns from your feedback with bounded updates (±0.03
                max)
              </li>
              <li>
                Minimum 8 feedback entries required before weight adjustments
              </li>
              <li>
                Privacy: feedback never includes raw notes, only aggregated patterns
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
