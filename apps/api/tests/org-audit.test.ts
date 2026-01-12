import request from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import type { Express } from "express";
import { PrismaClient } from "@prisma/client";
import { hashPassword, signToken } from "../src/auth";

const prisma = new PrismaClient();

// Mock app (you'll need to import your actual app)
let app: Express;
let ownerCookie: string;
let memberCookie: string;
let orgId: string;
let ownerUserId: string;
let memberUserId: string;

beforeAll(async () => {
  // Clean up test data
  await prisma.auditLog.deleteMany({ where: { userId: { contains: "test-" } } });
  await prisma.membership.deleteMany({ where: { userId: { contains: "test-" } } });
  await prisma.user.deleteMany({ where: { email: { contains: "@test.com" } } });
  await prisma.organization.deleteMany({ where: { name: { contains: "Test" } } });

  // Create test users
  const ownerPassword = await hashPassword("password123");
  const memberPassword = await hashPassword("password123");

  const owner = await prisma.user.create({
    data: {
      email: "test-owner@test.com",
      passwordHash: ownerPassword
    }
  });

  const member = await prisma.user.create({
    data: {
      email: "test-member@test.com",
      passwordHash: memberPassword
    }
  });

  ownerUserId = owner.id;
  memberUserId = member.id;

  // Create test org
  const org = await prisma.organization.create({
    data: {
      name: "Test Org",
      type: "team",
      memberships: {
        create: [
          { userId: ownerUserId, role: "owner", status: "active" },
          { userId: memberUserId, role: "member", status: "active" }
        ]
      }
    }
  });

  orgId = org.id;

  // Generate auth tokens
  const ownerToken = signToken({ sub: ownerUserId, email: owner.email });
  const memberToken = signToken({ sub: memberUserId, email: member.email });

  ownerCookie = `alo_session=${ownerToken}`;
  memberCookie = `alo_session=${memberToken}`;
});

afterAll(async () => {
  // Clean up
  await prisma.auditLog.deleteMany({ where: { userId: { contains: "test-" } } });
  await prisma.sharingConsent.deleteMany({ where: { orgId } });
  await prisma.membership.deleteMany({ where: { orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.user.deleteMany({ where: { email: { contains: "@test.com" } } });
  await prisma.$disconnect();
});

describe("Org Management Endpoints", () => {
  it("should list orgs for authenticated user", async () => {
    const response = await request(app)
      .get("/api/orgs")
      .set("Cookie", ownerCookie)
      .expect(200);

    expect(response.body.ok).toBe(true);
    expect(Array.isArray(response.body.data.orgs)).toBe(true);
  });

  it("should deny access to org audit for non-admin", async () => {
    const response = await request(app)
      .get("/api/org/audit")
      .set("Cookie", memberCookie)
      .set("X-Org-Id", orgId)
      .expect(403);

    expect(response.body.ok).toBe(false);
  });

  it("should allow org audit access for admin/owner", async () => {
    const response = await request(app)
      .get("/api/org/audit")
      .set("Cookie", ownerCookie)
      .set("X-Org-Id", orgId)
      .expect(200);

    expect(response.body.ok).toBe(true);
    expect(Array.isArray(response.body.data.events)).toBe(true);
  });
});

describe("Consent Management Endpoints", () => {
  it("should allow owner to grant consent", async () => {
    const response = await request(app)
      .post("/api/sharing/grant")
      .set("Cookie", ownerCookie)
      .set("X-Org-Id", orgId)
      .send({
        viewer_user_id: memberUserId,
        scope: "daily_scores_only"
      })
      .expect(200);

    expect(response.body.ok).toBe(true);
    expect(response.body.data.consent).toBeDefined();
  });

  it("should list consents for owner", async () => {
    const response = await request(app)
      .get("/api/sharing/consents")
      .set("Cookie", ownerCookie)
      .set("X-Org-Id", orgId)
      .expect(200);

    expect(response.body.ok).toBe(true);
    expect(Array.isArray(response.body.data.consents)).toBe(true);
  });

  it("should allow owner to revoke consent", async () => {
    const response = await request(app)
      .post("/api/sharing/revoke")
      .set("Cookie", ownerCookie)
      .set("X-Org-Id", orgId)
      .send({
        viewer_user_id: memberUserId,
        scope: "daily_scores_only"
      })
      .expect(200);

    expect(response.body.ok).toBe(true);
  });
});

describe("Shared Data Access Endpoints", () => {
  beforeAll(async () => {
    // Grant consent for testing
    await prisma.sharingConsent.create({
      data: {
        orgId,
        ownerUserId,
        viewerUserId: memberUserId,
        scope: "daily_scores_only",
        status: "active"
      }
    });
  });

  it("should list shared users for viewer", async () => {
    const response = await request(app)
      .get("/api/shared/users")
      .set("Cookie", memberCookie)
      .set("X-Org-Id", orgId)
      .expect(200);

    expect(response.body.ok).toBe(true);
    expect(Array.isArray(response.body.data.owners)).toBe(true);
  });

  it("should deny access without consent", async () => {
    // Revoke consent first
    await prisma.sharingConsent.updateMany({
      where: { orgId, ownerUserId, viewerUserId: memberUserId },
      data: { status: "revoked", revokedAt: new Date() }
    });

    const response = await request(app)
      .get(`/api/shared/${ownerUserId}/history`)
      .set("Cookie", memberCookie)
      .set("X-Org-Id", orgId)
      .expect(403);

    expect(response.body.ok).toBe(false);
  });
});

describe("Export Endpoints", () => {
  it("should export access review as JSON", async () => {
    const response = await request(app)
      .get("/api/org/access-review/export.json")
      .set("Cookie", ownerCookie)
      .set("X-Org-Id", orgId)
      .expect(200);

    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.body.generated_at).toBeDefined();
  });

  it("should not include notes in exports", async () => {
    const response = await request(app)
      .get("/api/org/access-review/export.json")
      .set("Cookie", ownerCookie)
      .set("X-Org-Id", orgId)
      .expect(200);

    const body = JSON.stringify(response.body);
    expect(body).not.toContain("notes");
    expect(body).not.toContain("comment");
  });
});

describe("Access Control", () => {
  it("should deny cross-org access", async () => {
    // Create another org
    const otherOrg = await prisma.organization.create({
      data: {
        name: "Other Org",
        type: "team",
        memberships: {
          create: { userId: memberUserId, role: "owner", status: "active" }
        }
      }
    });

    // Try to access first org's audit with member cookie (not a member)
    const response = await request(app)
      .get("/api/org/audit")
      .set("Cookie", memberCookie)
      .set("X-Org-Id", otherOrg.id)
      .expect(403);

    // Cleanup
    await prisma.membership.deleteMany({ where: { orgId: otherOrg.id } });
    await prisma.organization.delete({ where: { id: otherOrg.id } });
  });
});
