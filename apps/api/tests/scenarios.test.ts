import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import request from "supertest";

import {
  CompareResponseSchema,
  ScenarioPackResponseSchema,
  ScenarioPackListResponseSchema,
  SimulateResponseSchema
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

test("unauth users cannot simulate or compare", async () => {
  const simulate = await request(app).post("/api/simulate").send({
    scenario: {
      id: "s1",
      type: "increase_expense",
      params: { amount_per_month: 300, category: "general" }
    }
  });
  assert.equal(simulate.status, 401);

  const compare = await request(app).post("/api/compare").send({
    scenarios: [
      {
        id: "s1",
        type: "increase_expense",
        params: { amount_per_month: 300, category: "general" }
      }
    ]
  });
  assert.equal(compare.status, 401);
});

test("simulate blocked when onboarding incomplete", async () => {
  const agent = request.agent(app);
  const credentials = buildCredentials();

  const registerResponse = await agent
    .post("/auth/register")
    .send(credentials);
  assert.equal(registerResponse.status, 201);

  const simulateResponse = await agent.post("/api/simulate").send({
    scenario: {
      id: "s1",
      type: "increase_expense",
      params: { amount_per_month: 300, category: "general" }
    }
  });
  assert.equal(simulateResponse.status, 400);
});

test("simulate and compare return expected shapes", async () => {
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

  const simulateResponse = await agent.post("/api/simulate").send({
    scenario: {
      id: "sim-1",
      type: "increase_expense",
      params: { amount_per_month: 600, category: "housing" }
    }
  });
  assert.equal(simulateResponse.status, 200);
  const simulateParsed = SimulateResponseSchema.safeParse(simulateResponse.body);
  assert.ok(simulateParsed.success, "Simulate response invalid");

  const compareResponse = await agent.post("/api/compare").send({
    scenarios: [
      {
        id: "sim-1",
        type: "increase_expense",
        params: { amount_per_month: 600, category: "housing" }
      },
      {
        id: "sim-2",
        type: "sleep_schedule_change",
        params: { sleep_hours_delta: 1, bedtime_shift_min: -30 }
      }
    ]
  });
  assert.equal(compareResponse.status, 200);
  const compareParsed = CompareResponseSchema.safeParse(compareResponse.body);
  assert.ok(compareParsed.success, "Compare response invalid");
  assert.ok(compareParsed.data.data.comparison.ranked.length >= 1);
  assert.ok(compareParsed.data.data.simulations.length >= 1);
});

test("scenario pack CRUD and audit events", async () => {
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

  const createResponse = await agent.post("/api/scenario-packs").send({
    name: "Baseline pack",
    description: "QA scenarios",
    baseline_source: "latest_checkin",
    scenarios: [
      {
        id: "job-1",
        type: "add_job",
        params: {
          hours_per_week: 20,
          shift_type: "day",
          commute_min_per_day: 20,
          pay_per_month: 2000
        }
      }
    ]
  });
  assert.equal(createResponse.status, 201);
  const createParsed = ScenarioPackResponseSchema.safeParse(createResponse.body);
  assert.ok(createParsed.success, "Scenario pack create invalid");
  const packId = createParsed.data.data.pack.id;

  const listResponse = await agent.get("/api/scenario-packs");
  assert.equal(listResponse.status, 200);
  const listParsed = ScenarioPackListResponseSchema.safeParse(listResponse.body);
  assert.ok(listParsed.success, "Scenario pack list invalid");
  assert.ok(
    listParsed.data.data.packs.some((pack) => pack.id === packId)
  );

  const updateResponse = await agent.put(`/api/scenario-packs/${packId}`).send({
    name: "Updated pack",
    description: null,
    baseline_source: "latest_checkin",
    scenarios: [
      {
        id: "expense-1",
        type: "increase_expense",
        params: { amount_per_month: 450, category: "general" }
      }
    ]
  });
  assert.equal(updateResponse.status, 200);

  const deleteResponse = await agent.delete(`/api/scenario-packs/${packId}`);
  assert.equal(deleteResponse.status, 200);

  const auditResponse = await agent.get("/api/audit?limit=50");
  assert.equal(auditResponse.status, 200);
  const auditEvents = auditResponse.body?.data?.events ?? [];
  const eventTypes = auditEvents.map((event: { event_type: string }) => event.event_type);
  assert.ok(eventTypes.includes("SCENARIO_PACK_CREATED"));
  assert.ok(eventTypes.includes("SCENARIO_PACK_UPDATED"));
  assert.ok(eventTypes.includes("SCENARIO_PACK_DELETED"));
});

function buildCredentials() {
  const seed = Date.now().toString(36);
  return {
    email: `scenario-${seed}@ai-life-ops.local`,
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
    stress_level: 4,
    money_pressure: 5,
    today_deadlines_count: 2,
    critical_deadline: false,
    available_time_hours: 6,
    notes: "Scenario QA"
  };
}
