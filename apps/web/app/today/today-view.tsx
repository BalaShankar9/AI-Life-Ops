"use client";

import { useEffect, useState } from "react";

import type { Snapshot } from "@ai-life-ops/shared";

import { fetchToday, apiClient } from "../lib/api";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; snapshot: Snapshot };

type FeedbackState = Record<string, "helped" | "neutral" | "didnt_help" | null>;

const breakdownLabels: Record<string, string> = {
  energy: "Energy",
  money: "Money",
  obligations: "Obligations",
  growth: "Growth",
  stability: "Stability"
};
const breakdownOrder = [
  "energy",
  "money",
  "obligations",
  "growth",
  "stability"
] as const;

export default function TodayView({
  initialSnapshot,
  initialError
}: {
  initialSnapshot?: Snapshot | null;
  initialError?: string | null;
}) {
  const [state, setState] = useState<LoadState>(() => {
    if (initialSnapshot) {
      return { status: "ready", snapshot: initialSnapshot };
    }
    if (initialError) {
      return { status: "error", message: initialError };
    }
    return { status: "loading" };
  });

  const [feedbackState, setFeedbackState] = useState<FeedbackState>({});
  const [submittingFeedback, setSubmittingFeedback] = useState<Record<string, boolean>>({});

  async function submitFeedback(
    actionTitle: string,
    actionCategory: string,
    scheduled: boolean,
    feedback: "helped" | "neutral" | "didnt_help"
  ) {
    if (state.status !== "ready") return;

    const key = `${actionTitle}-${scheduled}`;
    setSubmittingFeedback((prev) => ({ ...prev, [key]: true }));

    try {
      await apiClient("POST", "/api/feedback", {
        snapshotId: state.snapshot.id,
        actionTitle,
        actionCategory,
        scheduled,
        feedback,
        perceivedEffort: null,
        perceivedImpact: null,
        comment: null
      });

      setFeedbackState((prev) => ({ ...prev, [key]: feedback }));
    } catch (err) {
      console.error("Failed to submit feedback:", err);
    } finally {
      setSubmittingFeedback((prev) => ({ ...prev, [key]: false }));
    }
  }

  useEffect(() => {
    let active = true;

    if (initialSnapshot || initialError) {
      return () => {
        active = false;
      };
    }

    fetchToday()
      .then((snapshot) => {
        if (active) {
          setState({ status: "ready", snapshot });
        }
      })
      .catch((error) => {
        if (active) {
          setState({ status: "error", message: getErrorMessage(error) });
        }
      });

    return () => {
      active = false;
    };
  }, [initialSnapshot, initialError]);

  if (state.status === "loading") {
    return (
      <div className="animate-rise rounded-3xl border border-slate-200/70 bg-white/80 p-8 shadow-sm">
        <p className="text-sm text-slate-500">Loading today&apos;s plan...</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="animate-rise rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 shadow-sm">
        {state.message}
      </div>
    );
  }

  const output = state.snapshot.output;
  const fastestImprovements = buildFastestImprovements(output);
  const compressionNote = findCompressionNote(output.schedule_plan);

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-6">
        {output.safety_notice ? (
          <section className="animate-rise rounded-3xl border border-amber-200 bg-amber-50/80 p-6 text-sm text-slate-700 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">
              Safety notice
            </p>
            <p className="mt-2">{output.safety_notice}</p>
          </section>
        ) : null}

        {output.schedule_conflicts.length > 0 ? (
          <section className="animate-rise rounded-3xl border border-amber-200 bg-amber-50/80 p-6 text-sm text-slate-700 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">
              Scheduling note
            </p>
            <p className="mt-2">
              Some priorities needed adjustments to fit the available windows.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-600">
              {output.schedule_conflicts.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {compressionNote ? (
              <p className="mt-2 text-xs text-slate-600">{compressionNote}</p>
            ) : null}
          </section>
        ) : null}

        <section className="animate-rise rounded-3xl border border-slate-200/70 bg-white/80 p-8 shadow-sm">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Life Stability Score
              </p>
              <p className="mt-2 text-4xl font-semibold text-slate-900">
                {output.life_stability_score}
              </p>
            </div>
            <div className="text-xs text-slate-500">
              Updated {new Date(state.snapshot.createdAt).toLocaleString()}
            </div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {breakdownOrder.map((key) => (
              <div
                key={key}
                className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3"
              >
                <p className="text-xs text-slate-500">
                  {breakdownLabels[key]}
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-800">
                  {output.breakdown[key]} / 20
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="animate-rise rounded-3xl border border-slate-200/70 bg-white/80 p-8 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Priorities</h2>
          {output.priorities.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              No priorities returned for today.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              {output.priorities.map((priority, index) => (
                <div
                  key={`${priority.title}-${index}`}
                  className="rounded-2xl border border-slate-200 bg-white px-5 py-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                        Priority {index + 1}
                      </p>
                      <p className="mt-1 text-lg font-semibold text-slate-900">
                        {priority.title}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                      <span className="rounded-full bg-slate-100 px-3 py-1">
                        {priority.category}
                      </span>
                      <span className="rounded-full bg-slate-100 px-3 py-1">
                        {priority.time_estimate_min} min
                      </span>
                      <span className="rounded-full bg-slate-100 px-3 py-1">
                        effort {priority.effort}/5
                      </span>
                      <span className="rounded-full bg-slate-100 px-3 py-1">
                        impact {priority.impact}/5
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-slate-600">{priority.why}</p>
                  <div className="mt-3 grid gap-3 text-xs text-slate-500 sm:grid-cols-2">
                    <div>
                      <p className="font-semibold text-slate-600">Assumptions</p>
                      <ul className="mt-1 list-disc space-y-1 pl-4">
                        {priority.assumptions.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-600">Variability</p>
                      <ul className="mt-1 list-disc space-y-1 pl-4">
                        {priority.variability.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  
                  {/* Feedback buttons */}
                  <div className="mt-4 pt-4 border-t border-slate-200">
                    <p className="text-xs text-slate-500 mb-2">Was this helpful?</p>
                    <div className="flex gap-2">
                      {(["helped", "neutral", "didnt_help"] as const).map((feedbackType) => {
                        const key = `${priority.title}-true`;
                        const isActive = feedbackState[key] === feedbackType;
                        const isSubmitting = submittingFeedback[key];
                        const labels = { helped: "👍 Helped", neutral: "😐 Neutral", didnt_help: "👎 Didn't help" };
                        
                        return (
                          <button
                            key={feedbackType}
                            onClick={() => submitFeedback(priority.title, priority.category, true, feedbackType)}
                            disabled={isSubmitting}
                            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                              isActive 
                                ? "bg-blue-100 border-blue-300 text-blue-800" 
                                : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                            } ${isSubmitting ? "opacity-50 cursor-wait" : ""}`}
                          >
                            {labels[feedbackType]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="animate-rise rounded-3xl border border-slate-200/70 bg-white/80 p-8 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">
            Today&apos;s Time Plan
          </h2>
          {output.schedule_plan.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              No time blocks could be placed today.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {output.schedule_plan.map((block, index) => (
                <div
                  key={`${block.title}-${block.start_ts}-${index}`}
                  className="rounded-2xl border border-slate-200 bg-white px-5 py-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                        {formatTimeRange(block.start_ts, block.end_ts)}
                      </p>
                      <p className="mt-1 text-base font-semibold text-slate-900">
                        {block.title}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                      <span className="rounded-full bg-slate-100 px-3 py-1">
                        {block.category}
                      </span>
                      <span className="rounded-full bg-slate-100 px-3 py-1">
                        {block.duration_min} min
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {block.why_this_time}
                  </p>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 grid gap-3 text-xs text-slate-600 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
              <p className="text-xs text-slate-500">Total free</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {output.free_time_summary.total_free_min} min
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
              <p className="text-xs text-slate-500">Largest window</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {output.free_time_summary.largest_window_min} min
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
              <p className="text-xs text-slate-500">Windows</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {output.free_time_summary.windows_count}
              </p>
            </div>
          </div>
        </section>

        <section className="animate-rise rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">
            What would improve this fastest
          </h2>
          {fastestImprovements.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              No fast improvements suggested today.
            </p>
          ) : (
            <ul className="mt-3 list-disc space-y-2 pl-4 text-sm text-slate-600">
              {fastestImprovements.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="space-y-6">
        <section className="animate-rise rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Risk flags</h2>
          <div className="mt-4 space-y-3 text-sm">
            {Object.entries(output.flags)
              .filter(([key, value]) => shouldShowFlag(key, value))
              .map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-slate-600">
                    {formatFlagLabel(key)}
                  </span>
                  <span className={riskChipClass(value)}>{value}</span>
                </div>
              ))}
          </div>
        </section>

        <section className="animate-rise rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Confidence</h2>
            <span className={confidenceChipClass(output.confidence)}>
              {confidenceLabel(output.confidence)}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Confidence reflects input consistency and coverage, not guarantees.
          </p>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Why confidence is {confidenceLabel(output.confidence).toLowerCase()}
              </p>
              <ul className="mt-2 list-disc space-y-2 pl-4 text-sm text-slate-600">
                {output.confidence_reasons.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            {output.data_quality_warnings.length > 0 ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Data quality notes
                </p>
                <ul className="mt-2 list-disc space-y-2 pl-4 text-sm text-slate-600">
                  {output.data_quality_warnings.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>

        <section className="animate-rise rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Variability</h2>
          <ul className="mt-3 list-disc space-y-2 pl-4 text-sm text-slate-600">
            {output.variability_notes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="animate-rise rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Avoid today</h2>
          {output.avoid_today.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              No specific avoidances flagged today.
            </p>
          ) : (
            <ul className="mt-3 list-disc space-y-2 pl-4 text-sm text-slate-600">
              {output.avoid_today.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="animate-rise rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Next best actions</h2>
          {output.next_best_actions.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              No additional actions suggested right now.
            </p>
          ) : (
            <ul className="mt-3 list-disc space-y-2 pl-4 text-sm text-slate-600">
              {output.next_best_actions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="animate-rise rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Reasoning</h2>
          <p className="mt-2 text-sm text-slate-600">{output.reasoning}</p>
          <div className="mt-4 space-y-3 text-xs text-slate-500">
            <div>
              <p className="font-semibold text-slate-600">Assumptions</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {output.assumptions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function formatFlagLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function riskChipClass(level: string): string {
  if (level === "high") {
    return "rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700";
  }
  if (level === "medium") {
    return "rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700";
  }
  return "rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700";
}

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.75) {
    return "High";
  }
  if (confidence >= 0.55) {
    return "Medium";
  }
  return "Low";
}

function confidenceChipClass(confidence: number): string {
  const label = confidenceLabel(confidence);
  if (label === "High") {
    return "rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700";
  }
  if (label === "Medium") {
    return "rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700";
  }
  return "rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700";
}

function shouldShowFlag(key: string, value: string) {
  if (key === "crisis_risk") {
    return value !== "low";
  }
  return true;
}

function buildFastestImprovements(output: Snapshot["output"]) {
  if (output.flags.crisis_risk === "high") {
    return ["Focus only on immediate support right now."];
  }

  const hints: string[] = [];
  const addHint = (hint: string) => {
    if (!hints.includes(hint)) {
      hints.push(hint);
    }
  };

  if (output.flags.compliance_risk === "high") {
    addHint("Handle one compliance item before anything optional.");
  }
  if (output.flags.burnout_risk === "high") {
    addHint("Take a recovery break before heavy work.");
  }
  if (output.flags.overload_risk === "high") {
    addHint("Limit today to three outcomes to reduce overload.");
  }
  if (output.flags.financial_risk === "high") {
    addHint("Review cash runway and upcoming obligations early.");
  }

  const lowest = Object.entries(output.breakdown).sort((a, b) => a[1] - b[1]);
  const breakdownHints: Record<string, string> = {
    energy: "Protect sleep and short recovery blocks to lift energy.",
    money: "Reduce money pressure with a quick runway review.",
    obligations: "Start with the most time-sensitive obligation.",
    growth: "Reserve one focused work block for progress.",
    stability: "Reduce scope and add buffers for stability."
  };

  for (const [key] of lowest) {
    const hint = breakdownHints[key];
    if (hint) {
      addHint(hint);
    }
    if (hints.length >= 3) {
      break;
    }
  }

  return hints.slice(0, 3);
}

function formatTimeRange(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return `${start} - ${end}`;
  }
  return `${startDate.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  })} - ${endDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function findCompressionNote(plan: Snapshot["output"]["schedule_plan"]) {
  for (const block of plan) {
    if (block.why_this_time.toLowerCase().includes("compressed")) {
      return block.why_this_time;
    }
  }
  return null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unable to load today\'s plan";
}
