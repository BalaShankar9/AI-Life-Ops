/**
 * Security Tests - SOC2 Compliance
 * 
 * Tests for CSRF protection, security headers, access reviews, and monitoring.
 */

import request from "supertest";
import { createApp, prisma } from "../src/app";

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

describe("CSRF Protection", () => {
  let testUser: any;
  let authCookie: string;

  beforeAll(async () => {
    const result = await createTestUser("csrf-test@example.com");
    testUser = result.user;

    const loginRes = await request(app)
      .post("/auth/login")
      .send({ email: "csrf-test@example.com", password: "test" });
    authCookie = loginRes.headers["set-cookie"];
  });

  afterAll(async () => {
    await prisma.membership.deleteMany({ where: { user_id: testUser.user.id } });
    await prisma.organization.delete({ where: { id: testUser.org.id } });
    await prisma.user.delete({ where: { id: testUser.user.id } });
  });

  test("GET /auth/csrf returns CSRF token when authenticated", async () => {
    const res = await request(app)
      .get("/auth/csrf")
      .set("Cookie", authCookie);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.csrfToken).toBeDefined();
    expect(typeof res.body.data.csrfToken).toBe("string");
  });

  test("GET /auth/csrf sets csrf_token cookie", async () => {
    const res = await request(app)
      .get("/auth/csrf")
      .set("Cookie", authCookie);

    expect(res.status).toBe(200);
    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
    expect(cookies.some((c: string) => c.startsWith("csrf_token="))).toBe(true);
  });

  test("GET /auth/csrf returns 401 when not authenticated", async () => {
    const res = await request(app).get("/auth/csrf");

    expect(res.status).toBe(401);
  });

  test("POST request without CSRF token fails", async () => {
    const res = await request(app)
      .post("/api/checkins")
      .set("Cookie", authCookie)
      .send({ energy: 7, focus: 8, mood: 6, stress: 4 });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain("CSRF");
  });

  test("POST request with valid CSRF token succeeds", async () => {
    // Get CSRF token
    const csrfRes = await request(app)
      .get("/auth/csrf")
      .set("Cookie", authCookie);
    
    const csrfToken = csrfRes.body.data.csrfToken;
    const csrfCookie = csrfRes.headers["set-cookie"];

    // Make POST request with CSRF token
    const res = await request(app)
      .post("/api/profile")
      .set("Cookie", [...authCookie, ...csrfCookie])
      .set("X-CSRF-Token", csrfToken)
      .send({
        timezone: "America/New_York",
        wake_window_start: "06:00",
        wake_window_end: "07:00",
        sleep_window_start: "22:00",
        sleep_window_end: "23:00",
        work_pattern: "day",
        max_daily_focus_blocks: 2,
        priority_bias: "stability_first",
        compliance_domains: []
      });

    expect(res.status).toBe(200);
  });

  test("PUT request without CSRF token fails", async () => {
    const res = await request(app)
      .put("/api/profile")
      .set("Cookie", authCookie)
      .send({ timezone: "America/Los_Angeles" });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain("CSRF");
  });

  test("DELETE request without CSRF token fails", async () => {
    const res = await request(app)
      .delete("/api/org/members/fake-id")
      .set("Cookie", authCookie);

    expect(res.status).toBe(403);
    expect(res.body.message).toContain("CSRF");
  });

  test("GET request bypasses CSRF validation", async () => {
    const res = await request(app)
      .get("/api/profile")
      .set("Cookie", authCookie);

    expect(res.status).toBe(200); // Should not be blocked by CSRF
  });
});

