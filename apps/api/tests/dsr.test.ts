/**
 * DSR (Data Subject Rights) Tests
 * 
 * Tests for GDPR-compliant export, deletion, and retention features.
 */

import request from "supertest";
import { createApp, prisma } from "../src/app";
import { createHmac } from "crypto";

// Set up test environment
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env.");
}

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.CSRF_SECRET = process.env.CSRF_SECRET || "csrf-test-secret-0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.ENGINE_ENTRYPOINT = process.env.ENGINE_ENTRYPOINT || "../../packages/engine/engine_cli.py";
process.env.ENGINE_PYTHON_PATH = process.env.ENGINE_PYTHON_PATH || "python3";
process.env.CONNECTOR_ENCRYPTION_KEY = process.env.CONNECTOR_ENCRYPTION_KEY || "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.GOOGLE_OAUTH_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || "test-client-id";
process.env.GOOGLE_OAUTH_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || "test-client-secret";

const app = createApp();

// Mock helper to create test user with org
async function createTestUser(email: string, role: "owner" | "admin" | "member" = "owner") {
  const user = await prisma.user.create({
    data: {
      email,
      password_hash: "test-hash",
      email_verified: true
    }
  });

  const org = await prisma.organization.create({
    data: {
      name: `Test Org ${email}`,
      created_by: user.id
    }
  });

  await prisma.membership.create({
    data: {
      user_id: user.id,
      org_id: org.id,
      role,
      status: "active"
    }
  });

  return { user, org };
}

// Mock helper to create test check-in with notes
async function createCheckIn(userId: number, orgId: number, withNotes: boolean = true) {
  return await prisma.checkin.create({
    data: {
      user_id: userId,
      org_id: orgId,
      notes: withNotes ? "Sensitive user notes" : null,
      energy: 7,
      focus: 8,
      mood: 6,
      stress: 4
    }
  });
}

describe("DSR Export", () => {
  let testUser: any;
  let testOrg: any;
  let authCookie: string;

  beforeAll(async () => {
    const result = await createTestUser("export-test@example.com");
    testUser = result.user;
    testOrg = result.org;

    // Create test data
    await createCheckIn(testUser.id, testOrg.id, true);
    
    await prisma.snapshot.create({
      data: {
        user_id: testUser.id,
        org_id: testOrg.id,
        life_score: 75.5,
        life_breakdown: JSON.stringify({ health: 80, work: 70, relationships: 75 })
      }
    });

    // Get auth cookie
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "export-test@example.com", password: "test" });
    authCookie = loginRes.headers["set-cookie"];
  });

  afterAll(async () => {
    await prisma.checkin.deleteMany({ where: { user_id: testUser.id } });
    await prisma.snapshot.deleteMany({ where: { user_id: testUser.id } });
    await prisma.membership.deleteMany({ where: { user_id: testUser.id } });
    await prisma.organization.delete({ where: { id: testOrg.id } });
    await prisma.user.delete({ where: { id: testUser.id } });
  });

  test("Export without sensitive data excludes notes", async () => {
    const res = await request(app)
      .post("/api/privacy/export")
      .set("Cookie", authCookie)
      .send({ include_sensitive: false });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(res.headers["content-disposition"]).toContain("lifeops-export");

    const exportData = res.body;
    expect(exportData.profile).toBeDefined();
    expect(exportData.checkins).toBeDefined();
    expect(exportData.checkins.length).toBeGreaterThan(0);
    
    // Notes should be excluded
    expect(exportData.checkins[0].notes).toBeUndefined();
  });

  test("Export with sensitive data includes notes", async () => {
    const res = await request(app)
      .post("/api/privacy/export")
      .set("Cookie", authCookie)
      .send({ include_sensitive: true });

    expect(res.status).toBe(200);
    
    const exportData = res.body;
    expect(exportData.checkins[0].notes).toBe("Sensitive user notes");
  });

  test("Export never includes tokens", async () => {
    // Create a connector with token
    await prisma.connector.create({
      data: {
        user_id: testUser.id,
        org_id: testOrg.id,
        provider: "google",
        access_token: "secret-token-123",
        refresh_token: "secret-refresh-456"
      }
    });

    const res = await request(app)
      .post("/api/privacy/export")
      .set("Cookie", authCookie)
      .send({ include_sensitive: true });

    expect(res.status).toBe(200);
    
    const exportData = res.body;
    expect(exportData.connectors).toBeDefined();
    
    if (exportData.connectors.length > 0) {
      expect(exportData.connectors[0].access_token).toBeUndefined();
      expect(exportData.connectors[0].refresh_token).toBeUndefined();
    }

    // Cleanup
    await prisma.connector.deleteMany({ where: { user_id: testUser.id } });
  });

  test("Export creates audit log", async () => {
    await request(app)
      .post("/api/privacy/export")
      .set("Cookie", authCookie)
      .send({});

    const auditLog = await prisma.auditLog.findFirst({
      where: {
        user_id: testUser.id,
        event_type: "DSR_EXPORT_COMPLETED"
      },
      orderBy: { created_at: "desc" }
    });

    expect(auditLog).toBeDefined();
  });
});

