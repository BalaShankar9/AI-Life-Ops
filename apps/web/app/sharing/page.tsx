"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";

type ConsentSummary = {
  id: string;
  org_id: string;
  viewer_user_id: string;
  viewer_email: string;
  scope: string;
  status: string;
  created_at: string;
};

type OrgMember = {
  user_id: string;
  email: string;
  role: string;
  status: string;
};

const SCOPE_DESCRIPTIONS: Record<string, string> = {
  weekly_summary_only:
    "Weekly reports only: summary, score trends, top risks, next week focus",
  daily_scores_only:
    "Daily life stability scores and breakdown (energy/money/obligations/growth/stability)",
  daily_scores_and_flags:
    "Daily scores + risk flags (instability, energy collapse, growth stall, etc.)",
  daily_plan_redacted:
    "Daily scores + flags + plan (priorities and schedule - no personal notes)",
  scenario_reports_redacted:
    "Scenario simulation reports and analysis (redacted assumptions)",
  insights_metrics_only:
    "Personalization insights: score trends, feedback patterns, adaptations (no free-text)",
};

export default function SharingPage() {
  const [consents, setConsents] = useState<ConsentSummary[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [granting, setGranting] = useState(false);
  const [selectedViewer, setSelectedViewer] = useState("");
  const [selectedScope, setSelectedScope] = useState("daily_scores_only");

  useEffect(() => {
    async function load() {
      try {
        const orgId =
          typeof window !== "undefined"
            ? localStorage.getItem("activeOrgId") || ""
            : "";
        const [consentsRes, membersRes] = await Promise.all([
          fetch("http://localhost:4000/api/sharing/consents", {
            credentials: "include",
          }),
          fetch(`http://localhost:4000/api/orgs/${orgId}/members`, {
            credentials: "include",
          }),
        ]);

        if (consentsRes.ok) {
          const data = await consentsRes.json();
          if (data.ok) setConsents(data.data.consents || []);
        }
        if (membersRes.ok) {
          const data = await membersRes.json();
          if (data.ok) setMembers(data.data.members || []);
        }
      } catch (error) {
        console.error("Failed to load:", error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedViewer) return;

    setGranting(true);
    try {
      const response = await fetch("http://localhost:4000/api/sharing/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          viewer_user_id: selectedViewer,
          scope: selectedScope,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ok) {
          setConsents([...consents, data.data.consent]);
          setSelectedViewer("");
        }
      }
    } catch (error) {
      console.error("Failed to grant consent:", error);
    } finally {
      setGranting(false);
    }
  };

  const handleRevoke = async (viewerUserId: string, scope: string) => {
    if (!confirm("Revoke this consent?")) return;

    try {
      const response = await fetch("http://localhost:4000/api/sharing/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ viewer_user_id: viewerUserId, scope }),
      });

      if (response.ok) {
        setConsents(
          consents.filter(
            (c) => !(c.viewer_user_id === viewerUserId && c.scope === scope)
          )
        );
      }
    } catch (error) {
      console.error("Failed to revoke consent:", error);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sharing Controls</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Grant org members controlled, redacted access to your data.
          </p>
        </div>

        {/* Privacy notice */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-foreground">
              <span className="font-semibold">Privacy note:</span> All shared data is
              redacted. Viewers never see personal notes, comments, or detailed
              assumptions — only aggregate scores, trends, and safe metadata.
            </p>
          </CardContent>
        </Card>

        {/* Grant access */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Grant Access</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : (
              <form onSubmit={handleGrant} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="viewer">Select Member</Label>
                  <select
                    id="viewer"
                    value={selectedViewer}
                    onChange={(e) => setSelectedViewer(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    required
                  >
                    <option value="">-- Choose a member --</option>
                    {members
                      .filter((m) => m.status === "active" && m.role !== "owner")
                      .map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.email} ({m.role})
                        </option>
                      ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="scope">Access Scope</Label>
                  <select
                    id="scope"
                    value={selectedScope}
                    onChange={(e) => setSelectedScope(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {Object.entries(SCOPE_DESCRIPTIONS).map(([scope]) => (
                      <option key={scope} value={scope}>
                        {scope}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    {SCOPE_DESCRIPTIONS[selectedScope]}
                  </p>
                </div>

                <Button type="submit" disabled={granting || !selectedViewer}>
                  {granting ? "Granting..." : "Grant Consent"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Active consents */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Active Consents</CardTitle>
              <Badge variant="secondary">{consents.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : consents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active consents.</p>
            ) : (
              <div className="space-y-3">
                {consents.map((c, i) => (
                  <div key={c.id}>
                    {i > 0 && <Separator className="mb-3" />}
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">
                          {c.viewer_email}
                        </p>
                        <Badge variant="outline" className="text-xs font-mono">
                          {c.scope}
                        </Badge>
                        <p className="text-xs text-muted-foreground">
                          Granted {new Date(c.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                        onClick={() => handleRevoke(c.viewer_user_id, c.scope)}
                      >
                        Revoke
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
