"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

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
        body: JSON.stringify({ include_sensitive: includeSensitive }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const filename =
          response.headers
            .get("Content-Disposition")
            ?.split("filename=")[1]
            ?.replace(/"/g, "") || "export.json";
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
      const response = await fetch(
        "http://localhost:4000/api/privacy/delete/request",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({}),
        }
      );

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
    if (
      !confirm(
        "FINAL WARNING: This will permanently delete your data. This cannot be undone. Continue?"
      )
    )
      return;

    setDeleting(true);
    try {
      const response = await fetch(
        "http://localhost:4000/api/privacy/delete/confirm",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            token: deleteToken,
            confirm_phrase: confirmPhrase,
          }),
        }
      );

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
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">Privacy &amp; Data Rights</h1>
          <p className="text-sm text-muted-foreground">
            Under GDPR, you have the right to access and delete your personal data.
            All actions create immutable audit trails for compliance.
          </p>
        </div>

        {/* Export section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Export My Data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Download all your personal data in JSON format — profile, check-ins,
              snapshots, weekly reports, scenarios, audit logs, and more.
            </p>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeSensitive}
                onChange={(e) => setIncludeSensitive(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <span className="text-sm text-foreground">
                Include sensitive data (notes, comments, detailed assumptions)
              </span>
            </label>
            <p className="text-xs text-muted-foreground ml-6">
              By default, exports exclude free-text notes for privacy.
            </p>

            <Button onClick={handleExport} disabled={exporting} variant="outline">
              {exporting ? "Exporting..." : "Download My Data"}
            </Button>

            <Separator />
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">What&apos;s included:</p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>Profile and personalization settings</li>
                <li>Check-ins and snapshots</li>
                <li>Weekly reports and scenario runs</li>
                <li>Audit logs of your actions</li>
                <li>Sharing consents granted/received</li>
                <li>Connector metadata (never includes tokens)</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Delete section */}
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-base text-destructive">Delete My Data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!deleteRequested ? (
              <>
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
                  <p className="text-sm text-destructive">
                    <strong>Warning:</strong> This action is permanent and cannot be
                    undone. All your data in your Personal org will be deleted.
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">Deletion process:</p>
                <ol className="list-decimal pl-5 text-sm text-muted-foreground space-y-1">
                  <li>Request deletion (generates time-limited token)</li>
                  <li>Confirm with phrase &ldquo;DELETE MY DATA&rdquo; + token</li>
                  <li>All your personal data will be permanently deleted</li>
                </ol>
                <Button variant="destructive" onClick={handleDeleteRequest}>
                  Request Data Deletion
                </Button>
              </>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  A deletion token has been generated (expires in 15 minutes).
                </p>

                {deleteToken && (
                  <div className="rounded-lg border border-border bg-muted px-4 py-3">
                    <p className="text-xs text-muted-foreground mb-1">
                      Token (dev mode only):
                    </p>
                    <code className="text-sm font-mono break-all text-foreground">
                      {deleteToken}
                    </code>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="token">Token</Label>
                  <Input
                    id="token"
                    type="text"
                    value={deleteToken}
                    onChange={(e) => setDeleteToken(e.target.value)}
                    placeholder="Paste token here"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPhrase">Confirmation Phrase</Label>
                  <Input
                    id="confirmPhrase"
                    type="text"
                    value={confirmPhrase}
                    onChange={(e) => setConfirmPhrase(e.target.value)}
                    placeholder="Type: DELETE MY DATA"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    onClick={handleDeleteConfirm}
                    disabled={
                      deleting ||
                      !deleteToken ||
                      confirmPhrase !== "DELETE MY DATA"
                    }
                  >
                    {deleting ? "Deleting..." : "Confirm Deletion"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDeleteRequested(false);
                      setDeleteToken("");
                      setConfirmPhrase("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
