import { cookies } from "next/headers";

import { WeeklyReportResponseSchema } from "@ai-life-ops/shared";
import type { WeeklyReport } from "@ai-life-ops/shared";

import RequireAuth from "../components/require-auth";
import NonMedicalDisclaimer from "../components/non-medical-disclaimer";
import WeeklyView from "./weekly-view";
import { AppShell } from "@/components/layout/app-shell";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:4000";

export default async function WeeklyPage() {
  const { report, error } = await loadLatestReport();

  return (
    <RequireAuth allowDuringLoading>
      <AppShell>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Weekly review</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Deterministic weekly summaries based on stored snapshots.
            </p>
          </div>
          <WeeklyView initialReport={report} initialError={error} />
          <NonMedicalDisclaimer />
        </div>
      </AppShell>
    </RequireAuth>
  );
}

async function loadLatestReport(): Promise<{
  report: WeeklyReport | null;
  error: string | null;
}> {
  const cookieHeader = await getCookieHeader();
  if (!cookieHeader) return { report: null, error: null };

  try {
    const response = await fetch(`${API_BASE_URL}/api/weekly/latest`, {
      method: "GET",
      headers: {
        accept: "application/json",
        cookie: cookieHeader,
      },
      cache: "no-store",
    });

    const { json, text } = await parseResponse(response);

    if (!response.ok) {
      return {
        report: null,
        error: extractErrorMessage(json, text, response.status),
      };
    }

    const parsed = WeeklyReportResponseSchema.safeParse(json);
    if (!parsed.success) {
      return { report: null, error: "Unable to load weekly review." };
    }

    return { report: parsed.data.data.report, error: null };
  } catch {
    return { report: null, error: "Unable to reach the API." };
  }
}

async function getCookieHeader(): Promise<string> {
  const cookieStore = await cookies();
  return cookieStore
    .getAll()
    .map((cookie: { name: string; value: string }) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

async function parseResponse(
  response: Response
): Promise<{ json: unknown | null; text: string }> {
  const text = await response.text();
  if (!text) return { json: null, text: "" };
  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { json: null, text };
  }
}

function extractErrorMessage(
  payload: unknown,
  text: string,
  status: number
): string {
  if (status === 401 || status === 403) return "Please sign in to continue.";

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const error =
      record.error && typeof record.error === "object"
        ? (record.error as Record<string, unknown>)
        : null;
    if (error && typeof error.message === "string") return error.message;
  }

  const trimmed = text.trim();
  if (trimmed) return trimmed.slice(0, 180);
  return "Unable to load weekly review.";
}
