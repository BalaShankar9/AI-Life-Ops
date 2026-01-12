"use client";

import { useState } from "react";
import type { Scenario, ScenarioType } from "@ai-life-ops/shared";
import ScenarioCard from "./scenario-card";

type Props = {
  pack: {
    id?: string;
    name: string;
    description?: string;
    scenarios: Scenario[];
  };
  onUpdateName: (name: string) => void;
  onUpdateDescription: (description: string) => void;
  onUpdateScenarios: (scenarios: Scenario[]) => void;
  onSave: () => void;
  onCompare: () => void;
  saving: boolean;
  comparing: boolean;
};

const SCENARIO_TYPES: { value: ScenarioType; label: string }[] = [
  { value: "add_job", label: "Add job" },
  { value: "drop_job", label: "Drop job" },
  { value: "increase_expense", label: "Increase expense" },
  { value: "reduce_expense", label: "Reduce expense" },
  { value: "add_recurring_obligation", label: "Add obligation" },
  { value: "remove_recurring_obligation", label: "Remove obligation" },
  { value: "sleep_schedule_change", label: "Sleep schedule change" },
  { value: "commute_change", label: "Commute change" },
  { value: "study_plan", label: "Study plan" }
];

export default function ScenarioEditor({
  pack,
  onUpdateName,
  onUpdateDescription,
  onUpdateScenarios,
  onSave,
  onCompare,
  saving,
  comparing
}: Props) {
  const addScenario = (type: ScenarioType) => {
    if (pack.scenarios.length >= 6) {
      return;
    }

    const newScenario: Scenario = {
      id: `scenario-${Date.now()}`,
      type,
      params: getDefaultParams(type)
    };

    onUpdateScenarios([...pack.scenarios, newScenario]);
  };

  const updateScenario = (index: number, scenario: Scenario) => {
    const updated = [...pack.scenarios];
    updated[index] = scenario;
    onUpdateScenarios(updated);
  };

  const removeScenario = (index: number) => {
    const updated = pack.scenarios.filter((_, i) => i !== index);
    onUpdateScenarios(updated);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Pack name
          </label>
          <input
            type="text"
            value={pack.name}
            onChange={(e) => onUpdateName(e.target.value)}
            placeholder="e.g., Career change options"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
            maxLength={80}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">
            Description (optional)
          </label>
          <textarea
            value={pack.description || ""}
            onChange={(e) => onUpdateDescription(e.target.value)}
            placeholder="Brief description of what these scenarios explore..."
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
            rows={2}
            maxLength={400}
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={saving || pack.scenarios.length === 0}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "Saving..." : pack.id ? "Update pack" : "Save pack"}
          </button>
          <button
            type="button"
            onClick={onCompare}
            disabled={comparing || pack.scenarios.length === 0}
            className="rounded-lg border border-slate-900 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {comparing ? "Comparing..." : "Compare scenarios"}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">
            Scenarios ({pack.scenarios.length}/6)
          </h3>
          {pack.scenarios.length < 6 && (
            <select
              onChange={(e) => {
                if (e.target.value) {
                  addScenario(e.target.value as ScenarioType);
                  e.target.value = "";
                }
              }}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              defaultValue=""
            >
              <option value="" disabled>
                Add scenario
              </option>
              {SCENARIO_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          )}
        </div>

        {pack.scenarios.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
            Add scenarios above to start comparing options
          </div>
        ) : (
          <div className="space-y-4">
            {pack.scenarios.map((scenario, index) => (
              <ScenarioCard
                key={scenario.id}
                scenario={scenario}
                index={index}
                onUpdate={(updated: Scenario) => updateScenario(index, updated)}
                onRemove={() => removeScenario(index)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


function getDefaultParams(type: ScenarioType): any {
  switch (type) {
    case "add_job":
    case "drop_job":
      return {
        hours_per_week: 40,
        shift_type: "day",
        commute_min_per_day: 30,
        pay_per_month: 3000
      };
    case "increase_expense":
    case "reduce_expense":
      return {
        amount_per_month: 500,
        category: "living"
      };
    case "add_recurring_obligation":
    case "remove_recurring_obligation":
      return {
        hours_per_week: 5,
        deadline_pressure: 5
      };
    case "sleep_schedule_change":
      return {
        sleep_hours_delta: 1,
        bedtime_shift_min: 60
      };
    case "commute_change":
      return {
        delta_min_per_day: 30,
        days_per_week: 5
      };
    case "study_plan":
      return {
        hours_per_week: 10,
        intensity: 2,
        deadline_pressure: 5
      };
    default:
      return {};
  }
}
