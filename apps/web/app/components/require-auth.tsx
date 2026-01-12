"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useAuth } from "./auth-provider";

export default function RequireAuth({
  children,
  requireOnboarding = true,
  allowDuringLoading = false
}: {
  children: React.ReactNode;
  requireOnboarding?: boolean;
  allowDuringLoading?: boolean;
}) {
  const { user, loading, onboardingCompleted, onboardingLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!loading && !user) {
      const query = searchParams?.toString();
      const nextPath = query ? `${pathname}?${query}` : pathname;
      router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
      return;
    }

    if (
      requireOnboarding &&
      user &&
      !onboardingLoading &&
      !onboardingCompleted
    ) {
      const query = searchParams?.toString();
      const nextPath = query ? `${pathname}?${query}` : pathname;
      router.replace(`/onboarding?next=${encodeURIComponent(nextPath)}`);
    }
  }, [
    loading,
    user,
    router,
    pathname,
    searchParams,
    onboardingCompleted,
    onboardingLoading,
    requireOnboarding
  ]);

  if (loading || (requireOnboarding && onboardingLoading)) {
    if (allowDuringLoading) {
      return <>{children}</>;
    }
    return (
      <div className="animate-rise rounded-3xl border border-slate-200/70 bg-white/80 p-6 text-sm text-slate-500 shadow-sm">
        Checking your session...
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (requireOnboarding && !onboardingCompleted) {
    return null;
  }

  return <>{children}</>;
}