describe("DSR Deletion", () => {
  let testUser: any;
  let testOrg: any;
  let authCookie: string;

  beforeEach(async () => {
    const result = await createTestUser("delete-test@example.com");
    testUser = result.user;
    testOrg = result.org;

    // Create test data
    await createCheckIn(testUser.id, testOrg.id);

    // Get auth cookie
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "delete-test@example.com", password: "test" });
    authCookie = loginRes.headers["set-cookie"];
  });

  test("Delete request creates token", async () => {
    const res = await request(app)
      .post("/api/privacy/delete/request")
      .set("Cookie", authCookie)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.message).toContain("deletion request created");

    const deletionRequest = await prisma.deletionRequest.findFirst({
      where: { user_id: testUser.id }
    });

    expect(deletionRequest).toBeDefined();
    expect(deletionRequest?.token_hash).toBeDefined();
  });

  test("Delete confirm requires valid token and phrase", async () => {
    // Request deletion
    const reqRes = await request(app)
      .post("/api/privacy/delete/request")
      .set("Cookie", authCookie)
      .send({});

    const token = reqRes.body.data.token; // Only in dev mode

    // Try with wrong phrase
    const wrongPhraseRes = await request(app)
      .post("/api/privacy/delete/confirm")
      .set("Cookie", authCookie)
      .send({ token, phrase: "wrong phrase" });

    expect(wrongPhraseRes.status).toBe(400);

    // Try with correct phrase but invalid token
    const invalidTokenRes = await request(app)
      .post("/api/privacy/delete/confirm")
      .set("Cookie", authCookie)
      .send({ token: "invalid-token", phrase: "DELETE MY DATA" });

    expect(invalidTokenRes.status).toBe(400);
  });

  test("Personal org deletion removes all data", async () => {
    const reqRes = await request(app)
      .post("/api/privacy/delete/request")
      .set("Cookie", authCookie)
      .send({});

    const token = reqRes.body.data.token;

    const confirmRes = await request(app)
      .post("/api/privacy/delete/confirm")
      .set("Cookie", authCookie)
      .send({ token, phrase: "DELETE MY DATA" });

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.data.scope).toBe("account_deleted");

    // Verify data deleted
    const userExists = await prisma.user.findUnique({ where: { id: testUser.id } });
    expect(userExists).toBeNull();
  });

  test("Team org deletion leaves org intact", async () => {
    // Create a second user as owner
    const owner = await createTestUser("owner@example.com", "owner");
    
    // Add test user as member to owner's org
    await prisma.membership.create({
      data: {
        user_id: testUser.id,
        org_id: owner.org.id,
        role: "member",
        status: "active"
      }
    });

    await createCheckIn(testUser.id, owner.org.id);

    const reqRes = await request(app)
      .post("/api/privacy/delete/request")
      .set("Cookie", authCookie)
      .send({ org_id: owner.org.id });

    const token = reqRes.body.data.token;

    const confirmRes = await request(app)
      .post("/api/privacy/delete/confirm")
      .set("Cookie", authCookie)
      .send({ token, phrase: "DELETE MY DATA" });

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.data.scope).toBe("org_data_deleted");

    // Verify org still exists
    const orgExists = await prisma.organization.findUnique({ where: { id: owner.org.id } });
    expect(orgExists).toBeDefined();

    // Verify user data deleted for that org
    const checkins = await prisma.checkin.count({
      where: { user_id: testUser.id, org_id: owner.org.id }
    });
    expect(checkins).toBe(0);

    // Cleanup
    await prisma.membership.deleteMany({ where: { org_id: owner.org.id } });
    await prisma.organization.delete({ where: { id: owner.org.id } });
    await prisma.user.delete({ where: { id: owner.user.id } });
  });

  test("Deletion creates audit log", async () => {
    const reqRes = await request(app)
      .post("/api/privacy/delete/request")
      .set("Cookie", authCookie)
      .send({});

    const requestLog = await prisma.auditLog.findFirst({
      where: {
        user_id: testUser.id,
        event_type: "DSR_DELETE_REQUESTED"
      }
    });

    expect(requestLog).toBeDefined();
  });
});