describe("Security Headers", () => {
  test("Responses include X-Content-Type-Options: nosniff", async () => {
    const res = await request(app).get("/health");

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  test("Responses include X-Frame-Options: DENY", async () => {
    const res = await request(app).get("/health");

    expect(res.headers["x-frame-options"]).toBe("DENY");
  });

  test("Responses include Referrer-Policy", async () => {
    const res = await request(app).get("/health");

    expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  test("Responses include Content-Security-Policy", async () => {
    const res = await request(app).get("/health");

    expect(res.headers["content-security-policy"]).toBeDefined();
    expect(res.headers["content-security-policy"]).toContain("default-src 'self'");
  });

  test("Responses include Permissions-Policy", async () => {
    const res = await request(app).get("/health");

    expect(res.headers["permissions-policy"]).toBeDefined();
    expect(res.headers["permissions-policy"]).toContain("geolocation=()");
  });
});

describe("Access Review Records", () => {
  let adminUser: any;
  let adminOrg: any;
  let authCookie: string;
  let csrfToken: string;

  beforeAll(async () => {
    const result = await createTestUser("access-review-admin@example.com", "admin");
    adminUser = result.user;
    adminOrg = result.org;

    const loginRes = await request(app)
      .post("/auth/login")
      .send({ email: "access-review-admin@example.com", password: "test" });
    authCookie = loginRes.headers["set-cookie"];

    const csrfRes = await request(app)
      .get("/auth/csrf")
      .set("Cookie", authCookie);
    csrfToken = csrfRes.body.data.csrfToken;
  });

  afterAll(async () => {
    await prisma.accessReviewRecord.deleteMany({ where: { orgId: adminOrg.id } });
    await prisma.membership.deleteMany({ where: { user_id: adminUser.id } });
    await prisma.organization.delete({ where: { id: adminOrg.id } });
    await prisma.user.delete({ where: { id: adminUser.id } });
  });

  test("Admin can create access review", async () => {
    const res = await request(app)
      .post("/api/org/access-reviews/create")
      .set("Cookie", authCookie)
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", adminOrg.id)
      .send({
        period_start: "2026-01-01T00:00:00Z",
        period_end: "2026-03-31T23:59:59Z"
      });

    expect(res.status).toBe(200);
    expect(res.body.data.review).toBeDefined();
    expect(res.body.data.review.status).toBe("created");
    expect(res.body.data.review.reviewer_email).toBe("access-review-admin@example.com");
  });

  test("Admin can list access reviews", async () => {
    const res = await request(app)
      .get("/api/org/access-reviews")
      .set("Cookie", authCookie)
      .set("X-Org-Id", adminOrg.id);

    expect(res.status).toBe(200);
    expect(res.body.data.reviews).toBeDefined();
    expect(Array.isArray(res.body.data.reviews)).toBe(true);
  });

  test("Admin can complete access review", async () => {
    // Create review first
    const createRes = await request(app)
      .post("/api/org/access-reviews/create")
      .set("Cookie", authCookie)
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", adminOrg.id)
      .send({
        period_start: "2026-04-01T00:00:00Z",
        period_end: "2026-06-30T23:59:59Z"
      });

    const reviewId = createRes.body.data.review.id;

    // Complete review
    const res = await request(app)
      .post(`/api/org/access-reviews/${reviewId}/complete`)
      .set("Cookie", authCookie)
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", adminOrg.id)
      .send({ confirm: true });

    expect(res.status).toBe(200);
    expect(res.body.data.review.status).toBe("completed");
    expect(res.body.data.review.completed_at).toBeDefined();
  });

  test("Admin can export access review evidence PDF", async () => {
    // Create and complete review
    const createRes = await request(app)
      .post("/api/org/access-reviews/create")
      .set("Cookie", authCookie)
      .set("X-CSRF-Token", csrfToken)
      .set("X-Org-Id", adminOrg.id)
      .send({
        period_start: "2026-07-01T00:00:00Z",
        period_end: "2026-09-30T23:59:59Z"
      });

    const reviewId = createRes.body.data.review.id;

    const res = await request(app)
      .get(`/api/org/access-reviews/${reviewId}/evidence.pdf`)
      .set("Cookie", authCookie)
      .set("X-Org-Id", adminOrg.id);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toContain("access-review");
  });

  test("Non-admin cannot create access review", async () => {
    const member = await createTestUser("member@example.com", "member");

    const loginRes = await request(app)
      .post("/auth/login")
      .send({ email: "member@example.com", password: "test" });
    const memberCookie = loginRes.headers["set-cookie"];

    const csrfRes = await request(app)
      .get("/auth/csrf")
      .set("Cookie", memberCookie);
    const memberCsrfToken = csrfRes.body.data.csrfToken;

    const res = await request(app)
      .post("/api/org/access-reviews/create")
      .set("Cookie", memberCookie)
      .set("X-CSRF-Token", memberCsrfToken)
      .set("X-Org-Id", member.org.id)
      .send({
        period_start: "2026-01-01T00:00:00Z",
        period_end: "2026-03-31T23:59:59Z"
      });

    expect(res.status).toBe(403);

    // Cleanup
    await prisma.membership.deleteMany({ where: { user_id: member.user.id } });
    await prisma.organization.delete({ where: { id: member.org.id } });
    await prisma.user.delete({ where: { id: member.user.id } });
  });
});

describe("Monitoring Events", () => {
  let adminUser: any;
  let authCookie: string;

  beforeAll(async () => {
    const result = await createTestUser("monitoring-admin@example.com", "admin");
    adminUser = result.user;

    const loginRes = await request(app)
      .post("/auth/login")
      .send({ email: "monitoring-admin@example.com", password: "test" });
    authCookie = loginRes.headers["set-cookie"];
  });

  afterAll(async () => {
    await prisma.monitoringEvent.deleteMany({ where: { orgId: adminUser.org.id } });
    await prisma.membership.deleteMany({ where: { user_id: adminUser.user.id } });
    await prisma.organization.delete({ where: { id: adminUser.org.id } });
    await prisma.user.delete({ where: { id: adminUser.user.id } });
  });

  test("Admin can view monitoring events", async () => {
    // Create a test monitoring event
    await prisma.monitoringEvent.create({
      data: {
        eventType: "CONNECTOR_SYNC_FAILURE",
        orgId: adminUser.org.id,
        userId: adminUser.user.id,
        metadata: JSON.stringify({ error: "Test error" })
      }
    });

    const res = await request(app)
      .get("/api/org/monitoring")
      .set("Cookie", authCookie)
      .set("X-Org-Id", adminUser.org.id);

    expect(res.status).toBe(200);
    expect(res.body.data.events).toBeDefined();
    expect(Array.isArray(res.body.data.events)).toBe(true);
    expect(res.body.data.events.length).toBeGreaterThan(0);
  });

  test("Non-admin cannot view monitoring events", async () => {
    const member = await createTestUser("monitoring-member@example.com", "member");

    const loginRes = await request(app)
      .post("/auth/login")
      .send({ email: "monitoring-member@example.com", password: "test" });
    const memberCookie = loginRes.headers["set-cookie"];

    const res = await request(app)
      .get("/api/org/monitoring")
      .set("Cookie", memberCookie)
      .set("X-Org-Id", member.org.id);

    expect(res.status).toBe(403);

    // Cleanup
    await prisma.membership.deleteMany({ where: { user_id: member.user.id } });
    await prisma.organization.delete({ where: { id: member.org.id } });
    await prisma.user.delete({ where: { id: member.user.id } });
  });
});
