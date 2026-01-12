import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import request from "supertest";

import {
  ConnectorAuthUrlResponseSchema,
  ConnectorDisconnectResponseSchema,
  ConnectorsResponseSchema,
  ConnectorSyncResponseSchema
} from "@ai-life-ops/shared";

import { createApp, logger, prisma } from "../src/app";
import { encryptString } from "../src/connectors/crypto";
import { runConnectorSync } from "../src/connectors/sync";

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
process.env.GOOGLE_OAUTH_CLIENT_ID =
  process.env.GOOGLE_OAUTH_CLIENT_ID || "test-client-id";
process.env.GOOGLE_OAUTH_CLIENT_SECRET =
  process.env.GOOGLE_OAUTH_CLIENT_SECRET || "test-client-secret";
process.env.GOOGLE_OAUTH_REDIRECT_URI =
  process.env.GOOGLE_OAUTH_REDIRECT_URI ||
  "http://localhost:4000/api/connectors/google_calendar/callback";

const app = createApp();

before(async () => {
  await prisma.$connect();
});

after(async () => {
  await prisma.$disconnect();
});

test("GET /api/connectors returns empty list initially", async () => {
  const agent = request.agent(app);
  const credentials = buildCredentials();

  const registerResponse = await agent
    .post("/auth/register")
    .send(credentials);
  assert.equal(registerResponse.status, 201);

  const response = await agent.get("/api/connectors");
  assert.equal(response.status, 200);

  const parsed = ConnectorsResponseSchema.safeParse(response.body);
  assert.ok(parsed.success, "Connectors response does not match schema");
  assert.equal(parsed.data.data.connectors.length, 0);
});

test("POST /api/connectors/google_calendar/sync enqueues job and writes audit event", async () => {
  const agent = request.agent(app);
  const credentials = buildCredentials();

  const registerResponse = await agent
    .post("/auth/register")
    .send(credentials);
  assert.equal(registerResponse.status, 201);

  const userId = registerResponse.body?.data?.user?.id as string;
  assert.ok(userId);

  const response = await agent.post("/api/connectors/google_calendar/sync");
  assert.equal(response.status, 202);

  const parsed = ConnectorSyncResponseSchema.safeParse(response.body);
  assert.ok(parsed.success, "Connector sync response does not match schema");
  assert.ok(parsed.data.data.job_id);

  const audit = await prisma.auditLog.findFirst({
    where: { userId, eventType: "CONNECTOR_SYNC_REQUESTED" },
    orderBy: { createdAt: "desc" }
  });
  assert.ok(audit, "Missing CONNECTOR_SYNC_REQUESTED audit event");

  assert.ok(!JSON.stringify(response.body).includes("encrypted"));
});

test("POST /api/connectors/google_calendar/disconnect clears tokens and writes audit event", async () => {
  const agent = request.agent(app);
  const credentials = buildCredentials();

  const registerResponse = await agent
    .post("/auth/register")
    .send(credentials);
  assert.equal(registerResponse.status, 201);

  const userId = registerResponse.body?.data?.user?.id as string;
  assert.ok(userId);

  await prisma.connector.create({
    data: {
      userId,
      provider: "google_calendar",
      status: "connected",
      encryptedAccessToken: encryptString("access"),
      encryptedRefreshToken: encryptString("refresh"),
      tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      scopes: ["calendar.readonly"]
    }
  });

  const response = await agent.post(
    "/api/connectors/google_calendar/disconnect"
  );
  assert.equal(response.status, 200);

  const parsed = ConnectorDisconnectResponseSchema.safeParse(response.body);
  assert.ok(parsed.success, "Connector disconnect response does not match schema");
  assert.equal(parsed.data.data.connector.status, "disconnected");

  const connector = await prisma.connector.findUnique({
    where: { userId_provider: { userId, provider: "google_calendar" } }
  });
  assert.ok(connector);
  assert.equal(connector?.encryptedAccessToken, null);
  assert.equal(connector?.encryptedRefreshToken, null);
  assert.equal(connector?.tokenExpiresAt, null);
  assert.equal(connector?.status, "disconnected");

  const audit = await prisma.auditLog.findFirst({
    where: { userId, eventType: "CONNECTOR_DISCONNECTED" },
    orderBy: { createdAt: "desc" }
  });
  assert.ok(audit, "Missing CONNECTOR_DISCONNECTED audit event");

  assert.ok(!JSON.stringify(response.body).includes("encrypted"));
});

test("GET /api/connectors/google_calendar/auth-url returns URL with state and scope", async () => {
  const agent = request.agent(app);
  const credentials = buildCredentials();

  const registerResponse = await agent
    .post("/auth/register")
    .send(credentials);
  assert.equal(registerResponse.status, 201);

  const response = await agent.get("/api/connectors/google_calendar/auth-url");
  assert.equal(response.status, 200);

  const parsed = ConnectorAuthUrlResponseSchema.safeParse(response.body);
  assert.ok(parsed.success, "Connector auth response does not match schema");
  assert.ok(!JSON.stringify(response.body).includes("encrypted"));

  const url = new URL(parsed.data.data.url);
  const state = url.searchParams.get("state");
  const scope = url.searchParams.get("scope");

  assert.ok(state, "OAuth state missing");
  assert.ok(scope?.includes("calendar.readonly"));

  const record = await prisma.oAuthState.findUnique({
    where: { state: state! }
  });
  assert.ok(record, "OAuth state not stored");
});

