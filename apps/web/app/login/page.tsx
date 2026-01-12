import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <section className="mx-auto grid max-w-3xl gap-8 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="animate-rise rounded-3xl border border-slate-200/70 bg-white/80 p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Sign in</h1>
        <p className="mt-2 text-sm text-slate-600">
          Access your decision workspace securely.
        </p>
        <div className="mt-6">
          <LoginForm />
        </div>
      </div>
      <aside className="animate-rise space-y-4 rounded-3xl border border-slate-200/70 bg-white/80 p-6 text-sm text-slate-600 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Why sign in
          </p>
          <p className="mt-2">
            Your snapshots and plans are tied to your account and never shared.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
          <p className="font-semibold text-slate-700">No account?</p>
          <p className="mt-2">Register to begin your first check-in.</p>
        </div>
      </aside>
    </section>
  );
}
