import RequireAuth from "../components/require-auth";
import HistoryView from "./history-view";

export default function HistoryPage() {
  return (
    <RequireAuth>
      <section className="space-y-6">
        <div className="animate-rise">
          <h1 className="text-2xl font-semibold text-slate-900">History</h1>
          <p className="mt-2 text-sm text-slate-600">
            Recent snapshots and stability scores. Click a row for details.
          </p>
        </div>
        <HistoryView />
      </section>
    </RequireAuth>
  );
}
