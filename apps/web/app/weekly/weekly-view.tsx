"use client";

import { useMemo, useState } from "react";
import type { WeeklyReport } from "@ai-life-ops/shared";

import { downloadWeeklyPdf, generateWeeklyReport } from "../lib/api";

type LoadState =
  | { status: "idle"; report: WeeklyReport | null }
  | { status: "loading"; report: WeeklyReport | null }
  | { status: "error"; report: WeeklyReport | null; message: string };

export default function WeeklyView({
  initialReport,
  initialError
}: {
  initialReport?: WeeklyReport | null;
  initialError?: string | null;
}) {
  const [state, setState] = useState<LoadState>(() => {
    if (initialError) {
      return { status: "error", report: initialReport ?? null, message: initialError };
    }
    return { status: "idle", report: initialReport ?? null };
  });
  const [weekStart, setWeekStart] = useState(
    initialReport?.week_start ?? getWeekStart()
  );
  const [downloading, setDownloading] = useState(false);

  const report = state.report;
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const fastestImprovements = useMemo(
    () => (report ? buildWeeklyImprovements(report) : []),
    [report]
  );

  const handleGenerate = async () => {
    setState((prev) => ({ status: "loading", report: prev.report }));
    try {
      const nextReport = await generateWeeklyReport(weekStart);
      setState({ status: "idle", report: nextReport });
      setWeekStart(nextReport.week_start);
    } catch (error) {
      setState((prev) => ({
        status: "error",
        report: prev.report,
        message: getErrorMessage(error)
      }));
    }
  };

  const handleDownload = async () => {
    const targetWeek = report?.week_start || weekStart;
    if (!targetWeek) {
      setState((prev) => ({
        status: "error",
        report: prev.report,
        message: "Select a week before downloading."
      }));
      return;
    }

    setDownloading(true);
    try {
      const blob = await downloadWeeklyPdf(targetWeek);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `weekly-review-${targetWeek}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setState((prev) => ({
        status: "error",
        report: prev.report,
        message: getErrorMessage(error)
      }));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-6">
        <section className="animate-rise rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Week window
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-900">
                {weekStart} to {weekEnd}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="week-start"
                  className="text-xs font-semibold text-slate-500"
                >
                  Week start
                </label>
                <input
                  id="week-start"
                  type="date"
                  value={weekStart}
                  onChange={(event) => setWeekStart(event.target.value)}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm"
                />
              </div>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={state.status === "loading"}
                className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
              >
                {state.status === "loading"
                  ? "Generating..."
                  : "Generate weekly review"}
              </button>
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {downloading ? "Preparing PDF..." : "Download weekly PDF"}
              </button>
            </div>
          </div>
        </section>

        {state.status === "error" ? (
          <div
            className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
            role="alert"
          >
            {state.message}
          </div>
        ) : null}

        {report ? (
          <section className="animate-rise rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Summary
            </p>
            <p className="mt-3 text-sm text-slate-700">
              {report.content.summary}
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                <p className="text-xs text-slate-500">Score trend</p>
                <p className="mt-1 text-lg font-semibold text-slate-800">
                  {report.content.score_trend.start_score} to{" "}
                  {report.content.score_trend.end_score} ({formatDelta(
                    report.content.score_trend.delta
                  )})
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                <p className="text-xs text-slate-500">Confidence</p>
                <p className="mt-1 text-lg font-semibold text-slate-800">
                  {(report.content.confidence * 100).toFixed(0)}% (
                  {confidenceLabel(report.content.confidence)})
                </p>
              </div>
            </div>
          </section>
        ) : (
          <section className="animate-rise rounded-3xl border border-slate-200/70 bg-white/80 p-6 text-sm text-slate-500 shadow-sm">
            Generate a weekly review to see your trend summary.
          </section>
        )}

        {report ? (
          <section className="animate-rise rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Next week focus</h2>
            {report.content.next_week_focus.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                No focus items yet. Generate a new review after more check-ins.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {report.content.next_week_focus.map((item) => (
                  <div
                    key={item.title}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                  >
                    <p className="text-sm font-semibold text-slate-900">
                      {item.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">{item.why}</p>
                    <p className="mt-2 text-xs font-semibold text-slate-500">
                      Target: {item.target}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {report ? (
          <section className="animate-rise rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">
              What would improve this fastest
            </h2>
            {fastestImprovements.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                No fast improvements suggested for this week yet.
              </p>
            ) : (
              <ul className="mt-3 list-disc space-y-2 pl-4 text-sm text-slate-600">
                {fastestImprovements.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </div>

      <div className="space-y-6">
        {report ? (
          <section className="animate-rise rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Top risks</h2>
            {report.content.top_risks.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                No recurring risks surfaced this week.
              </p>
            ) : (
              <ul className="mt-3 space-y-3 text-sm text-slate-600">
                {report.content.top_risks.map((risk) => (
                  <li key={risk.flag} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                      {risk.flag.replace(/_/g, " ")}
                    </p>
                    <p className="mt-2 text-sm text-slate-700">
                      {risk.why_it_matters}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      Flagged {risk.frequency} day{risk.frequency === 1 ? "" : "s"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {report ? (
          <section className="animate-rise rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Confidence</h2>
              <span className={confidenceChipClass(report.content.confidence)}>
                {confidenceLabel(report.content.confidence)}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Confidence reflects snapshot coverage and signal consistency.
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-4 text-sm text-slate-600">
              {report.content.confidence_reasons.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {report ? (
          <section className="animate-rise rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Variability</h2>
            <ul className="mt-3 list-disc space-y-2 pl-4 text-sm text-slate-600">
              {report.content.variability_notes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {report ? (
          <section className="animate-rise rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Wins + misses</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Wins
                </p>
                {report.content.wins.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">No wins logged.</p>
                ) : (
                  <ul className="mt-2 list-disc space-y-2 pl-4 text-sm text-slate-600">
                    {report.content.wins.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Misses
                </p>
                {report.content.misses.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">No misses logged.</p>
                ) : (
                  <ul className="mt-2 list-disc space-y-2 pl-4 text-sm text-slate-600">
                    {report.content.misses.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function getWeekStart(date = new Date()) {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = local.getDay();
  const offset = (day + 6) % 7;
  local.setDate(local.getDate() - offset);
  return local.toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number) {
  const base = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) {
    return isoDate;
  }
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function formatDelta(delta: number) {
  if (delta > 0) {
    return `+${delta}`;
  }
  return `${delta}`;
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

function buildWeeklyImprovements(report: WeeklyReport) {
  const hints: string[] = [];
  const addHint = (hint: string) => {
    if (!hints.includes(hint)) {
      hints.push(hint);
    }
  };

  for (const risk of report.content.top_risks) {
    if (risk.flag === "burnout_risk") {
      addHint("Add more recovery blocks to reduce burnout risk.");
    }
    if (risk.flag === "financial_risk") {
      addHint("Review cash runway and next obligations early in the week.");
    }
    if (risk.flag === "compliance_risk") {
      addHint("Close one compliance item before midweek.");
    }
    if (risk.flag === "overload_risk") {
      addHint("Limit daily scope to three outcomes to reduce overload.");
    }
  }

  const breakdown = report.content.breakdown_trends;
  const scored = Object.entries(breakdown).map(([key, trend]) => ({
    key,
    value: trend.end
  }));
  scored.sort((a, b) => a.value - b.value);

  const breakdownHints: Record<string, string> = {
    energy: "Stabilize energy with consistent recovery blocks.",
    money: "Reduce money pressure with a focused runway review.",
    obligations: "Front-load the most time-sensitive obligations.",
    growth: "Protect one deep work block on at least two days.",
    stability: "Reduce scope and add buffers for stability."
  };

  for (const item of scored) {
    const hint = breakdownHints[item.key];
    if (hint) {
      addHint(hint);
    }
    if (hints.length >= 3) {
      break;
    }
  }

  return hints.slice(0, 3);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unable to update weekly review.";
}
