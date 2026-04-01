"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

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
    retention_days_feedback: 365,
  });

  useEffect(() => {
    loadPolicy();
  }, []);

  const loadPolicy = async () => {
    try {
      const response = await fetch("http://localhost:4000/api/org/retention", {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        if (data.ok) {
          setPolicy(data.data.policy);
          setFormData({
            retention_days_snapshots: data.data.policy.retention_days_snapshots,
            retention_days_audit: data.data.policy.retention_days_audit,
            retention_days_access_logs:
              data.data.policy.retention_days_access_logs,
            retention_days_feedback: data.data.policy.retention_days_feedback,
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
        body: JSON.stringify(formData),
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
    if (
      !confirm(
        "This will permanently delete old data according to the retention policy. Continue?"
      )
    )
      return;

    setPurging(true);
    try {
      const response = await fetch(
        "http://localhost:4000/api/org/retention/purge",
        { method: "POST", credentials: "include" }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.ok) {
          const { snapshots, access_logs, feedback } = data.data.purged;
          alert(
            `Purge complete!\nSnapshots: ${snapshots}\nAccess Logs: ${access_logs}\nFeedback: ${feedback}`
          );
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

  return (
    <AppShell>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Data Retention Policy
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure how long data is kept before automatic purge. Helps comply
            with GDPR storage limitation principle.
          </p>
        </div>

        {/* Current policy */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Current Policy</CardTitle>
              {!editing && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(true)}
                >
                  Edit Policy
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="h-8 animate-pulse rounded-lg bg-muted"
                  />
                ))}
              </div>
            ) : editing ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="snapshots">
                    Snapshots Retention (days, min: 30)
                  </Label>
                  <Input
                    id="snapshots"
                    type="number"
                    min="30"
                    value={formData.retention_days_snapshots}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        retention_days_snapshots: parseInt(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="audit">
                    Audit Logs Retention (days, min: 365)
                  </Label>
                  <Input
                    id="audit"
                    type="number"
                    min="365"
                    value={formData.retention_days_audit}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        retention_days_audit: parseInt(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accesslogs">
                    Access Logs Retention (days, min: 90)
                  </Label>
                  <Input
                    id="accesslogs"
                    type="number"
                    min="90"
                    value={formData.retention_days_access_logs}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        retention_days_access_logs: parseInt(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="feedback">
                    Feedback Retention (days, min: 30)
                  </Label>
                  <Input
                    id="feedback"
                    type="number"
                    min="30"
                    value={formData.retention_days_feedback}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        retention_days_feedback: parseInt(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <Button onClick={handleSave}>Save Changes</Button>
                  <Button variant="outline" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                {[
                  {
                    label: "Snapshots",
                    value: policy?.retention_days_snapshots,
                  },
                  { label: "Audit Logs", value: policy?.retention_days_audit },
                  {
                    label: "Access Logs",
                    value: policy?.retention_days_access_logs,
                  },
                  { label: "Feedback", value: policy?.retention_days_feedback },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-mono font-medium text-foreground">
                      {value} days
                    </span>
                  </div>
                ))}
                <Separator />
                <p className="text-xs text-muted-foreground">
                  Last updated:{" "}
                  {policy
                    ? new Date(policy.updated_at).toLocaleString()
                    : "N/A"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Purge section */}
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-base text-destructive">
              Purge Old Data
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Manually trigger data purge to delete records older than the
              retention policy. This action is permanent and cannot be undone.
            </p>

            <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
              <p className="font-medium text-foreground mb-1">This will delete:</p>
              <ul className="list-disc pl-5 space-y-0.5 text-muted-foreground">
                <li>
                  Snapshots older than {policy?.retention_days_snapshots} days
                </li>
                <li>
                  Access logs older than {policy?.retention_days_access_logs}{" "}
                  days
                </li>
                <li>
                  Feedback older than {policy?.retention_days_feedback} days
                </li>
              </ul>
            </div>

            <Button
              variant="destructive"
              onClick={handlePurge}
              disabled={purging}
            >
              {purging ? "Purging..." : "Run Purge Now"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
