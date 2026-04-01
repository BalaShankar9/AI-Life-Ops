import { Suspense } from "react";
import RequireAuth from "../components/require-auth";
import OnboardingForm from "./onboarding-form";

export default function OnboardingPage() {
  return (
    <RequireAuth requireOnboarding={false}>
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-lg space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary mx-auto">
              <span className="text-2xl font-bold text-white">O</span>
            </div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Onboarding
            </p>
            <h1 className="text-2xl font-bold text-foreground">
              Set your operating profile
            </h1>
            <p className="text-sm text-muted-foreground">
              Capture the minimum context the engine needs to keep plans realistic
              and aligned to your constraints.
            </p>
          </div>

          {/* Form card */}
          <div className="rounded-xl border border-border bg-card p-8 shadow-lg">
            <Suspense fallback={<div className="h-48 animate-pulse rounded-lg bg-muted" />}>
              <OnboardingForm />
            </Suspense>
          </div>

          {/* Info */}
          <p className="text-center text-xs text-muted-foreground">
            We store only schedule windows and focus caps. No sensitive content or credentials.
          </p>
        </div>
      </div>
    </RequireAuth>
  );
}
