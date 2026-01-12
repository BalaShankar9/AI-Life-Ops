"use client";

import { useState, useEffect } from "react";

type RetentionPolicy = {
  retention_days_snapshots: number;
  retention_days_audit: number;
  retention_days_access_logs: number;
  retention_days_feedback: number;
  updated_at: string;
};

export default function RetentionPage() {
  const [policy, setPolicy] = useState<RetentionPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [purging, setPurging] = useState(false);
  const [formData, setFormData] = useState({
    retention_days_snapshots: 365,
    retention_days_audit: 730,
    retention_days_access_logs: 180,
    retention_days_feedback: 365
  });

  useEffect(() => {
    loadPolicy();
  }, []);

  const loadPolicy = async () => {
    try {
      const response = await fetch("http://localhost:4000/api/org/retention", {
        credentials: "include"
      });
      if (response.ok) {
        const data = await response.json();
        if (data.ok) {
          setPolicy(data.data.policy);
          setFormData({
            retention_days_snapshots: data.data.policy.retention_days_snapshots,
            retention_days_audit: data.data.policy.retention_days_audit,
            retention_days_access_logs: data.data.policy.retention_days_access_logs,
            retention_days_feedback: data.data.policy.retention_days_feedback
          });
        }
      }
    } catch (error) {
      console.error("Failed to load policy:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const response = await fetch("http://localhost:4000/api/org/retention", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ok) {
          setPolicy(data.data.policy);
          setEditing(false);
          alert("Policy updated successfully!");
        }
      } else {
        alert("Failed to update policy.");
      }
    } catch (error) {
      console.error("Failed to save policy:", error);
      alert("Failed to update policy.");
    }
  };

  const handlePurge = async () => {
    if (!confirm("This will permanently delete old data according to the retention policy. Continue?")) {
      return;
    }

    setPurging(true);
    try {
      const response = await fetch("http://localhost:4000/api/org/retention/purge", {
        method: "POST",
        credentials: "include"
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ok) {
          const { snapshots, access_logs, feedback } = data.data.purged;
          alert(`Purge complete!\nSnapshots: ${snapshots}\nAccess Logs: ${access_logs}\nFeedback: ${feedback}`);
        }
      } else {
        alert("Purge failed.");
      }
    } catch (error) {
      console.error("Purge error:", error);
      alert("Purge failed.");
    } finally {
      setPurging(false);
    }
  };

  if (loading) {
    return <div className="text-center text-gray-500">Loading...</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Data Retention Policy</h1>

      <div className="bg-blue-50 border border-blue-200 rounded p-4 mb-6">
        <p className="text-sm text-blue-900">
          <strong>Retention Policy:</strong> Configure how long data is kept before automatic purge.
          Helps comply with GDPR storage limitation principle.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Current Policy</h2>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-blue-600 text-sm font-semibold hover:underline"
            >
              Edit Policy
            </button>
          )}
        </div>

        {editing ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Snapshots Retention (days, min: 30)
              </label>
              <input
                type="number"
                min="30"
                value={formData.retention_days_snapshots}
                onChange={(e) =>
                  setFormData({ ...formData, retention_days_snapshots: parseInt(e.target.value) })
                }
                className="border border-gray-300 rounded px-3 py-2 w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Audit Logs Retention (days, min: 365)
              </label>
              <input
                type="number"
                min="365"
                value={formData.retention_days_audit}
                onChange={(e) =>
                  setFormData({ ...formData, retention_days_audit: parseInt(e.target.value) })
                }
                className="border border-gray-300 rounded px-3 py-2 w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Access Logs Retention (days, min: 90)
              </label>
              <input
                type="number"
                min="90"
                value={formData.retention_days_access_logs}
                onChange={(e) =>
                  setFormData({ ...formData, retention_days_access_logs: parseInt(e.target.value) })
                }
                className="border border-gray-300 rounded px-3 py-2 w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Feedback Retention (days, min: 30)
              </label>
              <input
                type="number"
                min="30"
                value={formData.retention_days_feedback}
                onChange={(e) =>
                  setFormData({ ...formData, retention_days_feedback: parseInt(e.target.value) })
                }
                className="border border-gray-300 rounded px-3 py-2 w-full"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleSave}
                className="bg-blue-600 text-white px-4 py-2 rounded font-semibold hover:bg-blue-700"
              >
                Save Changes
              </button>
              <button
                onClick={() => setEditing(false)}
                className="bg-gray-300 text-gray-700 px-4 py-2 rounded font-semibold hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Snapshots:</span>
              <span className="font-medium">{policy?.retention_days_snapshots} days</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Audit Logs:</span>
              <span className="font-medium">{policy?.retention_days_audit} days</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Access Logs:</span>
              <span className="font-medium">{policy?.retention_days_access_logs} days</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Feedback:</span>
              <span className="font-medium">{policy?.retention_days_feedback} days</span>
            </div>
            <div className="text-xs text-gray-500 mt-4">
              Last updated: {policy ? new Date(policy.updated_at).toLocaleString() : "N/A"}
            </div>
          </div>
        )}
      </div>

      <div className="bg-white border border-red-200 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4 text-red-700">Purge Old Data</h2>
        <p className="text-sm text-gray-600 mb-4">
          Manually trigger data purge to delete records older than the retention policy.
          This action is permanent and cannot be undone.
        </p>

        <div className="bg-yellow-50 border border-yellow-300 rounded p-3 mb-4">
          <p className="text-sm text-yellow-900">
            <strong>⚠️ Warning:</strong> This will delete:
          </p>
          <ul className="list-disc list-inside text-sm text-yellow-900 mt-2">
            <li>Snapshots older than {policy?.retention_days_snapshots} days</li>
            <li>Access logs older than {policy?.retention_days_access_logs} days</li>
            <li>Feedback older than {policy?.retention_days_feedback} days</li>
          </ul>
        </div>

        <button
          onClick={handlePurge}
          disabled={purging}
          className="bg-red-600 text-white px-4 py-2 rounded font-semibold hover:bg-red-700 disabled:opacity-50"
        >
          {purging ? "Purging..." : "Run Purge Now"}
        </button>
      </div>
    </div>
  );
}
