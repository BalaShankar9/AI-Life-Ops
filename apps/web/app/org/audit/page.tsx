"use client";

import { useState, useEffect } from "react";

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
  const [activeTab, setActiveTab] = useState<"events" | "access" | "logs">("events");
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [consents, setConsents] = useState<Consent[]>([]);
  const [logs, setLogs] = useState<SharedAccessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        if (activeTab === "events") {
          const response = await fetch("http://localhost:4000/api/org/audit", {
            credentials: "include"
          });
          if (response.ok) {
            const data = await response.json();
            if (data.ok) setEvents(data.data.events || []);
          }
        } else if (activeTab === "access") {
          const response = await fetch("http://localhost:4000/api/org/access-review", {
            credentials: "include"
          });
          if (response.ok) {
            const data = await response.json();
            if (data.ok) {
              setMemberships(data.data.memberships || []);
              setConsents(data.data.consents || []);
            }
          }
        } else if (activeTab === "logs") {
          const response = await fetch("http://localhost:4000/api/org/shared-access-logs", {
            credentials: "include"
          });
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
      const response = await fetch(`http://localhost:4000/api/org/access-review/export.${format}`, {
        credentials: "include"
      });

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
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Organization Audit Center</h1>
        <div className="flex gap-2">
          <button
            onClick={() => handleExport("json")}
            disabled={exporting}
            className="bg-gray-600 text-white px-3 py-1.5 rounded text-sm font-semibold hover:bg-gray-700 disabled:opacity-50"
          >
            Export JSON
          </button>
          <button
            onClick={() => handleExport("pdf")}
            disabled={exporting}
            className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            Export PDF
          </button>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded p-4 mb-6">
        <p className="text-sm text-blue-900">
          <strong>SOC2 Readiness:</strong> This audit center provides org-wide visibility for compliance.
          All logs are immutable and metadata-only. No personal notes or comments are included in exports.
        </p>
      </div>

      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab("events")}
            className={`px-4 py-2 font-medium text-sm ${
              activeTab === "events"
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Audit Events
          </button>
          <button
            onClick={() => setActiveTab("access")}
            className={`px-4 py-2 font-medium text-sm ${
              activeTab === "access"
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Access Review
          </button>
          <button
            onClick={() => setActiveTab("logs")}
            className={`px-4 py-2 font-medium text-sm ${
              activeTab === "logs"
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Shared Access Logs
          </button>
        </nav>
      </div>

      {loading ? (
        <div className="text-center text-gray-500">Loading...</div>
      ) : activeTab === "events" ? (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Audit Events ({events.length})</h2>
          <div className="space-y-2">
            {events.map((event) => (
              <div key={event.id} className="border-b border-gray-100 pb-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{event.event_type}</span>
                  <span className="text-xs text-gray-500">
                    {new Date(event.created_at).toLocaleString()}
                  </span>
                </div>
                {event.metadata_summary && (
                  <div className="text-xs text-gray-600 mt-1">Metadata: {event.metadata_summary}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : activeTab === "access" ? (
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Members ({memberships.length})</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2">Email</th>
                  <th className="text-left py-2">Role</th>
                  <th className="text-left py-2">Status</th>
                  <th className="text-left py-2">Joined</th>
                </tr>
              </thead>
              <tbody>
                {memberships.map((m) => (
                  <tr key={m.user_id} className="border-b border-gray-100">
                    <td className="py-2">{m.email}</td>
                    <td className="py-2">{m.role}</td>
                    <td className="py-2">
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          m.status === "active"
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {m.status}
                      </span>
                    </td>
                    <td className="py-2 text-gray-600">
                      {new Date(m.joined_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Consent Grants ({consents.length})</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2">Owner</th>
                  <th className="text-left py-2">Viewer</th>
                  <th className="text-left py-2">Scope</th>
                  <th className="text-left py-2">Status</th>
                  <th className="text-left py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {consents.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100">
                    <td className="py-2">{c.owner_email}</td>
                    <td className="py-2">{c.viewer_email}</td>
                    <td className="py-2 text-xs">{c.scope}</td>
                    <td className="py-2">
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          c.status === "active"
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="py-2 text-gray-600">
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Shared Access Logs ({logs.length})</h2>
          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="border-b border-gray-100 pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-sm">{log.action}</span>
                    <span className="text-xs text-gray-600 ml-2">
                      {log.viewer_email} → {log.owner_email}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