test("GET /api/connectors/google_calendar/callback stores tokens and clears state", async () => {
  const agent = request.agent(app);
  const credentials = buildCredentials();

  const registerResponse = await agent
    .post("/auth/register")
    .send(credentials);
  assert.equal(registerResponse.status, 201);

  const authResponse = await agent.get("/api/connectors/google_calendar/auth-url");
  const authParsed = ConnectorAuthUrlResponseSchema.safeParse(authResponse.body);
  assert.ok(authParsed.success);
  const authUrl = new URL(authParsed.data.data.url);
  const state = authUrl.searchParams.get("state");
  assert.ok(state);

  const originalFetch = global.fetch;
  try {
    global.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "https://oauth2.googleapis.com/token") {
        return new Response(
          JSON.stringify({
            access_token: "access-token",
            refresh_token: "refresh-token",
            expires_in: 3600,
            scope: "https://www.googleapis.com/auth/calendar.readonly"
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    const callbackResponse = await agent.get(
      `/api/connectors/google_calendar/callback?code=test-code&state=${state}`
    );
    assert.equal(callbackResponse.status, 302);
    assert.match(callbackResponse.headers.location, /connectors\?connected=/);

    const userId = registerResponse.body?.data?.user?.id as string;
    const connector = await prisma.connector.findUnique({
      where: { userId_provider: { userId, provider: "google_calendar" } }
    });
    assert.ok(connector?.encryptedAccessToken);
    assert.ok(connector?.encryptedRefreshToken);
    assert.equal(connector?.status, "connected");

    const stateRecord = await prisma.oAuthState.findUnique({
      where: { state: state! }
    });
    assert.equal(stateRecord, null);
  } finally {
    global.fetch = originalFetch;
  }
});

test("connector sync creates canonical events and replaces them on re-sync", async () => {
  const agent = request.agent(app);
  const credentials = buildCredentials();

  const registerResponse = await agent
    .post("/auth/register")
    .send(credentials);
  assert.equal(registerResponse.status, 201);

  const userId = registerResponse.body?.data?.user?.id as string;
  assert.ok(userId);

  await prisma.profile.create({
    data: {
      userId,
      timezone: "America/Los_Angeles",
      wake_window_start: "07:00",
      wake_window_end: "10:00",
      sleep_window_start: "22:00",
      sleep_window_end: "06:00",
      work_pattern: "day",
      max_daily_focus_blocks: 2,
      priority_bias: "stability_first",
      compliance_domains: ["bills", "visa/legal"],
      onboarding_completed_at: new Date()
    }
  });

  await prisma.connector.create({
    data: {
      userId,
      provider: "google_calendar",
      status: "connected",
      encryptedAccessToken: encryptString("stale-access"),
      encryptedRefreshToken: encryptString("refresh-token"),
      tokenExpiresAt: new Date(Date.now() - 60 * 1000),
      scopes: ["https://www.googleapis.com/auth/calendar.readonly"]
    }
  });

  const originalFetch = global.fetch;
  let freeBusyAuthHeader = "";
  try {
    global.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "https://oauth2.googleapis.com/token") {
        return new Response(
          JSON.stringify({
            access_token: "refreshed-access",
            expires_in: 3600,
            scope: "https://www.googleapis.com/auth/calendar.readonly"
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
      if (url === "https://www.googleapis.com/calendar/v3/freeBusy") {
        freeBusyAuthHeader = getAuthHeader(init);
        return new Response(
          JSON.stringify({
            calendars: {
              primary: {
                busy: [
                  {
                    start: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
                    end: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
                  },
                  {
                    start: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
                    end: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()
                  }
                ]
              }
            }
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    await runConnectorSync({
      prisma,
      logger,
      userId,
      provider: "google_calendar",
      requestId: "test-sync-1"
    });

    assert.ok(freeBusyAuthHeader.includes("Bearer refreshed-access"));

    const events = await prisma.event.findMany({
      where: { userId, sourceProvider: "google_calendar" }
    });
    assert.equal(events.length, 2);
    assert.equal(events[0]?.kind, "calendar_busy_block");
    assert.equal(events[0]?.timezone, "America/Los_Angeles");
    assert.equal(
      (events[0]?.metadata as Record<string, string>).calendarId,
      "primary"
    );

    global.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "https://oauth2.googleapis.com/token") {
        return new Response(
          JSON.stringify({
            access_token: "refreshed-access",
            expires_in: 3600,
            scope: "https://www.googleapis.com/auth/calendar.readonly"
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
      if (url === "https://www.googleapis.com/calendar/v3/freeBusy") {
        return new Response(
          JSON.stringify({
            calendars: {
              primary: {
                busy: [
                  {
                    start: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
                    end: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()
                  }
                ]
              }
            }
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    await runConnectorSync({
      prisma,
      logger,
      userId,
      provider: "google_calendar",
      requestId: "test-sync-2"
    });

    const updatedEvents = await prisma.event.findMany({
      where: { userId, sourceProvider: "google_calendar" }
    });
    assert.equal(updatedEvents.length, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

function buildCredentials() {
  const seed = Date.now().toString(36);
  return {
    email: `connector-${seed}@ai-life-ops.local`,
    password: `Test${seed}#1`
  };
}

function getAuthHeader(init?: RequestInit): string {
  if (!init?.headers) {
    return "";
  }
  if (init.headers instanceof Headers) {
    return init.headers.get("Authorization") || "";
  }
  if (Array.isArray(init.headers)) {
    const entry = init.headers.find(
      ([key]) => key.toLowerCase() === "authorization"
    );
    return entry ? entry[1] : "";
  }
  const record = init.headers as Record<string, string>;
  return record.Authorization || record.authorization || "";
}
