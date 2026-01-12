export default function SafetyPage() {
  return (
    <section className="animate-rise mx-auto max-w-3xl space-y-6 rounded-3xl border border-slate-200/70 bg-white/80 p-8 shadow-sm">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Safety</h1>
        <p className="mt-2 text-sm text-slate-600">
          AI Life Ops provides structured decision support. It is not medical,
          mental health, or legal advice.
        </p>
      </div>

      <div className="space-y-3 text-sm text-slate-600">
        <p className="font-semibold text-slate-800">What this is</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Deterministic planning support for high-pressure days.</li>
          <li>Clear, explainable recommendations based on your inputs.</li>
        </ul>
      </div>

      <div className="space-y-3 text-sm text-slate-600">
        <p className="font-semibold text-slate-800">What this is not</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Not a medical, mental health, or crisis service.</li>
          <li>Not a diagnosis, therapy, or legal advice platform.</li>
        </ul>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600">
        <p className="font-semibold text-slate-800">Crisis-safe policy</p>
        <p className="mt-2">
          If a check-in note suggests self-harm or imminent danger, the app
          pauses normal planning and shows a safety notice encouraging immediate
          support.
        </p>
        <p className="mt-3 font-semibold text-slate-800">If you are in immediate danger</p>
        <p className="mt-1">
          Call your local emergency number or contact a trusted person right now.
        </p>
      </div>
    </section>
  );
}
