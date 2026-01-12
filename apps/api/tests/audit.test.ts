import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import request from "supertest";

import { AuditResponseSchema } from "@ai-life-ops/shared";

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

test("unauth requests rejected", async () => {
  const response = await request(app).get("/api/audit");
  assert.equal(response.status, 401);
});

test("audit events return in descending order with safe summaries", async () => {
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

  const checkinResponse = await agent
    .post("/api/checkins")
    .send(buildCheckinPayload());
  assert.equal(checkinResponse.status, 200);

  const response = await agent.get("/api/audit?limit=50");
  assert.equal(response.status, 200);

  const parsed = AuditResponseSchema.safeParse(response.body);
  assert.ok(parsed.success, "Audit response does not match schema");

  const events = parsed.data.data.events;
  assert.ok(events.length > 0);

  const timestamps = events.map((event) =>
    new Date(event.created_at).getTime()
  );
  for (let index = 1; index < timestamps.length; index += 1) {
    assert.ok(
      timestamps[index] <= timestamps[index - 1],
      "Audit events are not ordered by newest first"
    );
  }

  for (const event of events) {
    assert.ok(!event.metadata_summary.includes("SensitiveNote"));
  }
});

function buildCredentials() {
  const seed = Date.now().toString(36);
  return {
    email: `audit-${seed}@ai-life-ops.local`,
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
    notes: "SensitiveNote"
  };
}
