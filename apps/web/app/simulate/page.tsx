import RequireAuth from "../components/require-auth";
import NonMedicalDisclaimer from "../components/non-medical-disclaimer";
import SimulateView from "./simulate-view";

export default function SimulatePage() {
  return (
    <RequireAuth allowDuringLoading>
      <section className="space-y-8">
        <div className="animate-rise">
          <h1 className="text-2xl font-semibold text-slate-900">
            Scenario simulator
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Create and compare deterministic scenarios to understand tradeoffs
            before making changes.
          </p>
        </div>
        <SimulateView />
        <NonMedicalDisclaimer />
      </section>
    </RequireAuth>
  );
}
