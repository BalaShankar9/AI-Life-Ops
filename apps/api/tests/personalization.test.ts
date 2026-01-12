import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { signToken } from "../src/auth";

const TEST_PORT = 4001;
const BASE_URL = `http://localhost:${TEST_PORT}`;

let prisma: PrismaClient;
let userId: string;
let token: string;
let snapshotId: string;

describe("Personalization API", () => {
  before(async () => {
    prisma = new PrismaClient();
    
    // Create test user
    const user = await prisma.user.create({
      data: {
        email: `personalization-test-${Date.now()}@example.com`,
        passwordHash: "test",
      },
    });
    userId = user.id;
    token = signToken(userId);

    // Create test snapshot for feedback
    const snapshot = await prisma.snapshot.create({
      data: {
        userId,
        payload: {},
        output: { priorities: [], schedule_plan: [], next_best: [], avoid_today: [] },
      },
    });
    snapshotId = snapshot.id;
  });

  after(async () => {
    await prisma.actionFeedback.deleteMany({ where: { userId } });
    await prisma.personalizationProfile.deleteMany({ where: { userId } });
    await prisma.snapshot.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("GET /api/personalization returns defaults for new user", async () => {
    const response = await request(BASE_URL)
      .get("/api/personalization")
      .set("Cookie", `token=${token}`)
      .expect(200);

    assert.equal(response.body.ok, true);
    assert.deepEqual(response.body.data.weights, {
      energy: 0.2,
      money: 0.2,
      obligations: 0.2,
      growth: 0.2,
      stability: 0.2,
    });
    assert.equal(response.body.data.riskAversion, 0.6);
    assert.equal(response.body.data.focusPreference, "mixed");
    assert.equal(response.body.data.isDefault, true);
  });

  it("PUT /api/personalization creates and returns profile", async () => {
    const response = await request(BASE_URL)
      .put("/api/personalization")
      .set("Cookie", `token=${token}`)
      .send({
        weights: {
          energy: 0.25,
          money: 0.15,
          obligations: 0.2,
          growth: 0.25,
          stability: 0.15,
        },
        riskAversion: 0.7,
        focusPreference: "deep_work",
      })
      .expect(200);

    assert.equal(response.body.ok, true);
    assert.equal(response.body.data.isDefault, false);
    assert.equal(response.body.data.riskAversion, 0.7);
    assert.equal(response.body.data.focusPreference, "deep_work");

    // Verify audit log
    const audit = await prisma.auditLog.findFirst({
      where: { userId, eventType: "PERSONALIZATION_UPDATED" },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(audit);
  });

  it("PUT /api/personalization normalizes weights", async () => {
    const response = await request(BASE_URL)
      .put("/api/personalization")
      .set("Cookie", `token=${token}`)
      .send({
        weights: {
          energy: 0.5, // Too high
          money: 0.02, // Too low
          obligations: 0.2,
          growth: 0.2,
          stability: 0.08,
        },
        riskAversion: 0.5,
        focusPreference: "mixed",
      })
      .expect(200);

    const weights = response.body.data.weights;
    assert.ok(weights.energy <= 0.40); // Clamped
    assert.ok(weights.money >= 0.05); // Clamped
    
    const sum = Object.values(weights).reduce((a: number, b: number) => a + b, 0) as number;
    assert.ok(sum >= 0.95 && sum <= 1.05); // Normalized
  });

  it("POST /api/feedback creates feedback record", async () => {
    const response = await request(BASE_URL)
      .post("/api/feedback")
      .set("Cookie", `token=${token}`)
      .send({
        snapshotId,
        actionTitle: "Test Action",
        actionCategory: "energy",
        scheduled: true,
        feedback: "helped",
        perceivedEffort: 3,
        perceivedImpact: 5,
        comment: "Great action",
      })
      .expect(201);

    assert.equal(response.body.ok, true);
    assert.ok(response.body.data.feedbackId);

    // Verify audit log
    const audit = await prisma.auditLog.findFirst({
      where: { userId, eventType: "ACTION_FEEDBACK_SUBMITTED" },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(audit);
  });

  it("POST /api/feedback rejects invalid snapshot", async () => {
    await request(BASE_URL)
      .post("/api/feedback")
      .set("Cookie", `token=${token}`)
      .send({
        snapshotId: "00000000-0000-0000-0000-000000000000",
        actionTitle: "Test Action",
        actionCategory: "energy",
        scheduled: true,
        feedback: "helped",
        perceivedEffort: null,
        perceivedImpact: null,
        comment: null,
      })
      .expect(404);
  });

  it("GET /api/feedback returns feedback list", async () => {
    const response = await request(BASE_URL)
      .get("/api/feedback?limit=10")
      .set("Cookie", `token=${token}`)
      .expect(200);

    assert.equal(response.body.ok, true);
    assert.ok(Array.isArray(response.body.data.feedback));
    assert.ok(response.body.data.feedback.length >= 1); // From previous test
  });

  it("POST /api/personalization/recalibrate requires 8+ feedback", async () => {
    // Clear existing feedback
    await prisma.actionFeedback.deleteMany({ where: { userId } });

    // Add only 5 feedback entries
    for (let i = 0; i < 5; i++) {
      await prisma.actionFeedback.create({
        data: {
          userId,
          snapshotId,
          actionTitle: `Action ${i}`,
          actionCategory: "energy",
          scheduled: true,
          feedback: "helped",
        },
      });
    }

    const response = await request(BASE_URL)
      .post("/api/personalization/recalibrate")
      .set("Cookie", `token=${token}`)
      .send({ lookbackDays: 30 })
      .expect(200);

    assert.equal(response.body.ok, true);
    assert.equal(response.body.data.confidence, 0);
    assert.equal(response.body.data.recommendApply, false);
    assert.ok(response.body.data.message.includes("Insufficient feedback"));
  });

  it("POST /api/personalization/recalibrate returns proposal with 8+ feedback", async () => {
    // Add 3 more feedback entries (total 8)
    for (let i = 0; i < 3; i++) {
      await prisma.actionFeedback.create({
        data: {
          userId,
          snapshotId,
          actionTitle: `Action ${i + 5}`,
          actionCategory: "growth",
          scheduled: true,
          feedback: "helped",
        },
      });
    }

    const response = await request(BASE_URL)
      .post("/api/personalization/recalibrate")
      .set("Cookie", `token=${token}`)
      .send({ lookbackDays: 30 })
      .expect(200);

    assert.equal(response.body.ok, true);
    assert.ok(response.body.data.proposedWeights);
    assert.ok(typeof response.body.data.confidence === "number");
    // Note: actual recalibration logic not yet integrated, so confidence will be low
  });

  it("requires authentication for all endpoints", async () => {
    await request(BASE_URL).get("/api/personalization").expect(401);
    await request(BASE_URL).put("/api/personalization").send({}).expect(401);
    await request(BASE_URL).post("/api/feedback").send({}).expect(401);
    await request(BASE_URL).get("/api/feedback").expect(401);
    await request(BASE_URL).post("/api/personalization/recalibrate").send({}).expect(401);
  });
});