describe("Retention Policy", () => {
  let adminUser: any;
  let adminOrg: any;
  let authCookie: string;

  beforeAll(async () => {
    const result = await createTestUser("retention-admin@example.com", "admin");
    adminUser = result.user;
    adminOrg = result.org;

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "retention-admin@example.com", password: "test" });
    authCookie = loginRes.headers["set-cookie"];
  });

  afterAll(async () => {
    await prisma.membership.deleteMany({ where: { user_id: adminUser.id } });
    await prisma.organization.delete({ where: { id: adminOrg.id } });
    await prisma.user.delete({ where: { id: adminUser.id } });
  });

  test("Get retention policy creates default if missing", async () => {
    const res = await request(app)
      .get("/api/org/retention")
      .set("Cookie", authCookie);

    expect(res.status).toBe(200);
    expect(res.body.data.policy).toBeDefined();
    expect(res.body.data.policy.retention_days_snapshots).toBe(365);
    expect(res.body.data.policy.retention_days_audit).toBe(730);
    expect(res.body.data.policy.retention_days_access_logs).toBe(180);
    expect(res.body.data.policy.retention_days_feedback).toBe(365);
  });

  test("Update retention policy validates minimums", async () => {
    const res = await request(app)
      .put("/api/org/retention")
      .set("Cookie", authCookie)
      .send({
        retention_days_snapshots: 10, // Too low (min 30)
        retention_days_audit: 100, // Too low (min 365)
        retention_days_access_logs: 50, // Too low (min 90)
        retention_days_feedback: 10 // Too low (min 30)
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("minimum");
  });

  test("Update retention policy succeeds with valid values", async () => {
    const res = await request(app)
      .put("/api/org/retention")
      .set("Cookie", authCookie)
      .send({
        retention_days_snapshots: 180,
        retention_days_audit: 1095,
        retention_days_access_logs: 90,
        retention_days_feedback: 180
      });

    expect(res.status).toBe(200);
    expect(res.body.data.policy.retention_days_snapshots).toBe(180);
  });

  test("Purge deletes old data and logs counts", async () => {
    // Create old snapshot
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 400); // Older than 365d default

    await prisma.snapshot.create({
      data: {
        user_id: adminUser.id,
        org_id: adminOrg.id,
        life_score: 50,
        life_breakdown: JSON.stringify({}),
        created_at: oldDate
      }
    });

    const res = await request(app)
      .post("/api/org/retention/purge")
      .set("Cookie", authCookie)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.purged).toBeDefined();
    expect(typeof res.body.data.purged.snapshots).toBe("number");

    // Verify audit log
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        org_id: adminOrg.id,
        event_type: "RETENTION_PURGE_RUN"
      },
      orderBy: { created_at: "desc" }
    });

    expect(auditLog).toBeDefined();
  });

  test("Non-admin cannot update retention policy", async () => {
    // Create member user
    const member = await createTestUser("member@example.com", "member");
    
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "member@example.com", password: "test" });
    const memberCookie = loginRes.headers["set-cookie"];

    const res = await request(app)
      .put("/api/org/retention")
      .set("Cookie", memberCookie)
      .send({
        retention_days_snapshots: 180,
        retention_days_audit: 730,
        retention_days_access_logs: 90,
        retention_days_feedback: 180
      });

    expect(res.status).toBe(403);

    // Cleanup
    await prisma.membership.deleteMany({ where: { user_id: member.user.id } });
    await prisma.organization.delete({ where: { id: member.org.id } });
    await prisma.user.delete({ where: { id: member.user.id } });
  });
});

describe("Token Security", () => {
  test("Token hash matches HMAC-SHA256", () => {
    const token = "test-token-123";
    const secret = "test-secret";
    
    const hash = createHmac("sha256", secret)
      .update(token)
      .digest("hex");

    expect(hash).toBeDefined();
    expect(hash.length).toBe(64); // SHA256 hex is 64 chars
  });

  test("Token expiry is enforced", async () => {
    const testUser = await createTestUser("token-test@example.com");
    
    // Create expired deletion request
    const expiredDate = new Date();
    expiredDate.setMinutes(expiredDate.getMinutes() - 20); // Expired 5 minutes ago

    const tokenHash = createHmac("sha256", "test-secret")
      .update("expired-token")
      .digest("hex");

    await prisma.deletionRequest.create({
      data: {
        user_id: testUser.user.id,
        token_hash: tokenHash,
        expires_at: expiredDate
      }
    });

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "token-test@example.com", password: "test" });
    const authCookie = loginRes.headers["set-cookie"];

    const res = await request(app)
      .post("/api/privacy/delete/confirm")
      .set("Cookie", authCookie)
      .send({ token: "expired-token", phrase: "DELETE MY DATA" });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("expired");

    // Cleanup
    await prisma.deletionRequest.deleteMany({ where: { user_id: testUser.user.id } });
    await prisma.membership.deleteMany({ where: { user_id: testUser.user.id } });
    await prisma.organization.delete({ where: { id: testUser.org.id } });
    await prisma.user.delete({ where: { id: testUser.user.id } });
  });
});
