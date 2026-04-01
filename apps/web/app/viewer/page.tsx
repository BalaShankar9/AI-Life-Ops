"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type SharedOwner = {
  user_id: string;
  email: string;
};

type RedactedWeekly = {
  week_start: string;
  summary: string;
  score_trend: string;
  top_risks: string[];
  next_week_focus: string[];
};

type RedactedHistoryItem = {
  date: string;
  life_stability_score: number;
  breakdown?: Record<string, number>;
  flags?: unknown;
};

type TodayShared = {
  date: string;
  life_stability_score: number;
  breakdown?: Record<string, number>;
};

export default function ViewerPage() {
  const [owners, setOwners] = useState<SharedOwner[]>([]);
  const [selectedOwner, setSelectedOwner] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"weekly" | "history" | "today">(
    "weekly"
  );
  const [weekly, setWeekly] = useState<RedactedWeekly | null>(null);
  const [history, setHistory] = useState<RedactedHistoryItem[]>([]);
  const [today, setToday] = useState<TodayShared | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadOwners() {
      try {
        const response = await fetch("http://localhost:4000/api/shared/users", {
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          if (data.ok) {
            setOwners(data.data.owners || []);
            if (data.data.owners.length > 0) {
              setSelectedOwner(data.data.owners[0].user_id);
            }
          }
        }
      } catch (error) {
        console.error("Failed to load owners:", error);
      } finally {
        setLoading(false);
      }
    }
    loadOwners();
  }, []);

  useEffect(() => {
    if (!selectedOwner) return;

    async function loadData() {
      try {
        if (activeTab === "weekly") {
          const response = await fetch(
            `http://localhost:4000/api/shared/${selectedOwner}/weekly/latest`,
            { credentials: "include" }
          );
          if (response.ok) {
            const data = await response.json();
            if (data.ok) setWeekly(data.data.weekly_report);
          }
        } else if (activeTab === "history") {
          const response = await fetch(
            `http://localhost:4000/api/shared/${selectedOwner}/history`,
            { credentials: "include" }
          );
          if (response.ok) {
            const data = await response.json();
            if (data.ok) setHistory(data.data.items || []);
          }
        } else if (activeTab === "today") {
          const response = await fetch(
            `http://localhost:4000/api/shared/${selectedOwner}/today`,
            { credentials: "include" }
          );
          if (response.ok) {
            const data = await response.json();
            if (data.ok) setToday(data.data.today);
          }
        }
      } catch (error) {
        console.error("Failed to load data:", error);
      }
    }
    loadData();
  }, [selectedOwner, activeTab]);

  if (loading) {
    return (
      <AppShell>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </AppShell>
    );
  }

  if (owners.length === 0) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <h1 className="text-2xl font-bold text-foreground">Viewer Portal</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            No users have granted you access to their data.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Viewer Portal</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Viewing aggregated, redacted insights only. Personal notes are not
            included.
          </p>
        </div>

        <Card className="border-warning/20 bg-warning/5">
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-foreground">
              <span className="font-semibold">Redacted data:</span> You are
              viewing aggregated insights. Personal notes, comments, and detailed
              assumptions are not visible.
            </p>
          </CardContent>
        </Card>

        {/* Owner selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            Viewing Data For:
          </label>
          <select
            value={selectedOwner || ""}
            onChange={(e) => setSelectedOwner(e.target.value)}
            className="w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {owners.map((o) => (
              <option key={o.user_id} value={o.user_id}>
                {o.email}
              </option>
            ))}
          </select>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as typeof activeTab)}
        >
          <TabsList>
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="today">Today</TabsTrigger>
          </TabsList>

          <TabsContent value="weekly" className="mt-4">
            {weekly ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Week of {weekly.week_start}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      Summary
                    </p>
                    <p className="text-foreground">{weekly.summary}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      Score Trend
                    </p>
                    <p className="text-foreground">{weekly.score_trend}</p>
                  </div>
                  {weekly.top_risks.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                        Top Risks
                      </p>
                      <ul className="list-disc pl-5 space-y-1 text-foreground">
                        {weekly.top_risks.map((risk, i) => (
                          <li key={i}>{risk}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {weekly.next_week_focus.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                        Next Week Focus
                      </p>
                      <ul className="list-disc pl-5 space-y-1 text-foreground">
                        {weekly.next_week_focus.map((focus, i) => (
                          <li key={i}>{focus}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <p className="text-sm text-muted-foreground">
                No weekly report available.
              </p>
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Daily History</CardTitle>
              </CardHeader>
              <CardContent>
                {history.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No history available.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {history.map((item, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between border-b border-border pb-2 last:border-0"
                      >
                        <span className="font-mono text-sm text-muted-foreground">
                          {item.date}
                        </span>
                        <Badge variant="secondary" className="font-mono">
                          {item.life_stability_score}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="today" className="mt-4">
            {today ? (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      Today ({today.date})
                    </CardTitle>
                    <div className="text-2xl font-bold text-foreground">
                      {today.life_stability_score}
                    </div>
                  </div>
                </CardHeader>
                {today.breakdown && (
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                      {Object.entries(today.breakdown).map(([key, val]) => (
                        <div
                          key={key}
                          className="rounded-lg border border-border bg-muted/50 p-3 text-center"
                        >
                          <p className="text-xs text-muted-foreground capitalize">
                            {key}
                          </p>
                          <p className="text-lg font-bold text-foreground">
                            {val}
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            ) : (
              <p className="text-sm text-muted-foreground">
                No today data available.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
