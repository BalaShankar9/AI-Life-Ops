import Link from "next/link";
import RequireAuth from "../components/require-auth";
import NonMedicalDisclaimer from "../components/non-medical-disclaimer";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export default function SettingsPage() {
  return (
    <RequireAuth>
      <AppShell>
        <div className="space-y-6 max-w-2xl">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Settings</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage your account, session, and personalization preferences.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Account</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Your session is stored in a secure, HttpOnly cookie. Use Logout in
                the header to end the session.
              </p>
              <Separator />
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" asChild>
                  <Link href="/settings/personalization">Personalization settings</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Data &amp; Privacy</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Export or delete your personal data. These actions create immutable audit trails.
              </p>
              <Separator />
              <Button variant="outline" asChild>
                <Link href="/privacy">Privacy &amp; data rights</Link>
              </Button>
            </CardContent>
          </Card>

          <NonMedicalDisclaimer />
        </div>
      </AppShell>
    </RequireAuth>
  );
}
