import { Suspense } from "react";
import RequireAuth from "../components/require-auth";
import HistoryView from "./history-view";
import { AppShell } from "@/components/layout/app-shell";

export default function HistoryPage() {
  return (
    <RequireAuth>
      <AppShell>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">History</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Recent snapshots and stability scores. Click a row for details.
            </p>
          </div>
          <Suspense fallback={<div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />)}</div>}>
            <HistoryView />
          </Suspense>
        </div>
      </AppShell>
    </RequireAuth>
  );
}
