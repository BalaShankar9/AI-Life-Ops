import { cookies } from "next/headers";

import { ConnectorsResponseSchema } from "@ai-life-ops/shared";

import RequireAuth from "../components/require-auth";
import CheckinForm from "./checkin-form";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:4000";

export default async function CheckinPage() {
  const calendarStatus = await loadCalendarStatus();
  return (
    <RequireAuth>
      <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="animate-rise rounded-3xl border border-slate-200/70 bg-white/80 p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">
            Daily check-in
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Capture today&apos;s signals so the engine can generate a calm,
            risk-aware plan.
          </p>
          <div className="mt-6">
            <CheckinForm />
          </div>
        </div>
        <aside className="animate-rise space-y-4 rounded-3xl border border-slate-200/70 bg-white/80 p-6 text-sm text-slate-600 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              How it works
            </p>
            <p className="mt-2">
              The engine scores five life systems, raises risk flags, and builds
              a top-three plan. It will never overload the day.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <p className="font-semibold text-slate-700">Session</p>
            <p className="mt-1">
              You are signed in with a secure session cookie. Data stays tied to
              your account.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <p className="font-semibold text-slate-700">Calendar</p>
            <p className="mt-1">
              {calendarStatus === "connected"
                ? "Calendar connected. Busy blocks will shape today's plan."
                : calendarStatus === "disconnected"
                  ? "Calendar not connected. Connect it for schedule-aware plans."
                  : "Calendar status unavailable right now."}
            </p>
          </div>
        </aside>
      </section>
    </RequireAuth>
  );
}

async function loadCalendarStatus(): Promise<
  "connected" | "disconnected" | "unknown"
> {
  const cookieHeader = getCookieHeader();
  if (!cookieHeader) {
    return "unknown";
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/connectors`, {
      method: "GET",
      headers: {
        accept: "application/json",
        cookie: cookieHeader
      },
      cache: "no-store"
    });

    const text = await response.text();
    if (!response.ok) {
      return "unknown";
    }
    const json = text ? JSON.parse(text) : null;
    const parsed = ConnectorsResponseSchema.safeParse(json);
    if (!parsed.success) {
      return "unknown";
    }

    const connector = parsed.data.data.connectors.find(
      (item) => item.provider === "google_calendar"
    );
    if (!connector) {
      return "disconnected";
    }

    return connector.status === "connected" ? "connected" : "disconnected";
  } catch {
    return "unknown";
  }
}

function getCookieHeader(): string {
  const cookieStore = cookies();
  return cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}
