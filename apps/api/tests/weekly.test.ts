import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import request from "supertest";

import {
  WeeklyReportListResponseSchema,
  WeeklyReportResponseSchema
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
process.env.WEEKLY_ENGINE_ENTRYPOINT =
  process.env.WEEKLY_ENGINE_ENTRYPOINT || "../../packages/engine/weekly_cli.py";
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
  const response = await request(app).get("/api/weekly/latest");
  assert.equal(response.status, 401);
});

test("weekly generate/list/latest endpoints", async () => {
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

  const first = await agent.post("/api/checkins").send(buildCheckinPayload(3));
  assert.equal(first.status, 200);
  const firstSnapshotId = first.body?.data?.snapshot?.id as string;

  const second = await agent.post("/api/checkins").send(buildCheckinPayload(8));
  assert.equal(second.status, 200);

  if (firstSnapshotId) {
    await prisma.snapshot.update({
      where: { id: firstSnapshotId },
      data: { createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });
  }

  const weekStart = getWeekStart();

  const generateResponse = await agent.post(
    `/api/weekly/generate?weekStart=${weekStart}`
  );
  assert.equal(generateResponse.status, 200);
  const parsed = WeeklyReportResponseSchema.safeParse(generateResponse.body);
  assert.ok(parsed.success, "Weekly report response does not match schema");

  const report = parsed.data.data.report;
  assert.ok(report);
  assert.equal(
    report.content.score_trend.end_score - report.content.score_trend.start_score,
    report.content.score_trend.delta
  );
  assert.ok(report.content.next_week_focus.length <= 3);

  const latestResponse = await agent.get("/api/weekly/latest");
  assert.equal(latestResponse.status, 200);
  const latestParsed = WeeklyReportResponseSchema.safeParse(latestResponse.body);
  assert.ok(latestParsed.success);
  assert.ok(latestParsed.data.data.report);

  const listResponse = await agent.get("/api/weekly/list?limit=12");
  assert.equal(listResponse.status, 200);
  const listParsed = WeeklyReportListResponseSchema.safeParse(listResponse.body);
  assert.ok(listParsed.success);
  assert.ok(listParsed.data.data.items.length >= 1);
});

test("weekly pdf endpoint returns application/pdf", async () => {
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

  const checkin = await agent.post("/api/checkins").send(buildCheckinPayload(6));
  assert.equal(checkin.status, 200);

  const weekStart = getWeekStart();

  const pdfResponse = await agent.post(`/api/weekly/pdf?weekStart=${weekStart}`);
  assert.equal(pdfResponse.status, 200);
  assert.match(pdfResponse.headers["content-type"], /application\/pdf/);
});

function buildCredentials() {
  const seed = Date.now().toString(36);
  return {
    email: `weekly-${seed}@ai-life-ops.local`,
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

function buildCheckinPayload(sleepHours: number) {
  return {
    sleep_hours: sleepHours,
    energy_level: 6,
    stress_level: 5,
    money_pressure: 5,
    today_deadlines_count: 2,
    critical_deadline: false,
    available_time_hours: 6,
    notes: "Weekly QA"
  };
}

function getWeekStart() {
  const now = new Date();
  const utcDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const day = utcDate.getUTCDay();
  const offset = (day + 6) % 7;
  utcDate.setUTCDate(utcDate.getUTCDate() - offset);
  return utcDate.toISOString().slice(0, 10);
}
