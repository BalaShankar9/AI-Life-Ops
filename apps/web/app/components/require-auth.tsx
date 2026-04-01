"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useAuth } from "./auth-provider";

function RequireAuthInner({
  children,
  requireOnboarding = true,
  allowDuringLoading = false,
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
    requireOnboarding,
  ]);

  if (loading || (requireOnboarding && onboardingLoading)) {
    if (allowDuringLoading) {
      return <>{children}</>;
    }
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
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

export default function RequireAuth({
  children,
  requireOnboarding = true,
  allowDuringLoading = false,
}: {
  children: React.ReactNode;
  requireOnboarding?: boolean;
  allowDuringLoading?: boolean;
}) {
  return (
    <Suspense
      fallback={
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Checking your session...
        </div>
      }
    >
      <RequireAuthInner
        requireOnboarding={requireOnboarding}
        allowDuringLoading={allowDuringLoading}
      >
        {children}
      </RequireAuthInner>
    </Suspense>
  );
}
