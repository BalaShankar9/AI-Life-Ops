import { createHmac, randomBytes, scrypt as _scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";

import type { Response } from "express";
import type { PrismaClient } from "@prisma/client";

const scrypt = promisify(_scrypt);

const TOKEN_TTL_SECONDS = Number(process.env.JWT_TTL_SECONDS || 60 * 60 * 24 * 7);
const COOKIE_NAME = "alo_session";

export type AuthTokenPayload = {
  sub: string;
  email: string;
  iat: number;
  exp: number;
};

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) {
    return false;
  }
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expectedBuffer = Buffer.from(expected, "hex");
  if (expectedBuffer.length !== derived.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, derived);
}

export function signToken(payload: { sub: string; email: string }): string {
  const secret = getJwtSecret();
  const now = Math.floor(Date.now() / 1000);
  const body: AuthTokenPayload = {
    sub: payload.sub,
    email: payload.email,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS
  };
  const header = { alg: "HS256", typ: "JWT" };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedBody = base64UrlEncode(JSON.stringify(body));
  const signature = createHmac("sha256", secret)
    .update(`${encodedHeader}.${encodedBody}`)
    .digest("base64url");

  return `${encodedHeader}.${encodedBody}.${signature}`;
}

export function verifyToken(token: string): AuthTokenPayload | null {
  const secret = getJwtSecret();
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedBody, signature] = parts;
  const expected = createHmac("sha256", secret)
    .update(`${encodedHeader}.${encodedBody}`)
    .digest("base64url");

  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }

  const payload = safeJson<AuthTokenPayload>(base64UrlDecode(encodedBody));
  if (!payload || !payload.sub || !payload.email) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    return null;
  }

  return payload;
}

export function setAuthCookie(res: Response, token: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const cookie =
    `${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${TOKEN_TTL_SECONDS}` +
    secure;
  res.setHeader("Set-Cookie", cookie);
}

export function clearAuthCookie(res: Response) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const cookie = `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0` + secure;
  res.setHeader("Set-Cookie", cookie);
}

export function getTokenFromCookies(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) {
    return null;
  }
  const cookies = cookieHeader.split(";").map((part) => part.trim());
  for (const cookie of cookies) {
    if (cookie.startsWith(`${COOKIE_NAME}=`)) {
      return cookie.slice(COOKIE_NAME.length + 1);
    }
  }
  return null;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf-8");
}

function safeJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return secret;
}

/**
 * Ensure user has a Personal organization with owner membership.
 * Creates if missing. Returns the org ID.
 */
export async function ensurePersonalOrg(
  prisma: PrismaClient,
  userId: string
): Promise<string> {
  // Check if user already has a Personal org
  const existingMembership = await prisma.membership.findFirst({
    where: {
      userId,
      organization: {
        type: "personal"
      },
      status: "active"
    },
    include: {
      organization: true
    }
  });

  if (existingMembership) {
    return existingMembership.orgId;
  }

  // Create Personal org + owner membership
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true }
  });

  if (!user) {
    throw new Error("User not found");
  }

  const org = await prisma.organization.create({
    data: {
      name: `${user.email}'s Personal`,
      type: "personal",
      memberships: {
        create: {
          userId,
          role: "owner",
          status: "active"
        }
      }
    }
  });

  return org.id;
}
