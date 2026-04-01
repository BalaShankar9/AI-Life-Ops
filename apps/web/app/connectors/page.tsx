import { cookies } from "next/headers";

import { ConnectorsResponseSchema } from "@ai-life-ops/shared";
import type { ConnectorSummary } from "@ai-life-ops/shared";

import RequireAuth from "../components/require-auth";
import ConnectorsView from "./connectors-view";
import { AppShell } from "@/components/layout/app-shell";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:4000";

export default async function ConnectorsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[]>;
}) {
  const { connectors, error } = await loadConnectors();
  const connected =
    typeof searchParams?.connected === "string"
      ? searchParams.connected
      : Array.isArray(searchParams?.connected)
        ? searchParams?.connected[0]
        : null;

  return (
    <RequireAuth allowDuringLoading>
      <AppShell>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Connectors</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Sync external data sources into a secure, canonical events store.
            </p>
          </div>
          <ConnectorsView
            initialConnectors={connectors}
            initialError={error}
            connectedProvider={connected}
          />
        </div>
      </AppShell>
    </RequireAuth>
  );
}

async function loadConnectors(): Promise<{
  connectors: ConnectorSummary[] | null;
  error: string | null;
}> {
  const cookieHeader = await getCookieHeader();
  if (!cookieHeader) return { connectors: null, error: null };

  try {
    const response = await fetch(`${API_BASE_URL}/api/connectors`, {
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
        connectors: null,
        error: extractErrorMessage(json, text, response.status),
      };
    }

    const parsed = ConnectorsResponseSchema.safeParse(json);
    if (!parsed.success) {
      return { connectors: null, error: "Unable to load connectors." };
    }

    return { connectors: parsed.data.data.connectors, error: null };
  } catch {
    return { connectors: null, error: "Unable to reach the API." };
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
  return "Unable to load connectors.";
}
