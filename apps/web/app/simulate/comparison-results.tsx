"use client";

import { useState } from "react";
import type { ComparisonResult, SimulationResult } from "@ai-life-ops/shared";

type Props = {
  comparison: ComparisonResult;
  simulations: SimulationResult[];
};

export default function ComparisonResults({ comparison, simulations }: Props) {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(
    null
  );

  const selectedSimulation = simulations.find(
    (s) => s.scenario_id === selectedScenarioId
  );

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-semibold text-slate-900">
          Comparison results
        </h2>
        <div className="mt-2 text-sm text-slate-600">
          Baseline score: {comparison.baseline.score}/100
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-slate-900">
          Ranked scenarios
        </h3>
        {comparison.ranked.map((ranked) => {
          const sim = simulations.find((s) => s.scenario_id === ranked.scenario_id);
          const isSelected = selectedScenarioId === ranked.scenario_id;

          return (
            <div
              key={ranked.scenario_id}
              className={`rounded-lg border p-5 transition ${
                isSelected
                  ? "border-slate-900 bg-slate-50"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <button
                type="button"
                onClick={() =>
                  setSelectedScenarioId(
                    isSelected ? null : ranked.scenario_id
                  )
                }
                className="w-full text-left"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                        {ranked.overall_rank}
                      </span>
                      <div>
                        <h4 className="font-semibold text-slate-900">
                          {sim?.scenario_type.replace(/_/g, " ") || ranked.scenario_id}
                        </h4>
                        <p className="text-xs text-slate-500">
                          {ranked.scenario_id}
                        </p>
                      </div>
                    </div>
                    <p className="mt-3 text-sm text-slate-700">
                      {ranked.summary}
                    </p>
                    <div className="mt-3 flex gap-4 text-sm">
                      <span
                        className={`font-medium ${
                          ranked.net_benefit_score > 0
                            ? "text-green-700"
                            : ranked.net_benefit_score < 0
                            ? "text-red-700"
                            : "text-slate-700"
                        }`}
                      >
                        {ranked.net_benefit_score > 0 ? "+" : ""}
                        {ranked.net_benefit_score} net benefit
                      </span>
                    </div>
                  </div>
                  <svg
                    className={`h-5 w-5 flex-shrink-0 text-slate-400 transition ${
                      isSelected ? "rotate-180" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>

                {!isSelected && (
                  <div className="mt-3 space-y-2">
                    {ranked.key_tradeoffs.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-slate-700">
                          Key tradeoffs:
                        </div>
                        <ul className="mt-1 space-y-1">
                          {ranked.key_tradeoffs.map((tradeoff, i) => (
                            <li
                              key={i}
                              className="text-xs text-slate-600"
                            >
                              • {tradeoff}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {ranked.top_risks.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-slate-700">
                          Top risks:
                        </div>
                        <ul className="mt-1 space-y-1">
                          {ranked.top_risks.map((risk, i) => (
                            <li key={i} className="text-xs text-red-700">
                              • {risk}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </button>

              {isSelected && selectedSimulation && (
                <div className="mt-5 space-y-4 border-t border-slate-200 pt-5">
                  <ScenarioDetail simulation={selectedSimulation} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {comparison.recommendation.best_scenario_id && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-5">
          <h3 className="font-semibold text-blue-900">Recommendation</h3>
          <div className="mt-2 space-y-2 text-sm text-blue-800">
            {comparison.recommendation.why_best.map((reason, i) => (
              <p key={i}>• {reason}</p>
            ))}
            {comparison.recommendation.who_should_not_choose_this.length > 0 && (
              <div className="mt-3">
                <div className="font-medium">Not recommended if:</div>
                {comparison.recommendation.who_should_not_choose_this.map(
                  (reason, i) => (
                    <p key={i}>• {reason}</p>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
        <strong>Disclaimer:</strong> Simulations are deterministic
        models based on current inputs. They do not constitute medical advice,
        financial advice, or guarantees. Real outcomes vary based on execution,
        external factors, and individual circumstances.
      </div>
    </div>
  );
}

function ScenarioDetail({ simulation }: { simulation: SimulationResult }) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-slate-900">
          Score impact
        </h4>
        <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs text-slate-600">Life stability score</div>
            <div
              className={`mt-0.5 font-medium ${
                simulation.delta.life_stability_score > 0
                  ? "text-green-700"
                  : simulation.delta.life_stability_score < 0
                  ? "text-red-700"
                  : "text-slate-700"
              }`}
            >
              {simulation.delta.life_stability_score > 0 ? "+" : ""}
              {simulation.delta.life_stability_score} →{" "}
              {simulation.new_estimate.life_stability_score}
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
          {Object.entries(simulation.delta.breakdown).map(([key, value]) => (
            <div key={key}>
              <div className="text-slate-600">{key}</div>
              <div
                className={`font-medium ${
                  value > 0
                    ? "text-green-700"
                    : value < 0
                    ? "text-red-700"
                    : "text-slate-700"
                }`}
              >
                {value > 0 ? "+" : ""}
                {value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {simulation.risk_changes.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-900">
            Risk changes
          </h4>
          <div className="mt-2 space-y-1">
            {simulation.risk_changes.map((change, i) => (
              <div key={i} className="text-xs">
                <span className="font-medium text-slate-700">
                  {change.flag.replace(/_/g, " ")}:
                </span>{" "}
                <span className="text-slate-600">
                  {change.from} → {change.to}
                </span>
                <div className="mt-0.5 text-slate-600">{change.why}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h4 className="text-sm font-semibold text-slate-900">
          Constraints impact
        </h4>
        <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-slate-600">Free time</div>
            <div className="font-medium text-slate-900">
              {simulation.constraints_impact.free_time_delta_min > 0
                ? "+"
                : ""}
              {simulation.constraints_impact.free_time_delta_min} min
            </div>
          </div>
          <div>
            <div className="text-slate-600">Sleep</div>
            <div className="font-medium text-slate-900">
              {simulation.constraints_impact.sleep_delta_hours > 0 ? "+" : ""}
              {simulation.constraints_impact.sleep_delta_hours.toFixed(1)} hrs
            </div>
          </div>
          <div>
            <div className="text-slate-600">Largest window</div>
            <div className="font-medium text-slate-900">
              {simulation.constraints_impact.largest_window_delta_min > 0
                ? "+"
                : ""}
              {simulation.constraints_impact.largest_window_delta_min} min
            </div>
          </div>
          <div>
            <div className="text-slate-600">Stress pressure</div>
            <div className="font-medium text-slate-900">
              {simulation.constraints_impact.stress_pressure_delta > 0
                ? "+"
                : ""}
              {simulation.constraints_impact.stress_pressure_delta}
            </div>
          </div>
        </div>
      </div>

      {simulation.mitigation_plan.priorities.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-900">
            Top mitigation priorities
          </h4>
          <div className="mt-2 space-y-2">
            {simulation.mitigation_plan.priorities.map((priority, i) => (
              <div
                key={i}
                className="rounded-lg border border-slate-200 bg-slate-50 p-3"
              >
                <div className="text-xs font-medium text-slate-900">
                  {priority.title}
                </div>
                <div className="mt-1 text-xs text-slate-600">
                  {priority.why}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  ~{priority.time_estimate_min}min • impact: {priority.impact}/5
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h4 className="text-sm font-semibold text-slate-900">Assumptions</h4>
        <ul className="mt-2 space-y-1 text-xs text-slate-600">
          {simulation.assumptions.slice(0, 5).map((assumption, i) => (
            <li key={i}>• {assumption}</li>
          ))}
        </ul>
      </div>

      {simulation.sensitivity.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-900">
            Sensitivity
          </h4>
          <div className="mt-2 space-y-2 text-xs">
            {simulation.sensitivity.slice(0, 3).map((item, i) => (
              <div key={i}>
                <div className="font-medium text-slate-700">
                  {item.assumption}
                </div>
                <div className="text-slate-600">{item.if_wrong_effect}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h4 className="text-sm font-semibold text-slate-900">
          Confidence: {(simulation.confidence * 100).toFixed(0)}%
        </h4>
        <p className="mt-1 text-xs text-slate-600">
          {simulation.explanation}
        </p>
      </div>
    </div>
  );
}
