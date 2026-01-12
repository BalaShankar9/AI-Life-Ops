import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:4000";

export async function middleware(request: NextRequest) {
  const cookie = request.headers.get("cookie") || "";

  if (!cookie) {
    return redirectToLogin(request);
  }

  try {
    const response = await fetch(`${API_BASE_URL}/auth/me`, {
      method: "GET",
      headers: {
        cookie,
        accept: "application/json"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      return redirectToLogin(request);
    }

    if (!request.nextUrl.pathname.startsWith("/onboarding")) {
      const onboarding = await fetch(`${API_BASE_URL}/api/onboarding/status`, {
        method: "GET",
        headers: {
          cookie,
          accept: "application/json"
        },
        cache: "no-store"
      });

      if (onboarding.ok) {
        const data = await onboarding.json();
        const completed = Boolean(data?.data?.completed);
        if (!completed) {
          return redirectToOnboarding(request);
        }
      } else {
        return redirectToOnboarding(request);
      }
    }

    return NextResponse.next();
  } catch {
    return redirectToLogin(request);
  }
}

function redirectToLogin(request: NextRequest) {
  const nextPath = request.nextUrl.pathname + request.nextUrl.search;
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", nextPath);
  return NextResponse.redirect(loginUrl);
}

function redirectToOnboarding(request: NextRequest) {
  const nextPath = request.nextUrl.pathname + request.nextUrl.search;
  const onboardingUrl = request.nextUrl.clone();
  onboardingUrl.pathname = "/onboarding";
  onboardingUrl.searchParams.set("next", nextPath);
  return NextResponse.redirect(onboardingUrl);
}

export const config = {
  matcher: [
    "/onboarding",
    "/onboarding/:path*",
    "/checkin",
    "/checkin/:path*",
    "/today",
    "/today/:path*",
    "/weekly",
    "/weekly/:path*",
    "/connectors",
    "/connectors/:path*",
    "/history",
    "/history/:path*",
    "/audit",
    "/audit/:path*",
    "/settings",
    "/settings/:path*"
  ]
};
