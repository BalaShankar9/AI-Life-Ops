"use client";

import { useState } from "react";

export default function PrivacyPage() {
  const [exporting, setExporting] = useState(false);
  const [includeSensitive, setIncludeSensitive] = useState(false);
  const [deleteRequested, setDeleteRequested] = useState(false);
  const [deleteToken, setDeleteToken] = useState("");
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [deleting, setDeleting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const response = await fetch("http://localhost:4000/api/privacy/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ include_sensitive: includeSensitive })
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const filename = response.headers.get("Content-Disposition")?.split("filename=")[1]?.replace(/"/g, "") || "export.json";
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        alert("Export downloaded successfully!");
      } else {
        alert("Export failed. Please try again.");
      }
    } catch (error) {
      console.error("Export error:", error);
      alert("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteRequest = async () => {
    if (!confirm("This will request deletion of your data. Continue?")) return;

    try {
      const response = await fetch("http://localhost:4000/api/privacy/delete/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({})
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ok) {
          setDeleteToken(data.data.token || "");
          setDeleteRequested(true);
        }
      } else {
        alert("Request failed. Please try again.");
      }
    } catch (error) {
      console.error("Delete request error:", error);
      alert("Request failed. Please try again.");
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteToken || confirmPhrase !== "DELETE MY DATA") {
      alert("Please enter the correct confirmation phrase and token.");
      return;
    }

    if (!confirm("FINAL WARNING: This will permanently delete your data. This cannot be undone. Continue?")) {
      return;
    }

    setDeleting(true);
    try {
      const response = await fetch("http://localhost:4000/api/privacy/delete/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          token: deleteToken,
          confirm_phrase: confirmPhrase
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ok) {
          alert(`Deletion complete: ${data.data.scope}`);
          window.location.href = "/login";
        }
      } else {
        alert("Deletion failed. Token may be expired. Please try again.");
      }
    } catch (error) {
      console.error("Delete confirm error:", error);
      alert("Deletion failed. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Privacy & Data Rights</h1>

      <div className="bg-blue-50 border border-blue-200 rounded p-4 mb-6">
        <p className="text-sm text-blue-900">
          <strong>Your Rights:</strong> Under GDPR, you have the right to access and delete your personal data.
          These actions create immutable audit trails for compliance.
        </p>
      </div>

      {/* Export Section */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Export My Data</h2>
        <p className="text-sm text-gray-600 mb-4">
          Download all your personal data in JSON format. This includes your profile, check-ins, snapshots,
          weekly reports, scenarios, audit logs, and more.
        </p>

        <div className="mb-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={includeSensitive}
              onChange={(e) => setIncludeSensitive(e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm">
              Include sensitive data (notes, comments, detailed assumptions)
            </span>
          </label>
          <p className="text-xs text-gray-500 mt-1 ml-6">
            By default, exports exclude free-text notes for privacy. Check this to include everything.
          </p>
        </div>

        <button
          onClick={handleExport}
          disabled={exporting}
          className="bg-blue-600 text-white px-4 py-2 rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          {exporting ? "Exporting..." : "Download My Data"}
        </button>

        <div className="mt-4 text-xs text-gray-500">
          <strong>What's included:</strong>
          <ul className="list-disc list-inside mt-1">
            <li>Profile and personalization settings</li>
            <li>Check-ins and snapshots</li>
            <li>Weekly reports and scenario runs</li>
            <li>Audit logs of your actions</li>
            <li>Sharing consents granted/received</li>
            <li>Connector metadata (never includes tokens)</li>
          </ul>
        </div>
      </div>

      {/* Delete Section */}
      <div className="bg-white border border-red-200 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4 text-red-700">Delete My Data</h2>
        
        {!deleteRequested ? (
          <>
            <div className="bg-red-50 border border-red-300 rounded p-3 mb-4">
              <p className="text-sm text-red-900">
                <strong>⚠️ Warning:</strong> This action is permanent and cannot be undone.
                All your data in your Personal org will be deleted.
              </p>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              Deletion process:
            </p>
            <ol className="list-decimal list-inside text-sm text-gray-600 mb-4 space-y-1">
              <li>Request deletion (generates time-limited token)</li>
              <li>Confirm with phrase "DELETE MY DATA" + token</li>
              <li>All your personal data will be permanently deleted</li>
            </ol>

            <button
              onClick={handleDeleteRequest}
              className="bg-red-600 text-white px-4 py-2 rounded font-semibold hover:bg-red-700"
            >
              Request Data Deletion
            </button>
          </>
        ) : (
          <div>
            <p className="text-sm text-gray-600 mb-4">
              A deletion token has been generated (expires in 15 minutes).
            </p>

            {deleteToken && (
              <div className="bg-gray-100 p-3 rounded mb-4">
                <p className="text-xs text-gray-500 mb-1">Token (dev mode only):</p>
                <code className="text-sm font-mono break-all">{deleteToken}</code>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Token</label>
                <input
                  type="text"
                  value={deleteToken}
                  onChange={(e) => setDeleteToken(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                  placeholder="Paste token here"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Confirmation Phrase</label>
                <input
                  type="text"
                  value={confirmPhrase}
                  onChange={(e) => setConfirmPhrase(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                  placeholder="Type: DELETE MY DATA"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleDeleteConfirm}
                  disabled={deleting || !deleteToken || confirmPhrase !== "DELETE MY DATA"}
                  className="bg-red-600 text-white px-4 py-2 rounded font-semibold hover:bg-red-700 disabled:opacity-50"
                >
                  {deleting ? "Deleting..." : "Confirm Deletion"}
                </button>
                <button
                  onClick={() => {
                    setDeleteRequested(false);
                    setDeleteToken("");
                    setConfirmPhrase("");
                  }}
                  className="bg-gray-300 text-gray-700 px-4 py-2 rounded font-semibold hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
