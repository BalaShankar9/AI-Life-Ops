import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import request from "supertest";

import {
  CheckinResponseSchema,
  ProfileResponseSchema
} from "@ai-life-ops/shared";

import { createApp, prisma } from "../src/app";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env."
  );
}

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.CSRF_SECRET = process.env.CSRF_SECRET || "csrf-test-secret-0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.ENGINE_ENTRYPOINT =
  process.env.ENGINE_ENTRYPOINT || "../../packages/engine/engine_cli.py";
process.env.ENGINE_PYTHON_PATH = process.env.ENGINE_PYTHON_PATH || "python3";
process.env.CONNECTOR_ENCRYPTION_KEY =
  process.env.CONNECTOR_ENCRYPTION_KEY ||
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.GOOGLE_OAUTH_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || "test-client-id";
process.env.GOOGLE_OAUTH_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || "test-client-secret";

const app = createApp();

before(async () => {
  await prisma.$connect();
});

after(async () => {
  await prisma.$disconnect();
});

test("unauth user cannot access profile routes", async () => {
  const response = await request(app).get("/api/profile");
  assert.equal(response.status, 401);
});

test("PUT /api/profile sets onboarding_completed_at when valid", async () => {
  const agent = request.agent(app);
  const credentials = buildCredentials();

  const registerResponse = await agent
    .post("/auth/register")
    .send(credentials);
  assert.equal(registerResponse.status, 201);

  const profileResponse = await agent
    .put("/api/profile")
    .send(buildProfilePayload());

  assert.equal(profileResponse.status, 200);
  const parsed = ProfileResponseSchema.safeParse(profileResponse.body);
  assert.ok(parsed.success, "Profile response does not match schema");
  assert.ok(parsed.data.data.profile?.onboarding_completed_at);
});

test("POST /api/checkins fails if onboarding incomplete", async () => {
  const agent = request.agent(app);
  const credentials = buildCredentials();

  const registerResponse = await agent
    .post("/auth/register")
    .send(credentials);
  assert.equal(registerResponse.status, 201);

  const response = await agent
    .post("/api/checkins")
    .send(buildCheckinPayload());

  assert.equal(response.status, 400);
  assert.match(response.body?.error?.message ?? "", /onboarding/i);
});

test("POST /api/checkins works after onboarding and returns used_context", async () => {
  const agent = request.agent(app);
  const credentials = buildCredentials();

  const registerResponse = await agent
    .post("/auth/register")
    .send(credentials);
  assert.equal(registerResponse.status, 201);

  const profileResponse = await agent
    .put("/api/profile")
    .send(buildProfilePayload());
  assert.equal(profileResponse.status, 200);

  const response = await agent
    .post("/api/checkins")
    .send(buildCheckinPayload());

  assert.equal(response.status, 200);
  const parsed = CheckinResponseSchema.safeParse(response.body);
  assert.ok(parsed.success, "Check-in response does not match schema");

  const snapshot = parsed.data.data.snapshot;
  assert.ok(snapshot.output.used_context.length > 0);
  assert.ok(snapshot.output.free_time_summary);
});

test("POST /api/checkins logs schedule events based on busy blocks", async () => {
  const agent = request.agent(app);
  const credentials = buildCredentials();

  const registerResponse = await agent
    .post("/auth/register")
    .send(credentials);
  assert.equal(registerResponse.status, 201);

  const userId = registerResponse.body?.data?.user?.id as string;
  assert.ok(userId);

  const profileResponse = await agent
    .put("/api/profile")
    .send(buildProfilePayload());
  assert.equal(profileResponse.status, 200);

  const noBusyResponse = await agent
    .post("/api/checkins")
    .send(buildCheckinPayload());
  assert.equal(noBusyResponse.status, 200);

  const noBusyAudit = await prisma.auditLog.findFirst({
    where: { userId, eventType: "SCHEDULE_NOT_AVAILABLE" },
    orderBy: { createdAt: "desc" }
  });
  assert.ok(noBusyAudit, "Missing SCHEDULE_NOT_AVAILABLE audit event");

  await prisma.event.create({
    data: {
      userId,
      sourceProvider: "google_calendar",
      sourceId: `busy-${Date.now()}`,
      kind: "calendar_busy_block",
      startTs: new Date(Date.now() - 30 * 60 * 1000),
      endTs: new Date(Date.now() + 30 * 60 * 1000),
      timezone: "UTC",
      title: null,
      location: null,
      isAllDay: false,
      metadata: {}
    }
  });

  const busyResponse = await agent
    .post("/api/checkins")
    .send(buildCheckinPayload());
  assert.equal(busyResponse.status, 200);

  const busyAudit = await prisma.auditLog.findFirst({
    where: { userId, eventType: "SCHEDULE_USED" },
    orderBy: { createdAt: "desc" }
  });
  assert.ok(busyAudit, "Missing SCHEDULE_USED audit event");
});

function buildCredentials() {
  const seed = Date.now().toString(36);
  return {
    email: `qa-${seed}@ai-life-ops.local`,
    password: `Test${seed}#1`
  };
}

function buildProfilePayload() {
  return {
    timezone: "UTC",
    wake_window_start: "07:00",
    wake_window_end: "10:00",
    sleep_window_start: "22:00",
    sleep_window_end: "06:00",
    work_pattern: "day",
    max_daily_focus_blocks: 2,
    priority_bias: "stability_first",
    compliance_domains: ["bills", "visa/legal"]
  };
}

function buildCheckinPayload() {
  return {
    sleep_hours: 7,
    energy_level: 6,
    stress_level: 5,
    money_pressure: 5,
    today_deadlines_count: 2,
    critical_deadline: false,
    available_time_hours: 6,
    notes: "QA smoke"
  };
}
