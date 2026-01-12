"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "./auth-provider";
import { OrgSwitcher } from "./org-switcher";

const authedLinks = [
  { href: "/today", label: "Today" },
  { href: "/weekly", label: "Weekly" },
  { href: "/simulate", label: "Simulate" },
  { href: "/checkin", label: "Check-in" },
  { href: "/history", label: "History" },
  { href: "/audit", label: "Audit" },
  { href: "/sharing", label: "Sharing" },
  { href: "/viewer", label: "Viewer" },
  { href: "/org/audit", label: "Org Audit" },
  { href: "/connectors", label: "Connectors" },
  { href: "/settings", label: "Settings" }
];

const publicLinks = [{ href: "/safety", label: "Safety" }];

export default function Header() {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (loggingOut) {
      return;
    }
    setLoggingOut(true);
    try {
      await logout();
      router.replace("/login");
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200/70 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            AI Life Ops
          </Link>
          {user && <OrgSwitcher />}
        </div>
        <nav className="flex flex-wrap items-center gap-3 text-sm font-medium text-slate-600">
          {loading ? (
            <span className="rounded-full bg-slate-100 px-4 py-2 text-xs text-slate-400">
              Loading session
            </span>
          ) : user ? (
            <>
              {authedLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={navClass(item.href, pathname)}
                >
                  {item.label}
                </Link>
              ))}
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 disabled:opacity-60"
                disabled={loggingOut}
              >
                {loggingOut ? "Signing out" : "Logout"}
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className={navClass("/login", pathname)}>
                Login
              </Link>
              <Link
                href="/register"
                className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
              >
                Register
              </Link>
            </>
          )}
          {publicLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={navClass(item.href, pathname)}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

function navClass(href: string, pathname: string | null) {
  const active = pathname === href;
  return `rounded-full px-3 py-1.5 transition ${
    active
      ? "bg-slate-900 text-white"
      : "hover:bg-slate-100 hover:text-slate-900"
  }`;
}
