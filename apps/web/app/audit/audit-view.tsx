"use client";

import { useEffect, useMemo, useState } from "react";

import type { AuditEvent } from "@ai-life-ops/shared";

import { fetchAuditEvents } from "../lib/api";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; events: AuditEvent[] };

export default function AuditView({
  initialEvents,
  initialError
}: {
  initialEvents?: AuditEvent[] | null;
  initialError?: string | null;
}) {
  const [state, setState] = useState<LoadState>(() => {
    if (initialEvents) {
      return { status: "ready", events: initialEvents };
    }
    if (initialError) {
      return { status: "error", message: initialError };
    }
    return { status: "loading" };
  });

  useEffect(() => {
    let active = true;

    if (initialEvents || initialError) {
      return () => {
        active = false;
      };
    }

    fetchAuditEvents(100)
      .then((events) => {
        if (active) {
          setState({ status: "ready", events });
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
  }, [initialEvents, initialError]);

  const grouped = useMemo(() => {
    if (state.status !== "ready") {
      return [];
    }
    return groupByDay(state.events);
  }, [state]);

  if (state.status === "loading") {
    return (
      <div className="animate-rise rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
        <p className="text-sm text-slate-500">Loading audit log...</p>
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

  if (grouped.length === 0) {
    return (
      <div className="animate-rise rounded-3xl border border-slate-200/70 bg-white/80 p-6 text-sm text-slate-500 shadow-sm">
        No audit events recorded yet.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {grouped.map((group) => (
        <section
          key={group.date}
          className="animate-rise rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            {group.date}
          </p>
          <div className="mt-4 space-y-3">
            {group.events.map((event) => (
              <div
                key={`${event.event_type}-${event.created_at}`}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    {formatEventType(event.event_type)}
                  </p>
                  <p className="text-xs text-slate-400">
                    {formatTime(event.created_at)}
                  </p>
                </div>
                <p className="mt-2 text-sm text-slate-700">
                  {event.metadata_summary}
                </p>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function groupByDay(events: AuditEvent[]) {
  const groups = new Map<string, AuditEvent[]>();
  for (const event of events) {
    const dateLabel = formatDate(event.created_at);
    if (!groups.has(dateLabel)) {
      groups.set(dateLabel, []);
    }
    groups.get(dateLabel)!.push(event);
  }
  return Array.from(groups.entries()).map(([date, items]) => ({
    date,
    events: items
  }));
}

function formatDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

function formatTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatEventType(eventType: string) {
  return eventType.replace(/_/g, " ");
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unable to load audit log.";
}
