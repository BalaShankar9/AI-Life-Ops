import { PrismaClient } from "@prisma/client";
import type { ConsentScope } from "@ai-life-ops/shared";

/**
 * Check if a viewer has consent to view owner's data with specified scope.
 * Enforces tenant isolation and active consent status.
 */
export async function canView(
  prisma: PrismaClient,
  ownerUserId: string,
  viewerUserId: string,
  orgId: string,
  requiredScope: ConsentScope
): Promise<boolean> {
  // Viewer must have active membership in the org
  const viewerMembership = await prisma.membership.findFirst({
    where: {
      userId: viewerUserId,
      orgId,
      status: "active"
    }
  });

  if (!viewerMembership) {
    return false;
  }

  // Owner must have active membership in the org
  const ownerMembership = await prisma.membership.findFirst({
    where: {
      userId: ownerUserId,
      orgId,
      status: "active"
    }
  });

  if (!ownerMembership) {
    return false;
  }

  // Check for active consent with the required scope
  const consent = await prisma.sharingConsent.findUnique({
    where: {
      orgId_ownerUserId_viewerUserId_scope: {
        orgId,
        ownerUserId,
        viewerUserId,
        scope: requiredScope
      }
    }
  });

  return consent !== null && consent.status === "active";
}

/**
 * Get all active scopes for a viewer-owner pair in an org.
 */
export async function getActiveScopes(
  prisma: PrismaClient,
  ownerUserId: string,
  viewerUserId: string,
  orgId: string
): Promise<ConsentScope[]> {
  const consents = await prisma.sharingConsent.findMany({
    where: {
      orgId,
      ownerUserId,
      viewerUserId,
      status: "active"
    }
  });

  return consents.map((c: any) => c.scope as ConsentScope);
}

/**
 * Scope hierarchy helper.
 * Returns true if userScope includes requiredScope.
 */
export function scopeIncludes(userScopes: ConsentScope[], requiredScope: ConsentScope): boolean {
  // Define scope hierarchy
  const scopeHierarchy: Record<ConsentScope, ConsentScope[]> = {
    weekly_summary_only: ["weekly_summary_only"],
    daily_scores_only: ["daily_scores_only"],
    daily_scores_and_flags: ["daily_scores_only", "daily_scores_and_flags"],
    daily_plan_redacted: ["daily_scores_only", "daily_scores_and_flags", "daily_plan_redacted"],
    scenario_reports_redacted: ["scenario_reports_redacted"],
    insights_metrics_only: ["insights_metrics_only"]
  };

  // Check if any user scope includes the required scope
  for (const userScope of userScopes) {
    if (scopeHierarchy[userScope]?.includes(requiredScope)) {
      return true;
    }
  }

  return false;
}

/**
 * Redaction utility to strip sensitive fields from shared data.
 * Removes fields like "notes", "comment", and personal assumptions.
 */
export function redact<T extends Record<string, any>>(obj: T): T {
  if (typeof obj !== "object" || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redact(item)) as any;
  }

  const redacted: any = {};

  for (const [key, value] of Object.entries(obj)) {
    // Skip sensitive fields
    if (key === "notes" || key === "comment" || key === "assumptions" || key === "variability") {
      continue;
    }

    // Redact personal references in text fields
    if (typeof value === "string" && key === "why") {
      redacted[key] = redactText(value);
    } else if (typeof value === "object" && value !== null) {
      redacted[key] = redact(value);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Mask email address for display.
 * Example: john.doe@example.com -> j***@example.com
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  
  const masked = local.charAt(0) + "***";
  return `${masked}@${domain}`;
}

/**
 * Redact personal references from text for safe sharing.
 * Removes emails, phones, addresses, truncates to safe length.
 */
export function redactText(text: string): string {
  // Remove email patterns
  let redacted = text.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "[email]");
  
  // Remove phone patterns
  redacted = redacted.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, "[phone]");
  
  // Remove address-like patterns (basic)
  redacted = redacted.replace(/\b\d+\s+[A-Z][a-z]+\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd)\b/gi, "[address]");
  
  // Truncate if too long
  if (redacted.length > 500) {
    redacted = redacted.substring(0, 497) + "...";
  }
  
  return redacted;
}
