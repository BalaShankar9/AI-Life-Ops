import { Suspense } from "react";
import RequireAuth from "../components/require-auth";
import NonMedicalDisclaimer from "../components/non-medical-disclaimer";
import SimulateView from "./simulate-view";
import { AppShell } from "@/components/layout/app-shell";

export default function SimulatePage() {
  return (
    <RequireAuth allowDuringLoading>
      <AppShell>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Scenario simulator</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Create and compare deterministic scenarios to understand tradeoffs
              before making changes.
            </p>
          </div>
          <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-muted" />}>
            <SimulateView />
          </Suspense>
          <NonMedicalDisclaimer />
        </div>
      </AppShell>
    </RequireAuth>
  );
}
