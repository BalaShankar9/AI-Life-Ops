import { cookies } from "next/headers";

import { ConnectorsResponseSchema } from "@ai-life-ops/shared";

import RequireAuth from "../components/require-auth";
import CheckinForm from "./checkin-form";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:4000";

export default async function CheckinPage() {
  const calendarStatus = await loadCalendarStatus();

  const calendarBadgeVariant =
    calendarStatus === "connected"
      ? "default"
      : calendarStatus === "disconnected"
        ? "outline"
        : "secondary";

  const calendarText =
    calendarStatus === "connected"
      ? "Calendar connected. Busy blocks will shape today's plan."
      : calendarStatus === "disconnected"
        ? "Calendar not connected. Connect it for schedule-aware plans."
        : "Calendar status unavailable right now.";

  return (
    <RequireAuth>
      <AppShell>
        <div className="space-y-6">
          {/* Page header */}
          <div>
            <h1 className="text-2xl font-bold text-foreground">Daily check-in</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Capture today&apos;s signals so the engine can generate a calm, risk-aware plan.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
            {/* Main form */}
            <Card>
              <CardContent className="pt-6">
                <CheckinForm />
              </CardContent>
            </Card>

            {/* Sidebar info */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    How it works
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  The engine scores five life systems, raises risk flags, and builds
                  a top-three plan. It will never overload the day.
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold text-foreground">
                      Calendar
                    </CardTitle>
                    <Badge variant={calendarBadgeVariant} className="text-xs">
                      {calendarStatus === "connected" ? "Connected" : calendarStatus === "disconnected" ? "Disconnected" : "Unknown"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {calendarText}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </AppShell>
    </RequireAuth>
  );
}

async function loadCalendarStatus(): Promise<
  "connected" | "disconnected" | "unknown"
> {
  const cookieHeader = await getCookieHeader();
  if (!cookieHeader) {
    return "unknown";
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/connectors`, {
      method: "GET",
      headers: {
        accept: "application/json",
        cookie: cookieHeader,
      },
      cache: "no-store",
    });

    const text = await response.text();
    if (!response.ok) return "unknown";
    const json = text ? JSON.parse(text) : null;
    const parsed = ConnectorsResponseSchema.safeParse(json);
    if (!parsed.success) return "unknown";

    const connector = parsed.data.data.connectors.find(
      (item) => item.provider === "google_calendar"
    );
    if (!connector) return "disconnected";
    return connector.status === "connected" ? "connected" : "disconnected";
  } catch {
    return "unknown";
  }
}

async function getCookieHeader(): Promise<string> {
  const cookieStore = await cookies();
  return cookieStore
    .getAll()
    .map((cookie: { name: string; value: string }) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}
