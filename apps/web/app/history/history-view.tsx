"use client";

import { useEffect, useMemo, useState } from "react";

import type { HistoryItem } from "@ai-life-ops/shared";

import { fetchHistory } from "../lib/api";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; items: HistoryItem[] };

export default function HistoryView() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [selected, setSelected] = useState<HistoryItem | null>(null);

  useEffect(() => {
    let active = true;
    fetchHistory(30)
      .then((items) => {
        if (active) {
          setState({ status: "ready", items });
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
  }, []);

  const sortedItems = useMemo(() => {
    if (state.status !== "ready") {
      return [];
    }
    return [...state.items].sort((a, b) => b.date.localeCompare(a.date));
  }, [state]);

  if (state.status === "loading") {
    return (
      <div className="animate-rise rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
        <p className="text-sm text-slate-500">Loading history...</p>
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

  return (
    <div className="space-y-4">
      <div className="animate-rise overflow-hidden rounded-3xl border border-slate-200/70 bg-white/80 shadow-sm">
        <div className="grid grid-cols-[1.4fr_0.6fr_1fr] gap-4 border-b border-slate-200/70 bg-slate-50/80 px-6 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          <span>Date</span>
          <span>Score</span>
          <span>Flags</span>
        </div>
        {sortedItems.length === 0 ? (
          <div className="px-6 py-6 text-sm text-slate-500">
            No history yet. Complete a check-in to create your first snapshot.
          </div>
        ) : (
          <div className="divide-y divide-slate-200/70">
            {sortedItems.map((item) => (
              <button
                key={item.date}
                type="button"
                onClick={() => setSelected(item)}
                className="grid w-full grid-cols-[1.4fr_0.6fr_1fr] gap-4 px-6 py-4 text-left text-sm transition hover:bg-slate-50"
              >
                <span className="font-medium text-slate-900">
                  {formatDate(item.date)}
                </span>
                <span className="text-slate-700">
                  {item.life_stability_score}
                </span>
                <span className="flex flex-wrap gap-2">
                  {Object.entries(item.flags)
                    .filter(([key, value]) => shouldShowFlag(key, value))
                    .map(([key, value]) => (
                      <span key={key} className={riskChipClass(value)}>
                        {shortFlagLabel(key)}: {value}
                      </span>
                    ))}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected ? (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/30 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Snapshot
                </p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900">
                  {formatDate(selected.date)}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-800"
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <p>
                Life Stability Score: {selected.life_stability_score}
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(selected.flags)
                  .filter(([key, value]) => shouldShowFlag(key, value))
                  .map(([key, value]) => (
                    <span key={key} className={riskChipClass(value)}>
                      {formatFlagLabel(key)}: {value}
                    </span>
                  ))}
              </div>
              <p className="text-xs text-slate-500">
                Detailed snapshot content is available in the Today view for the
                most recent plan.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function shortFlagLabel(key: string): string {
  return key
    .replace(/_risk$/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
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

function shouldShowFlag(key: string, value: string) {
  if (key === "crisis_risk") {
    return value !== "low";
  }
  return true;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unable to load history";
}
