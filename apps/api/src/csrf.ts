/**
 * CSRF Protection Middleware
 * 
 * Implements stateless HMAC-based CSRF token validation for SOC2 compliance.
 * Uses double-submit cookie pattern with HMAC signature.
 */

import { Request, Response, NextFunction } from "express";
import { createHmac, randomBytes } from "crypto";

const CSRF_TOKEN_EXPIRY_MS = 2 * 60 * 60 * 1000; // 2 hours

export function getCsrfSecret(): string {
  const secret = process.env.CSRF_SECRET;
  if (!secret) {
    throw new Error("CSRF_SECRET environment variable is required");
  }
  return secret;
}

/**
 * Generate CSRF token with timestamp and HMAC signature
 * Format: {timestamp}.{random}.{hmac}
 */
export function generateCsrfToken(): string {
  const timestamp = Date.now().toString();
  const random = randomBytes(16).toString("hex");
  const payload = `${timestamp}.${random}`;
  
  const hmac = createHmac("sha256", getCsrfSecret())
    .update(payload)
    .digest("hex");
  
  return `${payload}.${hmac}`;
}

/**
 * Validate CSRF token signature and expiry
 */
export function validateCsrfToken(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return false;
    }

    const [timestamp, random, hmac] = parts;
    const payload = `${timestamp}.${random}`;
    
    // Verify HMAC signature
    const expectedHmac = createHmac("sha256", getCsrfSecret())
      .update(payload)
      .digest("hex");
    
    if (hmac !== expectedHmac) {
      return false;
    }
    
    // Check expiry
    const tokenTime = parseInt(timestamp, 10);
    const now = Date.now();
    
    if (now - tokenTime > CSRF_TOKEN_EXPIRY_MS) {
      return false;
    }
    
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Middleware to validate CSRF token on state-changing requests
 * Skips GET, HEAD, OPTIONS
 * Validates X-CSRF-Token header matches csrf_token cookie
 */
export function validateCsrf(req: Request, res: Response, next: NextFunction) {
  // Skip CSRF for safe methods
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }
  
  // Skip CSRF for OAuth callbacks (they have state parameter validation)
  if (req.path.includes("/oauth/callback")) {
    return next();
  }
  
  const headerToken = req.headers["x-csrf-token"] as string;
  const cookieToken = getCsrfTokenFromCookie(req.headers.cookie);
  
  if (!headerToken || !cookieToken) {
    return res.status(403).json({
      ok: false,
      message: "CSRF token required. Call GET /auth/csrf first."
    });
  }
  
  if (headerToken !== cookieToken) {
    return res.status(403).json({
      ok: false,
      message: "CSRF token mismatch"
    });
  }
  
  if (!validateCsrfToken(headerToken)) {
    return res.status(403).json({
      ok: false,
      message: "CSRF token invalid or expired"
    });
  }
  
  next();
}

/**
 * Extract csrf_token from cookie header
 */
function getCsrfTokenFromCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) {
    return null;
  }
  const cookies = cookieHeader.split(";").map((part) => part.trim());
  for (const cookie of cookies) {
    if (cookie.startsWith("csrf_token=")) {
      return cookie.slice("csrf_token=".length);
    }
  }
  return null;
}

/**
 * Middleware to set security headers for SOC2 compliance
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  const isProduction = process.env.NODE_ENV === "production";
  
  // Prevent MIME type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");
  
  // Prevent clickjacking
  res.setHeader("X-Frame-Options", "DENY");
  
  // Referrer policy
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  
  // Permissions policy (restrictive defaults)
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  
  // HSTS only in production
  if (isProduction) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  
  // Content Security Policy
  const cspDirectives = [
    "default-src 'self'",
    "connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'", // Allow inline styles for React/Next
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ];
  
  // Relax CSP in development for HMR
  if (!isProduction) {
    cspDirectives.push("script-src 'self' 'unsafe-eval'");
  } else {
    cspDirectives.push("script-src 'self'");
  }
  
  res.setHeader("Content-Security-Policy", cspDirectives.join("; "));
  
  next();
}
