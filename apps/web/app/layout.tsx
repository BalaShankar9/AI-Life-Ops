import "./globals.css";
import Header from "./components/header";
import { AuthProvider } from "./components/auth-provider";
import { OrgProvider } from "./components/org-provider";

export const metadata = {
  title: "AI Life Ops",
  description: "Operator-grade decision orchestration"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen text-slate-900 antialiased">
        <AuthProvider>
          <OrgProvider>
            <Header />
            <main className="mx-auto w-full max-w-6xl px-5 py-10">
              {children}
            </main>
          </OrgProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
