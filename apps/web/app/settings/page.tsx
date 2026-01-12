import RequireAuth from "../components/require-auth";
import NonMedicalDisclaimer from "../components/non-medical-disclaimer";

export default function SettingsPage() {
  return (
    <RequireAuth>
      <section className="animate-rise max-w-2xl space-y-4 rounded-3xl border border-slate-200/70 bg-white/80 p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-600">
          Preferences are coming soon. For now, your session and account data
          are managed through the API.
        </p>
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-700">Account</p>
          <p className="mt-2">
            Your session is stored in a secure, HttpOnly cookie. Use Logout in
            the header to end the session.
          </p>
        </div>
        <NonMedicalDisclaimer />
      </section>
    </RequireAuth>
  );
}
