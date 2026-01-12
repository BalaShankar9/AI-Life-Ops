import RequireAuth from "../components/require-auth";
import OnboardingForm from "./onboarding-form";

export default function OnboardingPage() {
  return (
    <RequireAuth requireOnboarding={false}>
      <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="animate-rise rounded-3xl border border-slate-200/70 bg-white/80 p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Onboarding
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-slate-900">
            Set your operating profile
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Capture the minimum context the engine needs to keep plans realistic
            and aligned to your constraints.
          </p>
          <div className="mt-6">
            <OnboardingForm />
          </div>
        </div>
        <aside className="animate-rise space-y-4 rounded-3xl border border-slate-200/70 bg-white/80 p-6 text-sm text-slate-600 shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Privacy by design
            </p>
            <p className="mt-2">
              We store only schedule windows, a focus cap, and compliance
              domains. No sensitive content or credentials.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <p className="font-semibold text-slate-700">How it is used</p>
            <p className="mt-1">
              The deterministic engine references this profile to shape timing,
              cap deep work, and tune priorities.
            </p>
          </div>
        </aside>
      </section>
    </RequireAuth>
  );
}
