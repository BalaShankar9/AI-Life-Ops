import { cookies } from "next/headers";

import { AuditResponseSchema } from "@ai-life-ops/shared";
import type { AuditEvent } from "@ai-life-ops/shared";

import RequireAuth from "../components/require-auth";
import AuditView from "./audit-view";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:4000";

export default async function AuditPage() {
  const { events, error } = await loadAuditEvents();

  return (
    <RequireAuth allowDuringLoading>
      <section className="space-y-6">
        <div className="animate-rise">
          <h1 className="text-2xl font-semibold text-slate-900">Audit log</h1>
          <p className="mt-2 text-sm text-slate-600">
            Key account and system events for transparency.
          </p>
        </div>
        <AuditView initialEvents={events} initialError={error} />
      </section>
    </RequireAuth>
  );
}

async function loadAuditEvents(): Promise<{
  events: AuditEvent[] | null;
  error: string | null;
}> {
  const cookieHeader = getCookieHeader();
  if (!cookieHeader) {
    return { events: null, error: null };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/audit?limit=100`, {
      method: "GET",
      headers: {
        accept: "application/json",
        cookie: cookieHeader
      },
      cache: "no-store"
    });

    const { json, text } = await parseResponse(response);

    if (!response.ok) {
      return {
        events: null,
        error: extractErrorMessage(json, text, response.status)
      };
    }

    const parsed = AuditResponseSchema.safeParse(json);
    if (!parsed.success) {
      return { events: null, error: "Unable to load audit log." };
    }

    return { events: parsed.data.data.events, error: null };
  } catch {
    return { events: null, error: "Unable to reach the API." };
  }
}

function getCookieHeader(): string {
  const cookieStore = cookies();
  return cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

async function parseResponse(
  response: Response
): Promise<{ json: unknown | null; text: string }> {
  const text = await response.text();
  if (!text) {
    return { json: null, text: "" };
  }
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
  if (status === 401 || status === 403) {
    return "Please sign in to continue.";
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const error =
      record.error && typeof record.error === "object"
        ? (record.error as Record<string, unknown>)
        : null;
    if (error && typeof error.message === "string") {
      return error.message;
    }
  }

  const trimmed = text.trim();
  if (trimmed) {
    return trimmed.slice(0, 180);
  }

  return "Unable to load audit log.";
}
