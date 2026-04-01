"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type AuditEvent = {
  id: string;
  event_type: string;
  created_at: string;
  actor_user_id: string;
  metadata_summary: string | null;
};

type Membership = {
  user_id: string;
  email: string;
  role: string;
  status: string;
  joined_at: string;
};

type Consent = {
  id: string;
  owner_email: string;
  viewer_email: string;
  scope: string;
  status: string;
  created_at: string;
  revoked_at: string | null;
};

type SharedAccessLog = {
  id: string;
  owner_email: string;
  viewer_email: string;
  action: string;
  created_at: string;
};

export default function OrgAuditPage() {
  const [activeTab, setActiveTab] = useState<"events" | "access" | "logs">(
    "events"
  );
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [consents, setConsents] = useState<Consent[]>([]);
  const [logs, setLogs] = useState<SharedAccessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        if (activeTab === "events") {
          const response = await fetch("http://localhost:4000/api/org/audit", {
            credentials: "include",
          });
          if (response.ok) {
            const data = await response.json();
            if (data.ok) setEvents(data.data.events || []);
          }
        } else if (activeTab === "access") {
          const response = await fetch(
            "http://localhost:4000/api/org/access-review",
            { credentials: "include" }
          );
          if (response.ok) {
            const data = await response.json();
            if (data.ok) {
              setMemberships(data.data.memberships || []);
              setConsents(data.data.consents || []);
            }
          }
        } else if (activeTab === "logs") {
          const response = await fetch(
            "http://localhost:4000/api/org/shared-access-logs",
            { credentials: "include" }
          );
          if (response.ok) {
            const data = await response.json();
            if (data.ok) setLogs(data.data.logs || []);
          }
        }
      } catch (error) {
        console.error("Failed to load audit data:", error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [activeTab]);

  const handleExport = async (format: "json" | "pdf") => {
    setExporting(true);
    try {
      const response = await fetch(
        `http://localhost:4000/api/org/access-review/export.${format}`,
        { credentials: "include" }
      );
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `access-review-${Date.now()}.${format}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("Failed to export:", error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Organization Audit Center
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Org-wide visibility for SOC2 compliance. All logs are immutable
              and metadata-only.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport("json")}
              disabled={exporting}
            >
              Export JSON
            </Button>
            <Button
              size="sm"
              onClick={() => handleExport("pdf")}
              disabled={exporting}
            >
              Export PDF
            </Button>
          </div>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as typeof activeTab)}
        >
          <TabsList>
            <TabsTrigger value="events">Audit Events</TabsTrigger>
            <TabsTrigger value="access">Access Review</TabsTrigger>
            <TabsTrigger value="logs">Shared Access Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="events" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Audit Events</CardTitle>
                  <Badge variant="secondary">{events.length}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <div
                        key={i}
                        className="h-10 animate-pulse rounded-lg bg-muted"
                      />
                    ))}
                  </div>
                ) : events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No events found.</p>
                ) : (
                  <div className="space-y-2">
                    {events.map((event) => (
                      <div
                        key={event.id}
                        className="flex items-center justify-between border-b border-border pb-2 last:border-0"
                      >
                        <div>
                          <span className="text-sm font-medium text-foreground">
                            {event.event_type}
                          </span>
                          {event.metadata_summary && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {event.metadata_summary}
                            </p>
                          )}
                        </div>
                        <span className="text-xs font-mono text-muted-foreground shrink-0 ml-4">
                          {new Date(event.created_at).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="access" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Members</CardTitle>
                  <Badge variant="secondary">{memberships.length}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                      <div
                        key={i}
                        className="h-10 animate-pulse rounded-lg bg-muted"
                      />
                    ))}
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="pb-2 font-medium">Email</th>
                        <th className="pb-2 font-medium">Role</th>
                        <th className="pb-2 font-medium">Status</th>
                        <th className="pb-2 font-medium">Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {memberships.map((m) => (
                        <tr
                          key={m.user_id}
                          className="border-b border-border/50 last:border-0"
                        >
                          <td className="py-2 text-foreground">{m.email}</td>
                          <td className="py-2 text-muted-foreground capitalize">
                            {m.role}
                          </td>
                          <td className="py-2">
                            <Badge
                              variant={
                                m.status === "active" ? "default" : "secondary"
                              }
                              className="text-xs"
                            >
                              {m.status}
                            </Badge>
                          </td>
                          <td className="py-2 font-mono text-xs text-muted-foreground">
                            {new Date(m.joined_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Consent Grants</CardTitle>
                  <Badge variant="secondary">{consents.length}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                      <div
                        key={i}
                        className="h-10 animate-pulse rounded-lg bg-muted"
                      />
                    ))}
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="pb-2 font-medium">Owner</th>
                        <th className="pb-2 font-medium">Viewer</th>
                        <th className="pb-2 font-medium">Scope</th>
                        <th className="pb-2 font-medium">Status</th>
                        <th className="pb-2 font-medium">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {consents.map((c) => (
                        <tr
                          key={c.id}
                          className="border-b border-border/50 last:border-0"
                        >
                          <td className="py-2 text-foreground">{c.owner_email}</td>
                          <td className="py-2 text-foreground">{c.viewer_email}</td>
                          <td className="py-2">
                            <span className="font-mono text-xs text-muted-foreground">
                              {c.scope}
                            </span>
                          </td>
                          <td className="py-2">
                            <Badge
                              variant={
                                c.status === "active" ? "default" : "destructive"
                              }
                              className="text-xs"
                            >
                              {c.status}
                            </Badge>
                          </td>
                          <td className="py-2 font-mono text-xs text-muted-foreground">
                            {new Date(c.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="logs" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Shared Access Logs</CardTitle>
                  <Badge variant="secondary">{logs.length}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <div
                        key={i}
                        className="h-10 animate-pulse rounded-lg bg-muted"
                      />
                    ))}
                  </div>
                ) : logs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No logs found.</p>
                ) : (
                  <div className="space-y-2">
                    {logs.map((log) => (
                      <div
                        key={log.id}
                        className="flex items-center justify-between border-b border-border pb-2 last:border-0"
                      >
                        <div>
                          <span className="text-sm font-medium text-foreground">
                            {log.action}
                          </span>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {log.viewer_email} &rarr; {log.owner_email}
                          </p>
                        </div>
                        <span className="text-xs font-mono text-muted-foreground shrink-0 ml-4">
                          {new Date(log.created_at).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
