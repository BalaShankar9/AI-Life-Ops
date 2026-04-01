"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquare,
  Calendar,
  History,
  BarChart3,
  Settings,
  Link2,
  Shield,
  FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/checkin", label: "Check-in", icon: MessageSquare },
  { href: "/today", label: "Today", icon: Calendar },
  { href: "/history", label: "History", icon: History },
  { href: "/weekly", label: "Weekly", icon: BarChart3 },
  { href: "/simulate", label: "Simulate", icon: FlaskConical },
  { href: "/connectors", label: "Connectors", icon: Link2 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-30 flex h-screen w-64 flex-col border-r border-border bg-card">
      <div className="flex h-16 items-center gap-3 border-b border-border px-6">
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-secondary" />
        <span className="text-lg font-bold tracking-tight text-foreground">
          AI Life Ops
        </span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-4">
        <Link
          href="/safety"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <Shield className="h-3.5 w-3.5" />
          Safety &amp; Resources
        </Link>
      </div>
    </aside>
  );
}
