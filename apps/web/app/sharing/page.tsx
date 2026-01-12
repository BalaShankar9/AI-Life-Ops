"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

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
  weekly_summary_only: "Weekly reports only: summary, score trends, top risks, next week focus",
  daily_scores_only: "Daily life stability scores and breakdown (energy/money/obligations/growth/stability)",
  daily_scores_and_flags: "Daily scores + risk flags (instability, energy collapse, growth stall, etc.)",
  daily_plan_redacted: "Daily scores + flags + plan (priorities and schedule - no personal notes)",
  scenario_reports_redacted: "Scenario simulation reports and analysis (redacted assumptions)",
  insights_metrics_only: "Personalization insights: score trends, feedback patterns, adaptations (no free-text)"
};

export default function SharingPage() {
  const router = useRouter();
  const [consents, setConsents] = useState<ConsentSummary[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [granting, setGranting] = useState(false);
  const [selectedViewer, setSelectedViewer] = useState("");
  const [selectedScope, setSelectedScope] = useState("daily_scores_only");

  useEffect(() => {
    async function load() {
      try {
        const [consentsRes, membersRes] = await Promise.all([
          fetch("http://localhost:4000/api/sharing/consents", { credentials: "include" }),
          fetch("http://localhost:4000/api/orgs/" + (localStorage.getItem("activeOrgId") || "") + "/members", { credentials: "include" })
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
          scope: selectedScope
        })
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
        body: JSON.stringify({ viewer_user_id: viewerUserId, scope })
      });

      if (response.ok) {
        setConsents(consents.filter((c) => !(c.viewer_user_id === viewerUserId && c.scope === scope)));
      }
    } catch (error) {
      console.error("Failed to revoke consent:", error);
    }
  };

  if (loading) {
    return <div className="text-center text-gray-500">Loading...</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Sharing Controls</h1>

      <div className="bg-blue-50 border border-blue-200 rounded p-4 mb-6">
        <p className="text-sm text-blue-900">
          <strong>Privacy Note:</strong> All shared data is redacted. Viewers will never see your personal notes,
          comments, or detailed assumptions. Only aggregate scores, trends, and safe metadata are shared.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Grant Access</h2>
        <form onSubmit={handleGrant} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Select Member</label>
            <select
              value={selectedViewer}
              onChange={(e) => setSelectedViewer(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2"
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

          <div>
            <label className="block text-sm font-medium mb-1">Access Scope</label>
            <select
              value={selectedScope}
              onChange={(e) => setSelectedScope(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2"
            >
              {Object.entries(SCOPE_DESCRIPTIONS).map(([scope, desc]) => (
                <option key={scope} value={scope}>
                  {scope}
                </option>
              ))}
            </select>
            <p className="text-sm text-gray-600 mt-1">{SCOPE_DESCRIPTIONS[selectedScope]}</p>
          </div>

          <button
            type="submit"
            disabled={granting || !selectedViewer}
            className="bg-blue-600 text-white px-4 py-2 rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {granting ? "Granting..." : "Grant Consent"}
          </button>
        </form>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Active Consents ({consents.length})</h2>
        {consents.length === 0 ? (
          <p className="text-gray-500 text-sm">No active consents.</p>
        ) : (
          <div className="space-y-3">
            {consents.map((c) => (
              <div key={c.id} className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div>
                  <div className="font-medium">{c.viewer_email}</div>
                  <div className="text-sm text-gray-600">{c.scope}</div>
                  <div className="text-xs text-gray-400">Granted {new Date(c.created_at).toLocaleDateString()}</div>
                </div>
                <button
                  onClick={() => handleRevoke(c.viewer_user_id, c.scope)}
                  className="text-red-600 text-sm font-semibold hover:underline"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
