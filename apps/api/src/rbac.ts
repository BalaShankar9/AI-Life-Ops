import { NextFunction, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import type { MembershipRole } from "@ai-life-ops/shared";

// Role hierarchy: owner > admin > member > coach > viewer
const ROLE_HIERARCHY: Record<MembershipRole, number> = {
  owner: 5,
  admin: 4,
  member: 3,
  coach: 2,
  viewer: 1
};

export function hasRoleOrHigher(userRole: MembershipRole, requiredRole: MembershipRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

/**
 * Tenant resolution middleware.
 * Resolves active org from X-Org-Id header or falls back to Personal org.
 * Attaches orgId and role to request context.
 * Requires requireAuth middleware to run first.
 */
export function requireOrgAccess(prisma: PrismaClient) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }

      const requestedOrgId = req.headers["x-org-id"] as string | undefined;

      // If no org specified, find user's Personal org
      if (!requestedOrgId) {
        const personalMembership = await prisma.membership.findFirst({
          where: {
            userId: req.user.id,
            status: "active",
            org: { type: "personal" }
          },
          include: { org: true }
        });

        if (!personalMembership) {
          return res.status(404).json({
            ok: false,
            error: "No personal organization found. Please contact support."
          });
        }

        req.orgId = personalMembership.orgId;
        req.orgRole = personalMembership.role;
        req.orgName = personalMembership.org.name;
        return next();
      }

      // Verify user has access to requested org
      const membership = await prisma.membership.findFirst({
        where: {
          userId: req.user.id,
          orgId: requestedOrgId,
          status: "active"
        },
        include: { org: true }
      });

      if (!membership) {
        return res.status(403).json({
          ok: false,
          error: "Access denied to organization"
        });
      }

      req.orgId = membership.orgId;
      req.orgRole = membership.role;
      req.orgName = membership.org.name;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * RBAC middleware factory.
 * Requires user to have at least the specified role in the active org.
 * Must run after requireOrgAccess.
 */
export function requireRole(minRole: MembershipRole) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.orgRole) {
      return res.status(500).json({
        ok: false,
        error: "Organization context not resolved"
      });
    }

    if (!hasRoleOrHigher(req.orgRole, minRole)) {
      return res.status(403).json({
        ok: false,
        error: `Requires ${minRole} role or higher`
      });
    }

    next();
  };
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      orgId?: string;
      orgRole?: MembershipRole;
      orgName?: string;
    }
  }
}
