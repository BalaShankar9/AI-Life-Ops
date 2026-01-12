import Link from "next/link";

export default function Home() {
  return (
    <section className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="animate-rise rounded-3xl border border-slate-200/70 bg-white/80 p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
          Operator console
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-900 sm:text-4xl">
          Build a calm plan that respects real constraints.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-slate-600">
          AI Life Ops turns daily signals into a short, stable plan and records
          immutable snapshots of what you decided and why.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/checkin"
            className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Start today&apos;s check-in
          </Link>
          <Link
            href="/today"
            className="rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
          >
            View latest plan
          </Link>
        </div>
      </div>
      <div className="animate-rise space-y-4 rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">System status</h2>
        <div className="space-y-3 text-sm text-slate-600">
          <p>Decision engine: deterministic, risk-first.</p>
          <p>Snapshots: immutable, audit-ready.</p>
          <p>Auth: secure session cookie + onboarding profile.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-700">Next action</p>
          <p className="mt-1">
            Complete a check-in to populate today&apos;s plan.
          </p>
        </div>
      </div>
    </section>
  );
}
