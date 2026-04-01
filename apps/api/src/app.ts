import { spawn } from "child_process";
import { createHmac, randomUUID } from "crypto";
import dotenv from "dotenv";
import express, { NextFunction, Request, Response } from "express";
import pino from "pino";

import { PrismaClient, Profile, Scenario, ScenarioPack } from "@prisma/client";
import {
  CheckinInputSchema,
  AuditResponseSchema,
  CompareRequestSchema,
  CompareResponseSchema,
  EngineOutputSchema,
  ConnectorAuthUrlResponseSchema,
  ConnectorDisconnectResponseSchema,
  ConnectorsResponseSchema,
  ConnectorSyncResponseSchema,
  OnboardingStatusResponseSchema,
  PersonalizationProfileSchema,
  PersonalizationResponseSchema,
  PersonalizationRequestSchema,
  ActionFeedbackRequestSchema,
  ActionFeedbackListResponseSchema,
  RecalibrationRequestSchema,
  RecalibrationResponseSchema,
  ProfileInputSchema,
  ProfileResponseSchema,
  ScenarioPackListResponseSchema,
  ScenarioPackRequestSchema,
  ScenarioPackResponseSchema,
  SimulateRequestSchema,
  SimulateResponseSchema,
  SimulationResultSchema,
  ComparisonResultSchema,
  WeeklyReportListResponseSchema,
  WeeklyReportResponseSchema
} from "@ai-life-ops/shared";
import type {
  ApiErrorResponse,
  ApiSuccessResponse,
  ProfileInput
} from "@ai-life-ops/shared";

import {
  clearAuthCookie,
  ensurePersonalOrg,
  getJwtSecret,
  getTokenFromCookies,
  hashPassword,
  setAuthCookie,
  signToken,
  verifyPassword,
  verifyToken
} from "./auth";
import { toAuditEvent } from "./audit";
import { requireOrgAccess, requireRole } from "./rbac";
import { canView, getActiveScopes, maskEmail, redact, redactText, scopeIncludes } from "./sharing";
import { generateCsrfToken, getCsrfSecret, securityHeaders, validateCsrf } from "./csrf";
import { emitMonitoringEvent } from "./monitoring";
import { validateConnectorEncryptionKey } from "./connectors/crypto";
import {
  GOOGLE_CALENDAR_SCOPES,
  getGoogleOAuthConfig,
  validateGoogleOAuthConfig
} from "./connectors/google_oauth";
import { createOAuthState, consumeOAuthState } from "./connectors/oauth_state";
import { getConnectorAdapter, isConnectorProvider } from "./connectors/registry";
import { getConnectorTokens, setConnectorTokens } from "./connectors/tokens";
import {
  buildWeeklyPdfHtml,
  fetchLatestWeeklyReport,
  fetchWeeklyReport,
  fetchWeeklyReportList,
  generateWeeklyReport,
  parseWeekStart,
  renderWeeklyPdf
} from "./weekly";
import { getConnectorSyncQueue } from "./queues";

dotenv.config();

export const prisma = new PrismaClient();
export const logger = pino({ level: process.env.LOG_LEVEL || "info" });

const WEB_ORIGIN = process.env.WEB_ORIGIN || "http://localhost:3000";
type ScenarioPackWithScenarios = ScenarioPack & { scenarios: Scenario[] };

export function createApp() {
  // Validate environment secrets
  validateConnectorEncryptionKey();
  validateGoogleOAuthConfig();
  
  // Validate CSRF_SECRET
  try {
    getCsrfSecret();
  } catch (error) {
    logger.fatal("CSRF_SECRET environment variable is required for SOC2 compliance");
    process.exit(1);
  }
  
  const app = express();

  app.use(express.json({ limit: "1mb" }));
  
  // Apply security headers middleware globally
  app.use(securityHeaders);

  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Access-Control-Allow-Origin", WEB_ORIGIN);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Accept, X-Requested-With, X-CSRF-Token"
    );
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS"
    );

    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }

    return next();
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = req.header("x-request-id") || randomUUID();
    req.requestId = requestId;
    res.setHeader("x-request-id", requestId);

    const start = Date.now();
    res.on("finish", () => {
      logger.info(
        {
          request_id: requestId,
          method: req.method,
          path: req.originalUrl,
          status: res.statusCode,
          duration_ms: Date.now() - start
        },
        "request"
      );
    });

    next();
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/auth/register", async (req, res, next) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const password = req.body?.password;

      if (!email || typeof password !== "string") {
        return sendError(res, 400, "Email and password are required", req.requestId);
      }

      const passwordError = validatePassword(password);
      if (passwordError) {
        return sendError(res, 400, passwordError, req.requestId);
      }

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return sendError(res, 409, "Account already exists", req.requestId);
      }

      const passwordHash = await hashPassword(password);
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash
        }
      });

      // Auto-create Personal org + owner membership
      await ensurePersonalOrg(prisma, user.id);

      const token = signToken({ sub: user.id, email: user.email });
      setAuthCookie(res, token);

      await prisma.auditLog.create({
        data: {
          userId: user.id,
          eventType: "REGISTER"
        }
      });

      const response: ApiSuccessResponse = {
        ok: true,
        data: {
          user: { id: user.id, email: user.email }
        }
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  });

  app.post("/auth/login", async (req, res, next) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const password = req.body?.password;

      if (!email || typeof password !== "string") {
        return sendError(res, 400, "Email and password are required", req.requestId);
      }

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !user.passwordHash) {
        return sendError(res, 401, "Invalid credentials", req.requestId);
      }

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        return sendError(res, 401, "Invalid credentials", req.requestId);
      }

      // Ensure Personal org exists (for existing users from before multi-tenancy)
      await ensurePersonalOrg(prisma, user.id);

      const token = signToken({ sub: user.id, email: user.email });
      setAuthCookie(res, token);

      await prisma.auditLog.create({
        data: {
          userId: user.id,
          eventType: "LOGIN"
        }
      });

      const response: ApiSuccessResponse = {
        ok: true,
        data: {
          user: { id: user.id, email: user.email }
        }
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  app.post("/auth/logout", async (req, res, next) => {
    try {
      const user = await getUserFromRequest(req);
      clearAuthCookie(res);

      if (user) {
        await prisma.auditLog.create({
          data: {
            userId: user.id,
            eventType: "LOGOUT"
          }
        });
      }

      const response: ApiSuccessResponse = {
        ok: true,
        data: { logged_out: true }
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  app.get("/auth/me", async (req, res, next) => {
    try {
      const user = await getUserFromRequest(req);
      if (!user) {
        return sendError(res, 401, "Unauthorized", req.requestId);
      }

      const response: ApiSuccessResponse = {
        ok: true,
        data: {
          user
        }
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  // CSRF token endpoint (SOC2 compliance)
  app.get("/auth/csrf", async (req, res, next) => {
    try {
      const user = await getUserFromRequest(req);
      if (!user) {
        return sendError(res, 401, "Unauthorized", req.requestId);
      }

      const csrfToken = generateCsrfToken();
      
      // Set cookie (non-HttpOnly so client can read it)
      const isProduction = process.env.NODE_ENV === "production";
      const secure = isProduction ? "; Secure" : "";
      const cookie = `csrf_token=${csrfToken}; Path=/; SameSite=Lax; Max-Age=7200${secure}`;
      res.setHeader("Set-Cookie", cookie);

      const response: ApiSuccessResponse = {
        ok: true,
        data: { csrfToken }
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  // Apply CSRF validation to all /api routes (will skip GET/HEAD/OPTIONS automatically)
  app.use("/api", validateCsrf);
  
  app.use("/api", requireAuth);

  app.get("/api/profile", async (req, res, next) => {
    try {
      const profile = await prisma.profile.findUnique({
        where: { userId: req.user!.id }
      });

      const response: ApiSuccessResponse = {
        ok: true,
        data: {
          profile: profile
            ? {
                timezone: profile.timezone,
                wake_window_start: profile.wake_window_start,
                wake_window_end: profile.wake_window_end,
                sleep_window_start: profile.sleep_window_start,
                sleep_window_end: profile.sleep_window_end,
                work_pattern: profile.work_pattern,
                max_daily_focus_blocks: profile.max_daily_focus_blocks,
                priority_bias: profile.priority_bias,
                compliance_domains: profile.compliance_domains,
                onboarding_completed_at: profile.onboarding_completed_at
                  ? profile.onboarding_completed_at.toISOString()
                  : null
              }
            : null
        }
      };

      const parsed = ProfileResponseSchema.safeParse(response);
      if (!parsed.success) {
        logger.error({ issues: parsed.error.issues }, "Profile response invalid");
      }

      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/profile", async (req, res, next) => {
    try {
      const parseResult = ProfileInputSchema.safeParse(req.body);
      if (!parseResult.success) {
        return sendError(res, 400, "Invalid profile payload", req.requestId);
      }

      const normalized = normalizeProfileInput(parseResult.data);

      const existing = await prisma.profile.findUnique({
        where: { userId: req.user!.id }
      });

      const shouldComplete = isProfileComplete(normalized);
      const completedNow = shouldComplete && !existing?.onboarding_completed_at;
      const completedAt = shouldComplete
        ? existing?.onboarding_completed_at || new Date()
        : existing?.onboarding_completed_at || null;

      const profile = await prisma.profile.upsert({
        where: { userId: req.user!.id },
        update: {
          timezone: normalized.timezone,
          wake_window_start: normalized.wake_window_start,
          wake_window_end: normalized.wake_window_end,
          sleep_window_start: normalized.sleep_window_start,
          sleep_window_end: normalized.sleep_window_end,
          work_pattern: normalized.work_pattern,
          max_daily_focus_blocks: normalized.max_daily_focus_blocks,
          priority_bias: normalized.priority_bias,
          compliance_domains: normalized.compliance_domains,
          onboarding_completed_at: completedAt
        },
        create: {
          userId: req.user!.id,
          timezone: normalized.timezone,
          wake_window_start: normalized.wake_window_start,
          wake_window_end: normalized.wake_window_end,
          sleep_window_start: normalized.sleep_window_start,
          sleep_window_end: normalized.sleep_window_end,
          work_pattern: normalized.work_pattern,
          max_daily_focus_blocks: normalized.max_daily_focus_blocks,
          priority_bias: normalized.priority_bias,
          compliance_domains: normalized.compliance_domains,
          onboarding_completed_at: completedAt
        }
      });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          eventType: "PROFILE_UPDATED"
        }
      });

      if (completedNow) {
        await prisma.auditLog.create({
          data: {
            userId: req.user!.id,
            eventType: "ONBOARDING_COMPLETED"
          }
        });
      }

      const response: ApiSuccessResponse = {
        ok: true,
        data: {
          profile: {
            timezone: profile.timezone,
            wake_window_start: profile.wake_window_start,
            wake_window_end: profile.wake_window_end,
            sleep_window_start: profile.sleep_window_start,
            sleep_window_end: profile.sleep_window_end,
            work_pattern: profile.work_pattern,
            max_daily_focus_blocks: profile.max_daily_focus_blocks,
            priority_bias: profile.priority_bias,
            compliance_domains: profile.compliance_domains,
            onboarding_completed_at: profile.onboarding_completed_at
              ? profile.onboarding_completed_at.toISOString()
              : null
          }
        }
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/onboarding/status", async (req, res, next) => {
    try {
      const profile = await prisma.profile.findUnique({
        where: { userId: req.user!.id }
      });

      const response: ApiSuccessResponse = {
        ok: true,
        data: {
          completed: Boolean(profile?.onboarding_completed_at)
        }
      };

      const parsed = OnboardingStatusResponseSchema.safeParse(response);
      if (!parsed.success) {
        logger.error({ issues: parsed.error.issues }, "Onboarding status invalid");
      }

      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/checkins", async (req, res, next) => {
    try {
      const parseResult = CheckinInputSchema.safeParse(req.body);
      if (!parseResult.success) {
        return sendError(res, 400, "Invalid check-in payload", req.requestId);
      }

      const profile = await prisma.profile.findUnique({
        where: { userId: req.user!.id }
      });

      if (!profile || !profile.onboarding_completed_at) {
        return sendError(
          res,
          400,
          "Complete onboarding before submitting a check-in",
          req.requestId
        );
      }

      const input = parseResult.data;
      const profileContext = {
        timezone: profile.timezone,
        wake_window_start: profile.wake_window_start,
        wake_window_end: profile.wake_window_end,
        sleep_window_start: profile.sleep_window_start,
        sleep_window_end: profile.sleep_window_end,
        work_pattern: profile.work_pattern,
        max_daily_focus_blocks: profile.max_daily_focus_blocks,
        priority_bias: profile.priority_bias,
        compliance_domains: profile.compliance_domains
      };

      const scheduleContext = await buildScheduleContext(
        prisma,
        req.user!.id,
        profile.timezone
      );

      let engineOutput: unknown;
      try {
        engineOutput = await runEngine({
          checkin: input,
          profile_context: profileContext,
          schedule: scheduleContext.schedule
        }, req.requestId);
      } catch (error) {
        logger.error(
          { request_id: req.requestId, err: error },
          "Engine invocation failed"
        );
        return sendError(res, 502, "Engine failure", req.requestId);
      }

      const outputResult = EngineOutputSchema.safeParse(engineOutput);
      if (!outputResult.success) {
        logger.error(
          {
            request_id: req.requestId,
            issues: outputResult.error.issues
          },
          "Engine output failed schema validation"
        );
        return sendError(res, 502, "Engine output invalid", req.requestId);
      }

      const output = outputResult.data;

      const snapshot = await prisma.$transaction(async (tx) => {
        const checkin = await tx.checkin.create({
          data: {
            userId: req.user!.id,
            orgId: req.orgId!,
            payload: input
          }
        });

        const snapshotRecord = await tx.snapshot.create({
          data: {
            userId: req.user!.id,
            orgId: req.orgId!,
            checkinId: checkin.id,
            output,
            lifeStabilityScore: output.life_stability_score,
            flags: output.flags
          }
        });

        await tx.auditLog.create({
          data: {
            userId: req.user!.id,
            eventType: "CHECKIN_CREATED",
            metadata: {
              checkinId: checkin.id,
              snapshotId: snapshotRecord.id
            }
          }
        });

        await tx.auditLog.create({
          data: {
            userId: req.user!.id,
            eventType: scheduleContext.hasBusyBlocks
              ? "SCHEDULE_USED"
              : "SCHEDULE_NOT_AVAILABLE",
            metadata: {
              busyBlockCount: scheduleContext.schedule.busy_blocks.length
            }
          }
        });

        return snapshotRecord;
      });

      const response: ApiSuccessResponse = {
        ok: true,
        data: {
          snapshot
        }
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  });

  // Personalization endpoints
  app.get("/api/personalization", async (req, res, next) => {
    try {
      const profile = await prisma.personalizationProfile.findUnique({
        where: { userId: req.user!.id }
      });

      const weights = profile?.weights as { energy: number; money: number; obligations: number; growth: number; stability: number } | null;
      const response: ApiSuccessResponse = {
        ok: true,
        data: PersonalizationResponseSchema.parse({
          weights: weights || { energy: 0.2, money: 0.2, obligations: 0.2, growth: 0.2, stability: 0.2 },
          riskAversion: profile?.riskAversion ?? 0.6,
          focusPreference: profile?.focusPreference ?? "mixed",
          isDefault: !profile
        })
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/personalization", async (req, res, next) => {
    try {
      const input = PersonalizationRequestSchema.parse(req.body);

      // Normalize weights (clamp [0.05, 0.40], sum to 1.0)
      const { weights, risk_aversion, focus_preference } = input;
      const clamped = Object.fromEntries(
        Object.entries(weights).map(([k, v]) => [k, Math.max(0.05, Math.min(0.40, v))])
      ) as typeof weights;
      const sum = Object.values(clamped).reduce((a, b) => a + b, 0);
      const normalized = Object.fromEntries(
        Object.entries(clamped).map(([k, v]) => [k, v / sum])
      ) as typeof weights;

      const profile = await prisma.personalizationProfile.upsert({
        where: { userId: req.user!.id },
        update: {
          weights: normalized,
          riskAversion: risk_aversion,
          focusPreference: focus_preference
        },
        create: {
          userId: req.user!.id,
          orgId: req.orgId!,
          weights: normalized,
          riskAversion: risk_aversion,
          focusPreference: focus_preference
        }
      });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          eventType: "PERSONALIZATION_UPDATED",
          metadata: { weights: normalized, riskAversion: risk_aversion, focusPreference: focus_preference }
        }
      });

      const response: ApiSuccessResponse = {
        ok: true,
        data: PersonalizationResponseSchema.parse({
          weights: profile.weights as typeof weights,
          riskAversion: profile.riskAversion,
          focusPreference: profile.focusPreference,
          isDefault: false
        })
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/feedback", async (req, res, next) => {
    try {
      const input = ActionFeedbackRequestSchema.parse(req.body);

      const snapshot = await prisma.snapshot.findFirst({
        where: { id: input.snapshot_id, userId: req.user!.id }
      });

      if (!snapshot) {
        const errorResponse: ApiErrorResponse = {
          ok: false,
          error: "Snapshot not found or not authorized"
        };
        return res.status(404).json(errorResponse);
      }

      const feedback = await prisma.actionFeedback.create({
        data: {
          userId: req.user!.id,
          orgId: req.orgId!,
          snapshotId: input.snapshot_id,
          actionTitle: input.action_title,
          actionCategory: input.action_category,
          scheduled: input.scheduled,
          feedback: input.feedback,
          perceivedEffort: input.perceived_effort,
          perceivedImpact: input.perceived_impact,
          comment: input.comment
        }
      });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          eventType: "ACTION_FEEDBACK_SUBMITTED",
          metadata: {
            snapshotId: input.snapshot_id,
            actionTitle: input.action_title,
            feedback: input.feedback
          }
        }
      });

      const response: ApiSuccessResponse = {
        ok: true,
        data: { feedbackId: feedback.id }
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/feedback", async (req, res, next) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

      const feedbackList = await prisma.actionFeedback.findMany({
        where: { userId: req.user!.id },
        orderBy: { createdAt: "desc" },
        take: limit
      });

      const response: ApiSuccessResponse = {
        ok: true,
        data: ActionFeedbackListResponseSchema.parse({
          feedback: feedbackList.map((f) => ({
            id: f.id,
            snapshotId: f.snapshotId,
            actionTitle: f.actionTitle,
            actionCategory: f.actionCategory,
            scheduled: f.scheduled,
            feedback: f.feedback,
            perceivedEffort: f.perceivedEffort,
            perceivedImpact: f.perceivedImpact,
            comment: f.comment,
            createdAt: f.createdAt.toISOString()
          }))
        })
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/personalization/recalibrate", async (req, res, next) => {
    try {
      const input = RecalibrationRequestSchema.parse(req.body);

      const currentProfile = await prisma.personalizationProfile.findUnique({
        where: { userId: req.user!.id }
      });

      const currentWeights = currentProfile?.weights as { energy: number; money: number; obligations: number; growth: number; stability: number } | null;
      const currentRiskAversion = currentProfile?.riskAversion ?? 0.6;

      const feedbackList = await prisma.actionFeedback.findMany({
        where: { userId: req.user!.id },
        orderBy: { createdAt: "desc" },
        take: input.apply ? 100 : 50
      });

      if (feedbackList.length < 8) {
        const response: ApiSuccessResponse = {
          ok: true,
          data: RecalibrationResponseSchema.parse({
            proposedWeights: currentWeights || { energy: 0.2, money: 0.2, obligations: 0.2, growth: 0.2, stability: 0.2 },
            proposedRiskAversion: currentRiskAversion,
            confidence: 0,
            changes: [],
            recommendApply: false,
            message: "Insufficient feedback (need 8+). Keep using the system."
          })
        };
        return res.status(200).json(response);
      }

      // TODO: Call Python engine to compute bounded learning update
      // For now, return current weights with low confidence
      const response: ApiSuccessResponse = {
        ok: true,
        data: RecalibrationResponseSchema.parse({
          proposedWeights: currentWeights || { energy: 0.2, money: 0.2, obligations: 0.2, growth: 0.2, stability: 0.2 },
          proposedRiskAversion: currentRiskAversion,
          confidence: 0.3,
          changes: [],
          recommendApply: false,
          message: "Recalibration engine not yet integrated. Manual adjustment recommended."
        })
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/weekly/generate", async (req, res, next) => {
    try {
      const weekStart = extractWeekStart(req, res);
      if (!weekStart) {
        return;
      }

      const report = await generateWeeklyReport({
        prisma,
        logger,
        userId: req.user!.id,
        weekStart,
        requestId: req.requestId
      });

      const response: ApiSuccessResponse = {
        ok: true,
        data: {
          report
        }
      };

      const parsed = WeeklyReportResponseSchema.safeParse(response);
      if (!parsed.success) {
        logger.error(
          { issues: parsed.error.issues },
          "Weekly report response invalid"
        );
      }

      res.json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("weekStart") || message.includes("onboarding")) {
        return sendError(res, 400, message, req.requestId);
      }
      next(error);
    }
  });

  app.get("/api/weekly/latest", async (req, res, next) => {
    try {
      const report = await fetchLatestWeeklyReport({
        prisma,
        userId: req.user!.id
      });

      const response: ApiSuccessResponse = {
        ok: true,
        data: {
          report
        }
      };

      const parsed = WeeklyReportResponseSchema.safeParse(response);
      if (!parsed.success) {
        logger.error(
          { issues: parsed.error.issues },
          "Weekly report latest response invalid"
        );
      }

      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/weekly/list", async (req, res, next) => {
    try {
      const limitRaw = Array.isArray(req.query.limit)
        ? req.query.limit[0]
        : req.query.limit;
      const limitParsed = Number(limitRaw || 12);
      const limit = Number.isNaN(limitParsed)
        ? 12
        : Math.min(Math.max(limitParsed, 1), 52);

      const items = await fetchWeeklyReportList({
        prisma,
        userId: req.user!.id,
        limit
      });

      const response: ApiSuccessResponse = {
        ok: true,
        data: {
          items
        }
      };

      const parsed = WeeklyReportListResponseSchema.safeParse(response);
      if (!parsed.success) {
        logger.error(
          { issues: parsed.error.issues },
          "Weekly report list response invalid"
        );
      }

      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/weekly/pdf", async (req, res, next) => {
    try {
      const weekStart = extractWeekStart(req, res);
      if (!weekStart) {
        return;
      }

      let report = await fetchWeeklyReport({
        prisma,
        userId: req.user!.id,
        weekStart
      });

      if (!report) {
        report = await generateWeeklyReport({
          prisma,
          logger,
          userId: req.user!.id,
          weekStart,
          requestId: req.requestId
        });
      }

      const html = buildWeeklyPdfHtml(report);
      const pdfBuffer = await renderWeeklyPdf(html);

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          eventType: "WEEKLY_PDF_EXPORTED",
          metadata: {
            weeklyReportId: report.id,
            weekStart
          }
        }
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=weekly-review-${weekStart}.pdf`
      );
      res.status(200).send(pdfBuffer);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("weekStart") || message.includes("onboarding")) {
        return sendError(res, 400, message, req.requestId);
      }
      next(error);
    }
  });

  app.get("/api/today", async (req, res, next) => {
    try {
      const snapshot = await prisma.snapshot.findFirst({
        where: { userId: req.user!.id },
        orderBy: { createdAt: "desc" }
      });

      if (!snapshot) {
        return sendError(res, 404, "No snapshot available", req.requestId);
      }

      const response: ApiSuccessResponse = {
        ok: true,
        data: {
          snapshot
        }
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/history", async (req, res, next) => {
    try {
      const limitRaw = Array.isArray(req.query.limit)
        ? req.query.limit[0]
        : req.query.limit;
      const limitParsed = Number(limitRaw || 30);
      const limit = Number.isNaN(limitParsed)
        ? 30
        : Math.min(Math.max(limitParsed, 1), 100);

      const snapshots = await prisma.snapshot.findMany({
        where: { userId: req.user!.id },
        orderBy: { createdAt: "desc" },
        take: limit
      });

      const items = snapshots.map((snapshot) => ({
        date: snapshot.createdAt.toISOString(),
        life_stability_score: snapshot.lifeStabilityScore,
        flags: snapshot.flags
      }));

      const response: ApiSuccessResponse = {
        ok: true,
        data: {
          items
        }
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/scenario-packs", async (req, res, next) => {
    try {
      const profile = await requireOnboardedProfile(req, res);
      if (!profile) {
        return;
      }

      const packs = await prisma.scenarioPack.findMany({
        where: { userId: req.user!.id },
        include: { _count: { select: { scenarios: true } } },
        orderBy: { updatedAt: "desc" }
      });

      const response: ApiSuccessResponse = {
        ok: true,
        data: {
          packs: packs.map((pack) => ({
            id: pack.id,
            name: pack.name,
            updated_at: pack.updatedAt.toISOString(),
            scenarios_count: pack._count.scenarios
          }))
        }
      };

      const parsed = ScenarioPackListResponseSchema.safeParse(response);
      if (!parsed.success) {
        logger.error(
          { issues: parsed.error.issues },
          "Scenario pack list response invalid"
        );
      }

      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/scenario-packs/:id", async (req, res, next) => {
    try {
      const profile = await requireOnboardedProfile(req, res);
      if (!profile) {
        return;
      }

      const pack = await prisma.scenarioPack.findFirst({
        where: { id: req.params.id, userId: req.user!.id },
        include: { scenarios: { orderBy: { createdAt: "asc" } } }
      });

      if (!pack) {
        return sendError(res, 404, "Scenario pack not found", req.requestId);
      }

      const response: ApiSuccessResponse = {
        ok: true,
        data: {
          pack: mapScenarioPack(pack)
        }
      };

      const parsed = ScenarioPackResponseSchema.safeParse(response);
      if (!parsed.success) {
        logger.error(
          { issues: parsed.error.issues },
          "Scenario pack response invalid"
        );
      }

      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/scenario-packs", async (req, res, next) => {
    try {
      const profile = await requireOnboardedProfile(req, res);
      if (!profile) {
        return;
      }

      const parseResult = ScenarioPackRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return sendError(res, 400, "Invalid scenario pack payload", req.requestId);
      }

      if (!scenarioIdsUnique(parseResult.data.scenarios)) {
        return sendError(
          res,
          400,
          "Scenario ids must be unique within a pack",
          req.requestId
        );
      }

      const payload = parseResult.data;

      const pack = await prisma.scenarioPack.create({
        data: {
          userId: req.user!.id,
          orgId: req.orgId!,
          name: payload.name,
          description: payload.description ?? null,
          baselineSource: payload.baseline_source,
          scenarios: {
            create: payload.scenarios.map((scenario) => ({
              scenarioId: scenario.id,
              orgId: req.orgId!,
              type: scenario.type,
              params: scenario.params
            }))
          }
        },
        include: { scenarios: { orderBy: { createdAt: "asc" } } }
      });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          eventType: "SCENARIO_PACK_CREATED",
          metadata: {
            packId: pack.id,
            scenariosCount: payload.scenarios.length
          }
        }
      });

      const response: ApiSuccessResponse = {
        ok: true,
        data: {
          pack: mapScenarioPack(pack)
        }
      };

      const parsed = ScenarioPackResponseSchema.safeParse(response);
      if (!parsed.success) {
        logger.error(
          { issues: parsed.error.issues },
          "Scenario pack create response invalid"
        );
      }

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/scenario-packs/:id", async (req, res, next) => {
    try {
      const profile = await requireOnboardedProfile(req, res);
      if (!profile) {
        return;
      }

      const parseResult = ScenarioPackRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return sendError(res, 400, "Invalid scenario pack payload", req.requestId);
      }

      if (!scenarioIdsUnique(parseResult.data.scenarios)) {
        return sendError(
          res,
          400,
          "Scenario ids must be unique within a pack",
          req.requestId
        );
      }

      const existing = await prisma.scenarioPack.findFirst({
        where: { id: req.params.id, userId: req.user!.id }
      });

      if (!existing) {
        return sendError(res, 404, "Scenario pack not found", req.requestId);
      }

      const payload = parseResult.data;

      const pack = await prisma.$transaction(async (tx) => {
        await tx.scenarioPack.update({
          where: { id: existing.id },
          data: {
            name: payload.name,
            description: payload.description ?? null,
            baselineSource: payload.baseline_source
          }
        });

        await tx.scenario.deleteMany({
          where: { scenarioPackId: existing.id }
        });

        await tx.scenario.createMany({
          data: payload.scenarios.map((scenario) => ({
            scenarioPackId: existing.id,
            scenarioId: scenario.id,
            type: scenario.type,
            params: scenario.params
          }))
        });

        return tx.scenarioPack.findUnique({
          where: { id: existing.id },
          include: { scenarios: { orderBy: { createdAt: "asc" } } }
        });
      });

      if (!pack) {
        return sendError(res, 500, "Scenario pack update failed", req.requestId);
      }

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          eventType: "SCENARIO_PACK_UPDATED",
          metadata: {
            packId: pack.id,
            scenariosCount: payload.scenarios.length
          }
        }
      });

      const response: ApiSuccessResponse = {
        ok: true,
        data: {
          pack: mapScenarioPack(pack)
        }
      };

      const parsed = ScenarioPackResponseSchema.safeParse(response);
      if (!parsed.success) {
        logger.error(
          { issues: parsed.error.issues },
          "Scenario pack update response invalid"
        );
      }

      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/scenario-packs/:id", async (req, res, next) => {
    try {
      const profile = await requireOnboardedProfile(req, res);
      if (!profile) {
        return;
      }

      const pack = await prisma.scenarioPack.findFirst({
        where: { id: req.params.id, userId: req.user!.id }
      });

      if (!pack) {
        return sendError(res, 404, "Scenario pack not found", req.requestId);
      }

      await prisma.scenarioPack.delete({ where: { id: pack.id } });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          eventType: "SCENARIO_PACK_DELETED",
          metadata: {
            packId: pack.id
          }
        }
      });

      const response: ApiSuccessResponse = {
        ok: true,
        data: { deleted: true }
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/simulate", async (req, res, next) => {
    try {
      const parseResult = SimulateRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return sendError(res, 400, "Invalid simulate payload", req.requestId);
      }

      const profile = await requireOnboardedProfile(req, res);
      if (!profile) {
        return;
      }

      const baselineDate = resolveBaselineDate(
        parseResult.data.baseline_date,
        profile.timezone
      );

      const baseline = await buildBaselineInput({
        prisma: prisma,
        userId: req.user!.id,
        profile,
        baselineDate
      });

      let engineOutput: unknown;
      try {
        engineOutput = await runEngine(
          {
            mode: "simulate",
            baseline_input: baseline.baselineInput,
            scenario: parseResult.data.scenario
          },
          req.requestId
        );
      } catch (error) {
        logger.error(
          { request_id: req.requestId, err: error },
          "Simulation engine invocation failed"
        );
        return sendError(res, 502, "Simulation engine failure", req.requestId);
      }

      const resultParsed = SimulationResultSchema.safeParse(engineOutput);
      if (!resultParsed.success) {
        logger.error(
          { issues: resultParsed.error.issues },
          "Simulation output failed schema validation"
        );
        return sendError(res, 502, "Simulation output invalid", req.requestId);
      }

      const result = resultParsed.data;

      await prisma.scenarioRun.create({
        data: {
          userId: req.user!.id,
          orgId: req.orgId!,
          runType: "simulate",
          baselineRef: baseline.baselineRef,
          resultJson: result
        }
      });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          eventType: "SCENARIO_SIMULATED",
          metadata: {
            scenarioId: parseResult.data.scenario.id,
            scenarioType: parseResult.data.scenario.type,
            baselineDate
          }
        }
      });

      const response: ApiSuccessResponse = {
        ok: true,
        data: {
          result
        }
      };

      const parsed = SimulateResponseSchema.safeParse(response);
      if (!parsed.success) {
        logger.error(
          { issues: parsed.error.issues },
          "Simulation response invalid"
        );
      }

      res.json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("baseline_date") || message.includes("check-in")) {
        return sendError(res, 400, message, req.requestId);
      }
      next(error);
    }
  });

  app.post("/api/compare", async (req, res, next) => {
    try {
      const parseResult = CompareRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return sendError(res, 400, "Invalid compare payload", req.requestId);
      }

      const profile = await requireOnboardedProfile(req, res);
      if (!profile) {
        return;
      }

      const baselineDate = resolveBaselineDate(
        parseResult.data.baseline_date,
        profile.timezone
      );

      const packId = parseResult.data.pack_id ?? null;
      if (packId) {
        const pack = await prisma.scenarioPack.findFirst({
          where: { id: packId, userId: req.user!.id }
        });
        if (!pack) {
          return sendError(res, 404, "Scenario pack not found", req.requestId);
        }
      }

      const baseline = await buildBaselineInput({
        prisma: prisma,
        userId: req.user!.id,
        profile,
        baselineDate
      });

      let comparisonOutput: unknown;
      try {
        comparisonOutput = await runEngine(
          {
            mode: "compare",
            baseline_input: baseline.baselineInput,
            scenarios: parseResult.data.scenarios
          },
          req.requestId
        );
      } catch (error) {
        logger.error(
          { request_id: req.requestId, err: error },
          "Comparison engine invocation failed"
        );
        return sendError(res, 502, "Comparison engine failure", req.requestId);
      }

      const comparisonParsed = ComparisonResultSchema.safeParse(comparisonOutput);
      if (!comparisonParsed.success) {
        logger.error(
          { issues: comparisonParsed.error.issues },
          "Comparison output failed schema validation"
        );
        return sendError(res, 502, "Comparison output invalid", req.requestId);
      }

      let simulations: Array<ReturnType<typeof SimulationResultSchema.parse>>;
      try {
        const simulationOutputs = await Promise.all(
          parseResult.data.scenarios.map((scenario) =>
            runEngine(
              {
                mode: "simulate",
                baseline_input: baseline.baselineInput,
                scenario
              },
              req.requestId
            )
          )
        );

        simulations = simulationOutputs.map((output) => {
          const parsed = SimulationResultSchema.safeParse(output);
          if (!parsed.success) {
            throw new Error("Simulation output invalid");
          }
          return parsed.data;
        });
      } catch (error) {
        logger.error(
          { request_id: req.requestId, err: error },
          "Simulation engine invocation failed"
        );
        return sendError(res, 502, "Simulation engine failure", req.requestId);
      }

      const comparison = comparisonParsed.data;

      await prisma.scenarioRun.create({
        data: {
          userId: req.user!.id,
          orgId: req.orgId!,
          scenarioPackId: packId,
          runType: "compare",
          baselineRef: baseline.baselineRef,
          resultJson: { comparison, simulations }
        }
      });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          eventType: "SCENARIO_COMPARED",
          metadata: {
            packId,
            scenariosCount: parseResult.data.scenarios.length,
            baselineDate
          }
        }
      });

      const response: ApiSuccessResponse = {
        ok: true,
        data: {
          comparison,
          simulations
        }
      };

      const parsed = CompareResponseSchema.safeParse(response);
      if (!parsed.success) {
        logger.error(
          { issues: parsed.error.issues },
          "Comparison response invalid"
        );
      }

      res.json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("baseline_date") || message.includes("check-in")) {
        return sendError(res, 400, message, req.requestId);
      }
      next(error);
    }
  });

  app.get("/api/connectors/google_calendar/auth-url", async (req, res, next) => {
    try {
      const provider = "google_calendar";
      const { redirectUri } = getGoogleOAuthConfig();
      const stateRecord = await createOAuthState({
        prisma,
        userId: req.user!.id,
        provider
      });

      const url = getConnectorAdapter(provider).getAuthUrl({
        state: stateRecord.state,
        redirectUri,
        scopes: GOOGLE_CALENDAR_SCOPES
      });

      const response: ApiSuccessResponse = {
        ok: true,
        data: {
          url
        }
      };

      const parsed = ConnectorAuthUrlResponseSchema.safeParse(response);
      if (!parsed.success) {
        logger.error(
          { issues: parsed.error.issues },
          "Connector auth-url response invalid"
        );
      }

      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  app.get(
    "/api/connectors/google_calendar/callback",
    async (req, res) => {
      try {
        const provider = "google_calendar";
        const code = getQueryParam(req.query.code as string | string[] | undefined);
        const state = getQueryParam(req.query.state as string | string[] | undefined);

        if (!code || !state) {
          return res.redirect(`${WEB_ORIGIN}/connectors?error=missing_params`);
        }

        const validation = await consumeOAuthState({
          prisma,
          userId: req.user!.id,
          provider,
          state
        });

        if (!validation.ok) {
          return res.redirect(`${WEB_ORIGIN}/connectors?error=invalid_state`);
        }

        const { redirectUri } = getGoogleOAuthConfig();
        const tokens = await getConnectorAdapter(provider).handleOAuthCallback({
          code,
          redirectUri
        });

        const connector = await prisma.connector.upsert({
          where: { userId_provider: { userId: req.user!.id, provider } },
          update: {
            status: "connected",
          },
          create: {
            userId: req.user!.id,
            orgId: req.orgId!,
            provider,
            status: "connected",
          }
        });

        const existingTokens = getConnectorTokens(connector);
        const refreshToken =
          tokens.refresh_token ?? existingTokens.refresh_token ?? null;
        const fallbackScopes =
          existingTokens.scopes && existingTokens.scopes.length > 0
            ? existingTokens.scopes
            : GOOGLE_CALENDAR_SCOPES;
        const scopes = tokens.scopes ?? fallbackScopes;

        await setConnectorTokens({
          prisma,
          connectorId: connector.id,
          tokens: {
            access_token: tokens.access_token,
            refresh_token: refreshToken,
            token_expires_at: tokens.expires_at ?? null,
            scopes
          }
        });

        await prisma.auditLog.create({
          data: {
            userId: req.user!.id,
            eventType: "CONNECTOR_CONNECTED",
            metadata: { provider }
          }
        });

        return res.redirect(`${WEB_ORIGIN}/connectors?connected=google_calendar`);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "OAuth callback failed";
        logger.error({ err: message }, "Connector OAuth callback failed");
        return res.redirect(`${WEB_ORIGIN}/connectors?error=callback_failed`);
      }
    }
  );

  app.get("/api/connectors", async (req, res, next) => {
    try {
      const connectors = await prisma.connector.findMany({
        where: { userId: req.user!.id },
        orderBy: { provider: "asc" }
      });

      const response: ApiSuccessResponse = {
        ok: true,
        data: {
          connectors: connectors.map((connector) => ({
            provider: connector.provider,
            status: connector.status,
            last_synced_at: connector.lastSyncedAt
              ? connector.lastSyncedAt.toISOString()
              : null,
            last_error: connector.lastError
          }))
        }
      };

      const parsed = ConnectorsResponseSchema.safeParse(response);
      if (!parsed.success) {
        logger.error(
          { issues: parsed.error.issues },
          "Connectors response invalid"
        );
      }

      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/connectors/:provider/disconnect", async (req, res, next) => {
    try {
      const provider = parseConnectorProvider(req.params.provider);
      if (!provider) {
        return sendError(res, 400, "Unsupported provider", req.requestId);
      }

      const connector = await prisma.connector.upsert({
        where: { userId_provider: { userId: req.user!.id, provider } },
        update: {
          encryptedAccessToken: null,
          encryptedRefreshToken: null,
          tokenExpiresAt: null,
          scopes: [],
          status: "disconnected",
          lastError: null
        },
        create: {
          userId: req.user!.id,
          orgId: req.orgId!,
          provider,
          status: "disconnected",
        }
      });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          eventType: "CONNECTOR_DISCONNECTED",
          metadata: { provider }
        }
      });

      const response: ApiSuccessResponse = {
        ok: true,
        data: {
          connector: {
            provider: connector.provider,
            status: connector.status,
            last_synced_at: connector.lastSyncedAt
              ? connector.lastSyncedAt.toISOString()
              : null,
            last_error: connector.lastError
          }
        }
      };

      const parsed = ConnectorDisconnectResponseSchema.safeParse(response);
      if (!parsed.success) {
        logger.error(
          { issues: parsed.error.issues },
          "Connector disconnect response invalid"
        );
      }

      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/connectors/:provider/sync", async (req, res, next) => {
    try {
      const provider = parseConnectorProvider(req.params.provider);
      if (!provider) {
        return sendError(res, 400, "Unsupported provider", req.requestId);
      }

      await prisma.connector.upsert({
        where: { userId_provider: { userId: req.user!.id, provider } },
        update: {},
        create: {
          userId: req.user!.id,
          orgId: req.orgId!,
          provider,
          status: "disconnected",
        }
      });

      const queue = getConnectorSyncQueue();
      const job = await queue.add(
        "connector-sync",
        { userId: req.user!.id, provider },
        { removeOnComplete: true, removeOnFail: true }
      );
      const jobId = job?.id ? String(job.id) : "queued";

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          eventType: "CONNECTOR_SYNC_REQUESTED",
          metadata: { provider, jobId }
        }
      });

      const response: ApiSuccessResponse = {
        ok: true,
        data: {
          job_id: jobId
        }
      };

      const parsed = ConnectorSyncResponseSchema.safeParse(response);
      if (!parsed.success) {
        logger.error(
          { issues: parsed.error.issues },
          "Connector sync response invalid"
        );
      }

      res.status(202).json(response);
    } catch (error) {
      next(error);
    }
  });

  // ==========================================================================
  // ORG MANAGEMENT ENDPOINTS
  // ==========================================================================

  app.get("/api/orgs", requireOrgAccess(prisma), async (req, res, next) => {
    try {
      const memberships = await prisma.membership.findMany({
        where: {
          userId: req.user!.id,
          status: "active"
        },
        include: {
          org: {
            include: {
              _count: {
                select: { memberships: true }
              }
            }
          }
        },
        orderBy: {
          org: { createdAt: "asc" }
        }
      });

      const orgs = memberships.map((m) => ({
        id: m.org.id,
        name: m.org.name,
        org_type: m.org.type,
        my_role: m.role,
        member_count: m.org._count.memberships,
        created_at: m.org.createdAt.toISOString()
      }));

      res.json({ ok: true, data: { orgs } });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/orgs", requireOrgAccess(prisma), async (req, res, next) => {
    try {
      const name = req.body?.name;
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return sendError(res, 400, "Organization name is required", req.requestId);
      }

      const org = await prisma.organization.create({
        data: {
          name: name.trim(),
          type: "team",
          memberships: {
            create: {
              userId: req.user!.id,
              role: "owner",
              status: "active"
            }
          }
        },
        include: {
          _count: {
            select: { memberships: true }
          }
        }
      });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          eventType: "ORG_CREATED",
          metadata: { org_id: org.id, org_name: org.name }
        }
      });

      res.status(201).json({
        ok: true,
        data: {
          org: {
            id: org.id,
            name: org.name,
            org_type: org.type,
            my_role: "owner",
            member_count: org._count.memberships,
            created_at: org.createdAt.toISOString()
          }
        }
      });
    } catch (error) {
      next(error);
    }
  });

  app.post(
    "/api/orgs/:orgId/invite",
    requireOrgAccess(prisma),
    requireRole("admin"),
    async (req, res, next) => {
      try {
        const orgId = req.params.orgId;
        const email = normalizeEmail(req.body?.email);
        const role = req.body?.role;

        if (!email) {
          return sendError(res, 400, "Email is required", req.requestId);
        }

        if (!role || !["member", "coach", "viewer"].includes(role)) {
          return sendError(
            res,
            400,
            "Role must be member, coach, or viewer",
            req.requestId
          );
        }

        // Verify org matches active org
        if (orgId !== req.orgId) {
          return sendError(res, 403, "Access denied to organization", req.requestId);
        }

        // Find target user
        const targetUser = await prisma.user.findUnique({ where: { email } });
        if (!targetUser) {
          return sendError(res, 404, "User not found", req.requestId);
        }

        // Check if already a member
        const existing = await prisma.membership.findFirst({
          where: {
            orgId,
            userId: targetUser.id,
            status: { in: ["active", "invited"] }
          }
        });

        if (existing) {
          return sendError(res, 409, "User already has access", req.requestId);
        }

        // Create membership
        const membership = await prisma.membership.create({
          data: {
            orgId,
            userId: targetUser.id,
            role,
            status: "active"
          },
          include: {
            user: true
          }
        });

        await prisma.auditLog.create({
          data: {
            userId: req.user!.id,
            eventType: "MEMBER_INVITED",
            metadata: {
              org_id: orgId,
              invited_user_id: targetUser.id,
              role
            }
          }
        });

        res.status(201).json({
          ok: true,
          data: {
            member: {
              user_id: membership.userId,
              email: membership.user.email,
              role: membership.role,
              status: membership.status,
              joined_at: membership.createdAt.toISOString()
            }
          }
        });
      } catch (error) {
        next(error);
      }
    }
  );

  app.get(
    "/api/orgs/:orgId/members",
    requireOrgAccess(prisma),
    async (req, res, next) => {
      try {
        const orgId = req.params.orgId;

        if (orgId !== req.orgId) {
          return sendError(res, 403, "Access denied to organization", req.requestId);
        }

        const memberships = await prisma.membership.findMany({
          where: {
            orgId,
            status: { in: ["active", "invited"] }
          },
          include: {
            user: true
          },
          orderBy: {
            createdAt: "asc"
          }
        });

        const members = memberships.map((m) => ({
          user_id: m.userId,
          email: m.user.email,
          role: m.role,
          status: m.status,
          joined_at: m.createdAt.toISOString()
        }));

        res.json({ ok: true, data: { members } });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/api/orgs/:orgId/members/:userId/role",
    requireOrgAccess(prisma),
    requireRole("admin"),
    async (req, res, next) => {
      try {
        const orgId = req.params.orgId;
        const userId = req.params.userId;
        const newRole = req.body?.role;

        if (orgId !== req.orgId) {
          return sendError(res, 403, "Access denied to organization", req.requestId);
        }

        if (
          !newRole ||
          !["owner", "admin", "member", "coach", "viewer"].includes(newRole)
        ) {
          return sendError(res, 400, "Invalid role", req.requestId);
        }

        // Can't change own role
        if (userId === req.user!.id) {
          return sendError(res, 400, "Cannot change your own role", req.requestId);
        }

        // Only owner can assign owner/admin roles
        if (
          (newRole === "owner" || newRole === "admin") &&
          req.orgRole !== "owner"
        ) {
          return sendError(
            res,
            403,
            "Only owners can assign owner/admin roles",
            req.requestId
          );
        }

        const membership = await prisma.membership.findFirst({
          where: {
            orgId,
            userId,
            status: "active"
          }
        });

        if (!membership) {
          return sendError(res, 404, "Member not found", req.requestId);
        }

        const updated = await prisma.membership.update({
          where: { id: membership.id },
          data: { role: newRole },
          include: { user: true }
        });

        await prisma.auditLog.create({
          data: {
            userId: req.user!.id,
            eventType: "MEMBER_ROLE_CHANGED",
            metadata: {
              org_id: orgId,
              target_user_id: userId,
              old_role: membership.role,
              new_role: newRole
            }
          }
        });

        res.json({
          ok: true,
          data: {
            member: {
              user_id: updated.userId,
              email: updated.user.email,
              role: updated.role,
              status: updated.status,
              joined_at: updated.createdAt.toISOString()
            }
          }
        });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/api/orgs/:orgId/members/:userId/revoke",
    requireOrgAccess(prisma),
    requireRole("admin"),
    async (req, res, next) => {
      try {
        const orgId = req.params.orgId;
        const userId = req.params.userId;

        if (orgId !== req.orgId) {
          return sendError(res, 403, "Access denied to organization", req.requestId);
        }

        // Can't revoke own membership
        if (userId === req.user!.id) {
          return sendError(res, 400, "Cannot revoke your own membership", req.requestId);
        }

        const membership = await prisma.membership.findFirst({
          where: {
            orgId,
            userId,
            status: "active"
          }
        });

        if (!membership) {
          return sendError(res, 404, "Member not found", req.requestId);
        }

        await prisma.membership.update({
          where: { id: membership.id },
          data: { status: "revoked" }
        });

        // Revoke all consents involving this user
        await prisma.sharingConsent.updateMany({
          where: {
            orgId,
            OR: [{ ownerUserId: userId }, { viewerUserId: userId }],
            status: "active"
          },
          data: {
            status: "revoked",
            revokedAt: new Date()
          }
        });

        await prisma.auditLog.create({
          data: {
            userId: req.user!.id,
            eventType: "MEMBER_REVOKED",
            metadata: {
              org_id: orgId,
              revoked_user_id: userId,
              role: membership.role
            }
          }
        });

        res.json({ ok: true, data: { revoked: true } });
      } catch (error) {
        next(error);
      }
    }
  );

  // ==========================================================================
  // CONSENT MANAGEMENT ENDPOINTS
  // ==========================================================================

  app.get(
    "/api/sharing/consents",
    requireOrgAccess(prisma),
    async (req, res, next) => {
      try {
        const consents = await prisma.sharingConsent.findMany({
          where: {
            orgId: req.orgId,
            ownerUserId: req.user!.id,
            status: "active"
          },
          include: {
            viewer: true
          },
          orderBy: {
            createdAt: "desc"
          }
        });

        const items = consents.map((c) => ({
          id: c.id,
          org_id: c.orgId,
          owner_user_id: c.ownerUserId,
          viewer_user_id: c.viewerUserId,
          viewer_email: c.viewer.email,
          scope: c.scope,
          status: c.status,
          created_at: c.createdAt.toISOString(),
          revoked_at: c.revokedAt?.toISOString() || null
        }));

        res.json({ ok: true, data: { consents: items } });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/api/sharing/grant",
    requireOrgAccess(prisma),
    async (req, res, next) => {
      try {
        const viewerUserId = req.body?.viewer_user_id;
        const scope = req.body?.scope;

        if (!viewerUserId || typeof viewerUserId !== "string") {
          return sendError(res, 400, "viewer_user_id is required", req.requestId);
        }

        const validScopes = [
          "weekly_summary_only",
          "daily_scores_only",
          "daily_scores_and_flags",
          "daily_plan_redacted",
          "scenario_reports_redacted",
          "insights_metrics_only"
        ];

        if (!scope || !validScopes.includes(scope)) {
          return sendError(res, 400, "Invalid scope", req.requestId);
        }

        // Verify viewer is active member of org
        const viewerMembership = await prisma.membership.findFirst({
          where: {
            orgId: req.orgId,
            userId: viewerUserId,
            status: "active"
          }
        });

        if (!viewerMembership) {
          return sendError(res, 404, "Viewer is not a member of this org", req.requestId);
        }

        // Can't grant to self
        if (viewerUserId === req.user!.id) {
          return sendError(res, 400, "Cannot grant consent to yourself", req.requestId);
        }

        // Upsert consent
        const consent = await prisma.sharingConsent.upsert({
          where: {
            orgId_ownerUserId_viewerUserId_scope: {
              orgId: req.orgId!,
              ownerUserId: req.user!.id,
              viewerUserId,
              scope
            }
          },
          update: {
            status: "active",
            revokedAt: null
          },
          create: {
            orgId: req.orgId!,
            ownerUserId: req.user!.id,
            viewerUserId,
            scope,
            status: "active"
          },
          include: {
            viewer: true
          }
        });

        await prisma.auditLog.create({
          data: {
            userId: req.user!.id,
            eventType: "CONSENT_GRANTED",
            metadata: {
              org_id: req.orgId,
              viewer_user_id: viewerUserId,
              scope
            }
          }
        });

        res.json({
          ok: true,
          data: {
            consent: {
              id: consent.id,
              org_id: consent.orgId,
              owner_user_id: consent.ownerUserId,
              viewer_user_id: consent.viewerUserId,
              viewer_email: consent.viewer.email,
              scope: consent.scope,
              status: consent.status,
              created_at: consent.createdAt.toISOString(),
              revoked_at: consent.revokedAt?.toISOString() || null
            }
          }
        });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/api/sharing/revoke",
    requireOrgAccess(prisma),
    async (req, res, next) => {
      try {
        const viewerUserId = req.body?.viewer_user_id;
        const scope = req.body?.scope;

        if (!viewerUserId || typeof viewerUserId !== "string") {
          return sendError(res, 400, "viewer_user_id is required", req.requestId);
        }

        if (!scope || typeof scope !== "string") {
          return sendError(res, 400, "scope is required", req.requestId);
        }

        const consent = await prisma.sharingConsent.findUnique({
          where: {
            orgId_ownerUserId_viewerUserId_scope: {
              orgId: req.orgId!,
              ownerUserId: req.user!.id,
              viewerUserId,
              scope: scope as import("@prisma/client").ConsentScope
            }
          }
        });

        if (!consent) {
          return sendError(res, 404, "Consent not found", req.requestId);
        }

        await prisma.sharingConsent.update({
          where: { id: consent.id },
          data: {
            status: "revoked",
            revokedAt: new Date()
          }
        });

        await prisma.auditLog.create({
          data: {
            userId: req.user!.id,
            eventType: "CONSENT_REVOKED",
            metadata: {
              org_id: req.orgId,
              viewer_user_id: viewerUserId,
              scope
            }
          }
        });

        res.json({ ok: true, data: { revoked: true } });
      } catch (error) {
        next(error);
      }
    }
  );

  // ==========================================================================
  // SHARED DATA ACCESS ENDPOINTS (VIEWER)
  // ==========================================================================

  app.get(
    "/api/shared/users",
    requireOrgAccess(prisma),
    async (req, res, next) => {
      try {
        // Find all users who granted this user any active consent
        const consents = await prisma.sharingConsent.findMany({
          where: {
            orgId: req.orgId,
            viewerUserId: req.user!.id,
            status: "active"
          },
          include: {
            owner: true
          },
          distinct: ["ownerUserId"]
        });

        const owners = consents.map((c) => ({
          user_id: c.ownerUserId,
          email: maskEmail(c.owner.email)
        }));

        // Remove duplicates
        const uniqueOwners = Array.from(
          new Map(owners.map((o) => [o.user_id, o])).values()
        );

        res.json({ ok: true, data: { owners: uniqueOwners } });
      } catch (error) {
        next(error);
      }
    }
  );

  app.get(
    "/api/shared/:ownerUserId/weekly/latest",
    requireOrgAccess(prisma),
    async (req, res, next) => {
      try {
        const ownerUserId = req.params.ownerUserId;

        // Check consent
        const hasAccess = await canView(
          prisma,
          ownerUserId,
          req.user!.id,
          req.orgId!,
          "weekly_summary_only"
        );

        if (!hasAccess) {
          return sendError(res, 403, "No consent to view this data", req.requestId);
        }

        // Fetch latest weekly report
        const report = await fetchLatestWeeklyReport({ prisma, userId: ownerUserId });
        if (!report) {
          return sendError(res, 404, "No weekly report found", req.requestId);
        }

        // Redact and return
        const redacted = {
          week_start: report.week_start,
          summary: report.content.summary,
          score_trend: report.content.score_trend,
          top_risks: report.content.top_risks || [],
          next_week_focus: report.content.next_week_focus || []
        };

        // Log access
        await prisma.sharedAccessLog.create({
          data: {
            orgId: req.orgId!,
            ownerUserId,
            viewerUserId: req.user!.id,
            action: "view_weekly",
            metadata: { week_start: redacted.week_start }
          }
        });

        res.json({ ok: true, data: { weekly_report: redacted } });
      } catch (error) {
        next(error);
      }
    }
  );

  app.get(
    "/api/shared/:ownerUserId/history",
    requireOrgAccess(prisma),
    async (req, res, next) => {
      try {
        const ownerUserId = req.params.ownerUserId;

        // Get active scopes
        const scopes = await getActiveScopes(
          prisma,
          ownerUserId,
          req.user!.id,
          req.orgId!
        );

        if (scopes.length === 0) {
          return sendError(res, 403, "No consent to view this data", req.requestId);
        }

        // Check if viewer has access to daily scores
        const canViewScores = scopeIncludes(scopes, "daily_scores_only");
        const canViewFlags = scopeIncludes(scopes, "daily_scores_and_flags");

        if (!canViewScores) {
          return sendError(res, 403, "No consent to view history", req.requestId);
        }

        // Fetch snapshots
        const snapshots = await prisma.snapshot.findMany({
          where: {
            userId: ownerUserId,
            orgId: req.orgId
          },
          orderBy: {
            createdAt: "desc"
          },
          take: 90
        });

        const items = snapshots.map((s) => {
          const output = s.output as any;
          const item: any = {
            date: s.createdAt.toISOString().split("T")[0],
            life_stability_score: s.lifeStabilityScore,
            breakdown: output.breakdown
          };

          if (canViewFlags) {
            item.flags = s.flags;
          }

          return item;
        });

        // Log access
        await prisma.sharedAccessLog.create({
          data: {
            orgId: req.orgId!,
            ownerUserId,
            viewerUserId: req.user!.id,
            action: "view_history",
            metadata: { count: items.length }
          }
        });

        res.json({ ok: true, data: { items } });
      } catch (error) {
        next(error);
      }
    }
  );

  app.get(
    "/api/shared/:ownerUserId/today",
    requireOrgAccess(prisma),
    async (req, res, next) => {
      try {
        const ownerUserId = req.params.ownerUserId;

        // Get active scopes
        const scopes = await getActiveScopes(
          prisma,
          ownerUserId,
          req.user!.id,
          req.orgId!
        );

        if (scopes.length === 0) {
          return sendError(res, 403, "No consent to view this data", req.requestId);
        }

        // Check permissions
        const canViewScores = scopeIncludes(scopes, "daily_scores_only");
        const canViewFlags = scopeIncludes(scopes, "daily_scores_and_flags");
        const canViewPlan = scopeIncludes(scopes, "daily_plan_redacted");

        if (!canViewScores) {
          return sendError(res, 403, "No consent to view today's data", req.requestId);
        }

        // Fetch latest snapshot
        const snapshot = await prisma.snapshot.findFirst({
          where: {
            userId: ownerUserId,
            orgId: req.orgId
          },
          orderBy: {
            createdAt: "desc"
          }
        });

        if (!snapshot) {
          return sendError(res, 404, "No data found", req.requestId);
        }

        const snapshotOutput = snapshot.output as any;
        const today: any = {
          date: snapshot.createdAt.toISOString().split("T")[0],
          life_stability_score: snapshot.lifeStabilityScore,
          breakdown: snapshotOutput.breakdown
        };

        if (canViewFlags) {
          today.flags = snapshot.flags;
        }

        if (canViewPlan) {
          // Redact priorities (remove notes/assumptions)
          if (snapshotOutput.priorities) {
            today.priorities = snapshotOutput.priorities.map((p: any) => ({
              title: p.title,
              category: p.category,
              time_window: p.time_window,
              effort: p.effort,
              impact: p.impact,
              why: redactText(p.why || "")
            }));
          }

          if (snapshotOutput.schedule_plan) {
            today.schedule_plan = snapshotOutput.schedule_plan.map((s: any) => ({
              time_block: s.time_block,
              activity: s.activity,
              category: s.category
            }));
          }
        }

        // Log access
        await prisma.sharedAccessLog.create({
          data: {
            orgId: req.orgId!,
            ownerUserId,
            viewerUserId: req.user!.id,
            action: "view_today",
            metadata: { date: today.date }
          }
        });

        res.json({ ok: true, data: { today } });
      } catch (error) {
        next(error);
      }
    }
  );

  // ==========================================================================
  // ORG AUDIT ENDPOINTS (ADMIN/OWNER)
  // ==========================================================================

  app.get(
    "/api/org/audit",
    requireOrgAccess(prisma),
    requireRole("admin"),
    async (req, res, next) => {
      try {
        const limitRaw = Array.isArray(req.query.limit)
          ? req.query.limit[0]
          : req.query.limit;
        const limitParsed = Number(limitRaw || 200);
        const limit = Number.isNaN(limitParsed)
          ? 200
          : Math.min(Math.max(limitParsed, 1), 200);

        const cursorRaw = Array.isArray(req.query.cursor)
          ? req.query.cursor[0]
          : req.query.cursor;
        const cursor =
          typeof cursorRaw === "string" && cursorRaw.length > 0 ? cursorRaw : undefined;

        // Fetch audit logs for all org members
        const members = await prisma.membership.findMany({
          where: {
            orgId: req.orgId,
            status: "active"
          },
          select: { userId: true }
        });

        const memberIds = members.map((m) => m.userId);

        const auditLogs = await prisma.auditLog.findMany({
          where: {
            userId: { in: memberIds }
          },
          orderBy: { createdAt: "desc" },
          take: limit,
          ...(cursor && { cursor: { id: cursor }, skip: 1 })
        });

        const events = auditLogs.map((log) => ({
          id: log.id,
          event_type: log.eventType,
          created_at: log.createdAt.toISOString(),
          actor_user_id: log.userId,
          metadata_summary: log.metadata
            ? Object.keys(log.metadata).join(", ")
            : null
        }));

        // Log this access
        await prisma.auditLog.create({
          data: {
            userId: req.user!.id,
            eventType: "ORG_AUDIT_VIEWED",
            metadata: { org_id: req.orgId }
          }
        });

        res.json({
          ok: true,
          data: {
            events,
            next_cursor: auditLogs.length === limit ? auditLogs[auditLogs.length - 1].id : null
          }
        });
      } catch (error) {
        next(error);
      }
    }
  );

  app.get(
    "/api/org/access-review",
    requireOrgAccess(prisma),
    requireRole("admin"),
    async (req, res, next) => {
      try {
        // Fetch memberships
        const memberships = await prisma.membership.findMany({
          where: {
            orgId: req.orgId
          },
          include: {
            user: true
          },
          orderBy: {
            createdAt: "asc"
          }
        });

        const members = memberships.map((m) => ({
          user_id: m.userId,
          email: m.user.email,
          role: m.role,
          status: m.status,
          joined_at: m.createdAt.toISOString()
        }));

        // Fetch consents
        const consents = await prisma.sharingConsent.findMany({
          where: {
            orgId: req.orgId
          },
          include: {
            owner: true,
            viewer: true
          },
          orderBy: {
            createdAt: "desc"
          }
        });

        const consentsList = consents.map((c) => ({
          id: c.id,
          owner_user_id: c.ownerUserId,
          owner_email: c.owner.email,
          viewer_user_id: c.viewerUserId,
          viewer_email: c.viewer.email,
          scope: c.scope,
          status: c.status,
          created_at: c.createdAt.toISOString(),
          revoked_at: c.revokedAt?.toISOString() || null
        }));

        res.json({
          ok: true,
          data: {
            memberships: members,
            consents: consentsList
          }
        });
      } catch (error) {
        next(error);
      }
    }
  );

  app.get(
    "/api/org/shared-access-logs",
    requireOrgAccess(prisma),
    requireRole("admin"),
    async (req, res, next) => {
      try {
        const limitRaw = Array.isArray(req.query.limit)
          ? req.query.limit[0]
          : req.query.limit;
        const limitParsed = Number(limitRaw || 200);
        const limit = Number.isNaN(limitParsed)
          ? 200
          : Math.min(Math.max(limitParsed, 1), 200);

        const ownerUserId = Array.isArray(req.query.owner_user_id)
          ? req.query.owner_user_id[0]
          : req.query.owner_user_id;

        const viewerUserId = Array.isArray(req.query.viewer_user_id)
          ? req.query.viewer_user_id[0]
          : req.query.viewer_user_id;

        const where: any = { orgId: req.orgId };
        if (ownerUserId) where.ownerUserId = ownerUserId;
        if (viewerUserId) where.viewerUserId = viewerUserId;

        const logs = await prisma.sharedAccessLog.findMany({
          where,
          include: {
            owner: true,
            viewer: true
          },
          orderBy: {
            createdAt: "desc"
          },
          take: limit
        });

        const items = logs.map((log) => ({
          id: log.id,
          owner_user_id: log.ownerUserId,
          owner_email: log.owner.email,
          viewer_user_id: log.viewerUserId,
          viewer_email: log.viewer.email,
          action: log.action,
          created_at: log.createdAt.toISOString(),
          metadata: log.metadata
        }));

        res.json({ ok: true, data: { logs: items } });
      } catch (error) {
        next(error);
      }
    }
  );

  app.get(
    "/api/org/access-review/export.json",
    requireOrgAccess(prisma),
    requireRole("admin"),
    async (req, res, next) => {
      try {
        // Fetch access review data
        const memberships = await prisma.membership.findMany({
          where: { orgId: req.orgId },
          include: { user: true },
          orderBy: { createdAt: "asc" }
        });

        const consents = await prisma.sharingConsent.findMany({
          where: { orgId: req.orgId },
          include: { owner: true, viewer: true },
          orderBy: { createdAt: "desc" }
        });

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const accessLogs = await prisma.sharedAccessLog.findMany({
          where: {
            orgId: req.orgId,
            createdAt: { gte: thirtyDaysAgo }
          },
          include: { owner: true, viewer: true }
        });

        const org = await prisma.organization.findUnique({
          where: { id: req.orgId }
        });

        const report = {
          generated_at: new Date().toISOString(),
          org: {
            id: org!.id,
            name: org!.name,
            type: org!.type
          },
          memberships: memberships.map((m) => ({
            user_id: m.userId,
            email: m.user.email,
            role: m.role,
            status: m.status,
            joined_at: m.createdAt.toISOString()
          })),
          consents: consents.map((c) => ({
            owner_email: c.owner.email,
            viewer_email: c.viewer.email,
            scope: c.scope,
            status: c.status,
            created_at: c.createdAt.toISOString(),
            revoked_at: c.revokedAt?.toISOString() || null
          })),
          shared_access_summary_last_30_days: {
            total_accesses: accessLogs.length,
            by_action: accessLogs.reduce((acc, log) => {
              acc[log.action] = (acc[log.action] || 0) + 1;
              return acc;
            }, {} as Record<string, number>)
          },
          disclaimer:
            "This report contains metadata only. No personal notes or comments are included."
        };

        await prisma.auditLog.create({
          data: {
            userId: req.user!.id,
            eventType: "ORG_ACCESS_REVIEW_EXPORTED_JSON",
            metadata: { org_id: req.orgId }
          }
        });

        res.setHeader("Content-Type", "application/json");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="access-review-${req.orgId}-${Date.now()}.json"`
        );
        res.json(report);
      } catch (error) {
        next(error);
      }
    }
  );

  app.get(
    "/api/org/access-review/export.pdf",
    requireOrgAccess(prisma),
    requireRole("admin"),
    async (req, res, next) => {
      try {
        // Fetch access review data (same as JSON)
        const memberships = await prisma.membership.findMany({
          where: { orgId: req.orgId },
          include: { user: true },
          orderBy: { createdAt: "asc" }
        });

        const consents = await prisma.sharingConsent.findMany({
          where: { orgId: req.orgId },
          include: { owner: true, viewer: true },
          orderBy: { createdAt: "desc" }
        });

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const accessLogs = await prisma.sharedAccessLog.findMany({
          where: {
            orgId: req.orgId,
            createdAt: { gte: thirtyDaysAgo }
          }
        });

        const auditEvents = await prisma.auditLog.findMany({
          where: {
            userId: { in: memberships.map((m) => m.userId) },
            createdAt: { gte: thirtyDaysAgo }
          }
        });

        const org = await prisma.organization.findUnique({
          where: { id: req.orgId }
        });

        // Build HTML report
        const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Access Review Report</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      max-width: 800px;
      margin: 40px auto;
      padding: 20px;
      color: #333;
    }
    h1 { font-size: 24px; margin-bottom: 8px; }
    h2 { font-size: 18px; margin-top: 32px; margin-bottom: 12px; border-bottom: 2px solid #ddd; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
    th, td { text-align: left; padding: 8px; border-bottom: 1px solid #eee; }
    th { background: #f5f5f5; font-weight: 600; }
    .meta { color: #666; font-size: 13px; margin-bottom: 24px; }
    .disclaimer { background: #fff3cd; border: 1px solid #ffc107; padding: 12px; margin-top: 32px; font-size: 13px; border-radius: 4px; }
    .summary { display: flex; gap: 20px; margin-top: 12px; }
    .summary-card { background: #f9f9f9; padding: 12px; border-radius: 4px; flex: 1; }
    .summary-card strong { display: block; font-size: 24px; margin-bottom: 4px; }
    .summary-card span { color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <h1>Access Review Report</h1>
  <div class="meta">
    <strong>Organization:</strong> ${org!.name}<br>
    <strong>Generated:</strong> ${new Date().toISOString()}<br>
    <strong>Generated By:</strong> ${req.user!.email}
  </div>

  <h2>Members (${memberships.length})</h2>
  <table>
    <thead>
      <tr>
        <th>Email</th>
        <th>Role</th>
        <th>Status</th>
        <th>Joined</th>
      </tr>
    </thead>
    <tbody>
      ${memberships
        .map(
          (m) => `
        <tr>
          <td>${m.user.email}</td>
          <td>${m.role}</td>
          <td>${m.status}</td>
          <td>${m.createdAt.toISOString().split("T")[0]}</td>
        </tr>
      `
        )
        .join("")}
    </tbody>
  </table>

  <h2>Consent Grants (${consents.length})</h2>
  <table>
    <thead>
      <tr>
        <th>Owner</th>
        <th>Viewer</th>
        <th>Scope</th>
        <th>Status</th>
        <th>Created</th>
      </tr>
    </thead>
    <tbody>
      ${consents
        .map(
          (c) => `
        <tr>
          <td>${c.owner.email}</td>
          <td>${c.viewer.email}</td>
          <td>${c.scope}</td>
          <td>${c.status}</td>
          <td>${c.createdAt.toISOString().split("T")[0]}</td>
        </tr>
      `
        )
        .join("")}
    </tbody>
  </table>

  <h2>Activity Summary (Last 30 Days)</h2>
  <div class="summary">
    <div class="summary-card">
      <strong>${accessLogs.length}</strong>
      <span>Shared Data Accesses</span>
    </div>
    <div class="summary-card">
      <strong>${auditEvents.length}</strong>
      <span>Audit Events</span>
    </div>
  </div>

  <div class="disclaimer">
    <strong>Disclaimer:</strong> This report contains metadata only for security and compliance review.
    No personal notes, comments, or free-text user content are included.
    For SOC2 readiness and access control auditing.
  </div>
</body>
</html>
        `;

        const pdf = await renderWeeklyPdf(html);

        await prisma.auditLog.create({
          data: {
            userId: req.user!.id,
            eventType: "ORG_ACCESS_REVIEW_EXPORTED_PDF",
            metadata: { org_id: req.orgId }
          }
        });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="access-review-${req.orgId}-${Date.now()}.pdf"`
        );
        res.send(pdf);
      } catch (error) {
        next(error);
      }
    }
  );

  // ==========================================================================
  // DATA SUBJECT RIGHTS (DSR) ENDPOINTS
  // ==========================================================================

  app.post("/api/privacy/export", requireAuth, async (req, res, next) => {
    try {
      const orgId = req.body?.org_id || null;
      const includeSensitive = req.body?.include_sensitive === true;

      // Determine target org
      let targetOrgId: string;
      if (orgId) {
        // Verify user has access to this org
        const membership = await prisma.membership.findFirst({
          where: {
            userId: req.user!.id,
            orgId,
            status: "active"
          }
        });
        if (!membership) {
          return sendError(res, 403, "Access denied to organization", req.requestId);
        }
        targetOrgId = orgId;
      } else {
        // Find personal org
        const personalMembership = await prisma.membership.findFirst({
          where: {
            userId: req.user!.id,
            status: "active",
            organization: { type: "personal" }
          },
          include: { organization: true }
        });
        if (!personalMembership) {
          return sendError(res, 404, "No personal organization found", req.requestId);
        }
        targetOrgId = personalMembership.orgId;
      }

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          eventType: "DSR_EXPORT_REQUESTED",
          metadata: { org_id: targetOrgId, include_sensitive: includeSensitive }
        }
      });

      // Build export bundle
      const [
        profile,
        personalization,
        checkins,
        snapshots,
        weeklyReports,
        scenarioPacks,
        scenarioRuns,
        auditLogs,
        consentsGranted,
        consentsReceived,
        connectors,
        events
      ] = await Promise.all([
        prisma.profile.findUnique({ where: { userId: req.user!.id } }),
        prisma.personalizationProfile.findFirst({
          where: { userId: req.user!.id, orgId: targetOrgId }
        }),
        prisma.checkin.findMany({
          where: { userId: req.user!.id, orgId: targetOrgId },
          orderBy: { createdAt: "desc" },
          take: 1000
        }),
        prisma.snapshot.findMany({
          where: { userId: req.user!.id, orgId: targetOrgId },
          orderBy: { createdAt: "desc" },
          take: 1000
        }),
        prisma.weeklyReport.findMany({
          where: { userId: req.user!.id, orgId: targetOrgId },
          orderBy: { createdAt: "desc" },
          take: 100
        }),
        prisma.scenarioPack.findMany({
          where: { userId: req.user!.id, orgId: targetOrgId },
          include: { scenarios: true }
        }),
        prisma.scenarioRun.findMany({
          where: { userId: req.user!.id, orgId: targetOrgId },
          orderBy: { createdAt: "desc" },
          take: 500
        }),
        prisma.auditLog.findMany({
          where: { userId: req.user!.id },
          orderBy: { createdAt: "desc" },
          take: 1000
        }),
        prisma.sharingConsent.findMany({
          where: { ownerUserId: req.user!.id, orgId: targetOrgId },
          include: { viewer: { select: { email: true } } }
        }),
        prisma.sharingConsent.findMany({
          where: { viewerUserId: req.user!.id, orgId: targetOrgId },
          include: { owner: { select: { email: true } } }
        }),
        prisma.connector.findMany({
          where: { userId: req.user!.id, orgId: targetOrgId }
        }),
        prisma.event.findMany({
          where: { userId: req.user!.id, orgId: targetOrgId },
          orderBy: { startsAt: "desc" },
          take: 2000
        })
      ]);

      // Strip sensitive fields if not requested
      const processedCheckins = checkins.map((c) => {
        const copy: any = { ...c };
        if (!includeSensitive) {
          delete copy.notes;
        }
        return copy;
      });

      const processedSnapshots = snapshots.map((s) => {
        const copy: any = { ...s };
        const output = copy.output || {};
        if (!includeSensitive) {
          delete output.notes;
          if (output.today?.priorities) {
            output.today.priorities = output.today.priorities.map((p: any) => {
              const { notes, ...rest } = p;
              return rest;
            });
          }
        }
        copy.output = output;
        return copy;
      });

      // Never include connector tokens
      const safeConnectors = connectors.map((c) => ({
        id: c.id,
        provider: c.provider,
        status: c.status,
        lastSyncedAt: c.lastSyncedAt,
        createdAt: c.createdAt
      }));

      // Build export
      const exportData = {
        export_metadata: {
          generated_at: new Date().toISOString(),
          org_id: targetOrgId,
          user_id: req.user!.id,
          include_sensitive: includeSensitive
        },
        profile: profile || null,
        personalization: personalization || null,
        checkins: processedCheckins,
        snapshots: processedSnapshots,
        weekly_reports: weeklyReports,
        scenario_packs: scenarioPacks,
        scenario_runs: scenarioRuns,
        audit_logs: auditLogs.map((a) => ({
          event_type: a.eventType,
          created_at: a.createdAt,
          metadata: a.metadata
        })),
        sharing_consents_granted: consentsGranted.map((c) => ({
          viewer_email: c.viewer.email,
          scope: c.scope,
          status: c.status,
          created_at: c.createdAt,
          revoked_at: c.revokedAt
        })),
        sharing_consents_received: consentsReceived.map((c) => ({
          owner_email: c.owner.email,
          scope: c.scope,
          status: c.status,
          created_at: c.createdAt
        })),
        connectors: safeConnectors,
        events_summary: {
          total_count: events.length,
          busy_blocks: events.filter((e) => e.kind === "calendar_busy_block").length
        }
      };

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          eventType: "DSR_EXPORT_COMPLETED",
          metadata: { org_id: targetOrgId, record_count: checkins.length + snapshots.length }
        }
      });

      const org = await prisma.organization.findUnique({ where: { id: targetOrgId } });
      const filename = `lifeops-export-${org?.name || "data"}-${new Date().toISOString().split("T")[0]}.json`;

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.json(exportData);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/privacy/delete/request", requireAuth, async (req, res, next) => {
    try {
      const orgId = req.body?.org_id || null;

      // If orgId provided, verify access
      let targetOrgId: string | null = null;
      if (orgId) {
        const membership = await prisma.membership.findFirst({
          where: {
            userId: req.user!.id,
            orgId,
            status: "active"
          }
        });
        if (!membership) {
          return sendError(res, 403, "Access denied to organization", req.requestId);
        }
        targetOrgId = orgId;
      }

      // Generate deletion token
      const tokenRaw = randomUUID();
      const tokenHash = createHmac("sha256", getJwtSecret())
        .update(tokenRaw)
        .digest("hex");

      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      await prisma.deletionRequest.create({
        data: {
          userId: req.user!.id,
          orgId: targetOrgId,
          tokenHash,
          expiresAt
        }
      });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          eventType: "DSR_DELETE_REQUESTED",
          metadata: { org_id: targetOrgId }
        }
      });

      // In production, token would be emailed. In dev, return it.
      const isDev = process.env.NODE_ENV !== "production";

      res.json({
        ok: true,
        data: {
          confirm_phrase: "DELETE MY DATA",
          token: isDev ? tokenRaw : undefined,
          expires_in_seconds: 900
        }
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/privacy/delete/confirm", requireAuth, async (req, res, next) => {
    try {
      const token = req.body?.token;
      const phrase = req.body?.confirm_phrase;

      if (!token || phrase !== "DELETE MY DATA") {
        return sendError(res, 400, "Invalid confirmation", req.requestId);
      }

      const tokenHash = createHmac("sha256", getJwtSecret())
        .update(token)
        .digest("hex");

      // Find valid deletion request
      const request = await prisma.deletionRequest.findFirst({
        where: {
          userId: req.user!.id,
          tokenHash,
          expiresAt: { gte: new Date() }
        }
      });

      if (!request) {
        return sendError(res, 404, "Invalid or expired token", req.requestId);
      }

      let scope: string;

      if (!request.orgId) {
        // Delete personal org and potentially account
        const personalOrg = await prisma.membership.findFirst({
          where: {
            userId: req.user!.id,
            status: "active",
            organization: { type: "personal" }
          },
          include: { organization: true }
        });

        if (!personalOrg) {
          return sendError(res, 404, "No personal organization found", req.requestId);
        }

        // Check if user has other org memberships
        const otherMemberships = await prisma.membership.count({
          where: {
            userId: req.user!.id,
            orgId: { not: personalOrg.orgId },
            status: "active"
          }
        });

        // Disconnect connectors first
        await prisma.connector.updateMany({
          where: { userId: req.user!.id, orgId: personalOrg.orgId },
          data: { status: "disconnected", encryptedAccessToken: null, encryptedRefreshToken: null }
        });

        // Delete all org-scoped data (cascades will handle related records)
        await prisma.organization.delete({ where: { id: personalOrg.orgId } });

        if (otherMemberships === 0) {
          // Delete entire account
          await prisma.user.delete({ where: { id: req.user!.id } });
          scope = "account_deleted";
        } else {
          scope = "personal_org_deleted";
        }
      } else {
        // Leave team org and delete user data in that org
        const membership = await prisma.membership.findFirst({
          where: {
            userId: req.user!.id,
            orgId: request.orgId,
            status: "active"
          }
        });

        if (!membership) {
          return sendError(res, 404, "Membership not found", req.requestId);
        }

        // Disconnect connectors
        await prisma.connector.updateMany({
          where: { userId: req.user!.id, orgId: request.orgId },
          data: { status: "disconnected", encryptedAccessToken: null, encryptedRefreshToken: null }
        });

        // Revoke consents
        await prisma.sharingConsent.updateMany({
          where: {
            orgId: request.orgId,
            OR: [{ ownerUserId: req.user!.id }, { viewerUserId: req.user!.id }]
          },
          data: { status: "revoked", revokedAt: new Date() }
        });

        // Delete user data in this org
        await prisma.$transaction([
          prisma.actionFeedback.deleteMany({ where: { userId: req.user!.id, orgId: request.orgId } }),
          prisma.personalizationProfile.deleteMany({ where: { userId: req.user!.id, orgId: request.orgId } }),
          prisma.scenarioRun.deleteMany({ where: { userId: req.user!.id, orgId: request.orgId } }),
          prisma.scenario.deleteMany({ where: { userId: req.user!.id, orgId: request.orgId } }),
          prisma.scenarioPack.deleteMany({ where: { userId: req.user!.id, orgId: request.orgId } }),
          prisma.weeklyReport.deleteMany({ where: { userId: req.user!.id, orgId: request.orgId } }),
          prisma.event.deleteMany({ where: { userId: req.user!.id, orgId: request.orgId } }),
          prisma.connectorRun.deleteMany({ where: { userId: req.user!.id, orgId: request.orgId } }),
          prisma.connector.deleteMany({ where: { userId: req.user!.id, orgId: request.orgId } }),
          prisma.snapshot.deleteMany({ where: { userId: req.user!.id, orgId: request.orgId } }),
          prisma.checkin.deleteMany({ where: { userId: req.user!.id, orgId: request.orgId } })
        ]);

        // Remove membership
        await prisma.membership.update({
          where: { id: membership.id },
          data: { status: "revoked" }
        });

        scope = "left_team_org_deleted_user_data";
      }

      // Clean up deletion request
      await prisma.deletionRequest.delete({ where: { id: request.id } });

      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          eventType: "DSR_DELETE_COMPLETED",
          metadata: { scope, org_id: request.orgId }
        }
      });

      res.json({ ok: true, data: { success: true, scope } });
    } catch (error) {
      next(error);
    }
  });

  // ==========================================================================
  // RETENTION POLICY ENDPOINTS
  // ==========================================================================

  app.get(
    "/api/org/retention",
    requireOrgAccess(prisma),
    async (req, res, next) => {
      try {
        let policy = await prisma.dataRetentionPolicy.findUnique({
          where: { orgId: req.orgId }
        });

        if (!policy) {
          // Create default policy
          policy = await prisma.dataRetentionPolicy.create({
            data: { orgId: req.orgId! }
          });
        }

        res.json({
          ok: true,
          data: {
            policy: {
              retention_days_snapshots: policy.retentionDaysSnapshots,
              retention_days_audit: policy.retentionDaysAudit,
              retention_days_access_logs: policy.retentionDaysAccessLogs,
              retention_days_feedback: policy.retentionDaysFeedback,
              updated_at: policy.updatedAt.toISOString()
            }
          }
        });
      } catch (error) {
        next(error);
      }
    }
  );

  app.put(
    "/api/org/retention",
    requireOrgAccess(prisma),
    requireRole("admin"),
    async (req, res, next) => {
      try {
        const {
          retention_days_snapshots,
          retention_days_audit,
          retention_days_access_logs,
          retention_days_feedback
        } = req.body;

        const updates: any = {};
        if (typeof retention_days_snapshots === "number" && retention_days_snapshots >= 30) {
          updates.retentionDaysSnapshots = retention_days_snapshots;
        }
        if (typeof retention_days_audit === "number" && retention_days_audit >= 365) {
          updates.retentionDaysAudit = retention_days_audit;
        }
        if (typeof retention_days_access_logs === "number" && retention_days_access_logs >= 90) {
          updates.retentionDaysAccessLogs = retention_days_access_logs;
        }
        if (typeof retention_days_feedback === "number" && retention_days_feedback >= 30) {
          updates.retentionDaysFeedback = retention_days_feedback;
        }

        if (Object.keys(updates).length === 0) {
          return sendError(res, 400, "No valid updates provided", req.requestId);
        }

        const policy = await prisma.dataRetentionPolicy.upsert({
          where: { orgId: req.orgId! },
          create: { orgId: req.orgId!, ...updates },
          update: updates
        });

        res.json({
          ok: true,
          data: {
            policy: {
              retention_days_snapshots: policy.retentionDaysSnapshots,
              retention_days_audit: policy.retentionDaysAudit,
              retention_days_access_logs: policy.retentionDaysAccessLogs,
              retention_days_feedback: policy.retentionDaysFeedback,
              updated_at: policy.updatedAt.toISOString()
            }
          }
        });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/api/org/retention/purge",
    requireOrgAccess(prisma),
    requireRole("admin"),
    async (req, res, next) => {
      try {
        let policy = await prisma.dataRetentionPolicy.findUnique({
          where: { orgId: req.orgId }
        });

        if (!policy) {
          policy = await prisma.dataRetentionPolicy.create({
            data: { orgId: req.orgId! }
          });
        }

        const now = new Date();
        const snapshotCutoff = new Date(now.getTime() - policy.retentionDaysSnapshots * 24 * 60 * 60 * 1000);
        const accessLogCutoff = new Date(now.getTime() - policy.retentionDaysAccessLogs * 24 * 60 * 60 * 1000);
        const feedbackCutoff = new Date(now.getTime() - policy.retentionDaysFeedback * 24 * 60 * 60 * 1000);

        try {
          const [deletedSnapshots, deletedAccessLogs, deletedFeedback] = await prisma.$transaction([
            prisma.snapshot.deleteMany({
              where: {
                orgId: req.orgId,
                createdAt: { lt: snapshotCutoff }
              }
            }),
            prisma.sharedAccessLog.deleteMany({
              where: {
                orgId: req.orgId,
                createdAt: { lt: accessLogCutoff }
              }
            }),
            prisma.actionFeedback.deleteMany({
              where: {
                orgId: req.orgId,
                createdAt: { lt: feedbackCutoff }
              }
            })
          ]);

          await prisma.auditLog.create({
            data: {
              userId: req.user!.id,
              eventType: "RETENTION_PURGE_RUN",
              metadata: {
                org_id: req.orgId,
                deleted_snapshots: deletedSnapshots.count,
                deleted_access_logs: deletedAccessLogs.count,
                deleted_feedback: deletedFeedback.count
              }
            }
          });

          res.json({
            ok: true,
            data: {
              purged: {
                snapshots: deletedSnapshots.count,
                access_logs: deletedAccessLogs.count,
                feedback: deletedFeedback.count
              }
            }
          });
        } catch (purgeError: any) {
          // Emit monitoring event for purge failure
          await emitMonitoringEvent(
            "RETENTION_PURGE_FAILURE",
            {
              error: purgeError.message,
              org_id: req.orgId
            },
            req.orgId!,
            req.user!.id
          );
          throw purgeError;
        }
      } catch (error) {
        next(error);
      }
    }
  );

  app.get("/api/audit", async (req, res, next) => {
    try {
      const limitRaw = Array.isArray(req.query.limit)
        ? req.query.limit[0]
        : req.query.limit;
      const limitParsed = Number(limitRaw || 100);
      const limit = Number.isNaN(limitParsed)
        ? 100
        : Math.min(Math.max(limitParsed, 1), 200);

      const auditLogs = await prisma.auditLog.findMany({
        where: { userId: req.user!.id },
        orderBy: { createdAt: "desc" },
        take: limit
      });

      const events = auditLogs.map(toAuditEvent);

      const response: ApiSuccessResponse = {
        ok: true,
        data: {
          events
        }
      };

      const parsed = AuditResponseSchema.safeParse(response);
      if (!parsed.success) {
        logger.error(
          { issues: parsed.error.issues },
          "Audit response invalid"
        );
      }

      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  // ==================== ACCESS REVIEW ENDPOINTS (SOC2) ====================
  
  app.post(
    "/api/org/access-reviews/create",
    requireOrgAccess,
    requireRole("admin"),
    async (req, res, next) => {
      try {
        const { period_start, period_end } = req.body;

        if (!period_start || !period_end) {
          return sendError(res, 400, "period_start and period_end required", req.requestId);
        }

        const periodStart = new Date(period_start);
        const periodEnd = new Date(period_end);

        if (periodEnd <= periodStart) {
          return sendError(res, 400, "period_end must be after period_start", req.requestId);
        }

        // Generate evidence snapshot (access review data)
        const consents = await prisma.sharingConsent.findMany({
          where: { orgId: req.orgId! },
          include: { owner: true, viewer: true }
        });

        const accessLogs = await prisma.sharedAccessLog.findMany({
          where: {
            orgId: req.orgId!,
            accessedAt: { gte: periodStart, lte: periodEnd }
          },
          include: { owner: true, viewer: true }
        });

        const evidenceSnapshot = {
          consents: consents.map((c) => ({
            owner_email: c.owner.email,
            viewer_email: c.viewer.email,
            scope: c.scope,
            status: c.status,
            created_at: c.createdAt.toISOString()
          })),
          access_logs: accessLogs.map((log) => ({
            owner_email: log.owner.email,
            viewer_email: log.viewer.email,
            action: log.action,
            accessed_at: log.accessedAt.toISOString()
          })),
          period_start: periodStart.toISOString(),
          period_end: periodEnd.toISOString()
        };

        // Hash the evidence for integrity
        const evidenceHash = createHmac("sha256", getJwtSecret())
          .update(JSON.stringify(evidenceSnapshot))
          .digest("hex");

        const record = await prisma.accessReviewRecord.create({
          data: {
            orgId: req.orgId!,
            reviewerUserId: req.user!.id,
            periodStart,
            periodEnd,
            status: "created",
            evidenceHash
          },
          include: { reviewer: true }
        });

        await prisma.auditLog.create({
          data: {
            userId: req.user!.id,
            orgId: req.orgId!,
            eventType: "ACCESS_REVIEW_CREATED",
            metadata: {
              review_id: record.id,
              period_start: periodStart.toISOString(),
              period_end: periodEnd.toISOString()
            }
          }
        });

        const response: ApiSuccessResponse = {
          ok: true,
          data: {
            review: {
              id: record.id,
              reviewer_email: record.reviewer.email,
              period_start: record.periodStart.toISOString(),
              period_end: record.periodEnd.toISOString(),
              status: record.status,
              created_at: record.createdAt.toISOString()
            }
          }
        };

        res.json(response);
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/api/org/access-reviews/:id/complete",
    requireOrgAccess,
    requireRole("admin"),
    async (req, res, next) => {
      try {
        const { id } = req.params;
        const { confirm } = req.body;

        if (!confirm) {
          return sendError(res, 400, "confirm field required", req.requestId);
        }

        const existing = await prisma.accessReviewRecord.findFirst({
          where: { id, orgId: req.orgId! }
        });

        if (!existing) {
          return sendError(res, 404, "Access review not found", req.requestId);
        }

        if (existing.status === "completed") {
          return sendError(res, 400, "Access review already completed", req.requestId);
        }

        // Generate completion snapshot
        const consents = await prisma.sharingConsent.findMany({
          where: { orgId: req.orgId! },
          include: { owner: true, viewer: true }
        });

        const completionSnapshot = {
          consents: consents.map((c) => ({
            owner_email: c.owner.email,
            viewer_email: c.viewer.email,
            scope: c.scope,
            status: c.status
          })),
          completed_at: new Date().toISOString()
        };

        const completionHash = createHmac("sha256", getJwtSecret())
          .update(JSON.stringify(completionSnapshot))
          .digest("hex");

        const updated = await prisma.accessReviewRecord.update({
          where: { id },
          data: {
            status: "completed",
            completedAt: new Date(),
            completionHash
          },
          include: { reviewer: true }
        });

        await prisma.auditLog.create({
          data: {
            userId: req.user!.id,
            orgId: req.orgId!,
            eventType: "ACCESS_REVIEW_COMPLETED",
            metadata: { review_id: id }
          }
        });

        const response: ApiSuccessResponse = {
          ok: true,
          data: {
            review: {
              id: updated.id,
              reviewer_email: updated.reviewer.email,
              period_start: updated.periodStart.toISOString(),
              period_end: updated.periodEnd.toISOString(),
              status: updated.status,
              completed_at: updated.completedAt?.toISOString() || null
            }
          }
        };

        res.json(response);
      } catch (error) {
        next(error);
      }
    }
  );

  app.get(
    "/api/org/access-reviews",
    requireOrgAccess,
    requireRole("admin"),
    async (req, res, next) => {
      try {
        const reviews = await prisma.accessReviewRecord.findMany({
          where: { orgId: req.orgId! },
          include: { reviewer: true },
          orderBy: { createdAt: "desc" }
        });

        const response: ApiSuccessResponse = {
          ok: true,
          data: {
            reviews: reviews.map((r) => ({
              id: r.id,
              reviewer_email: r.reviewer.email,
              period_start: r.periodStart.toISOString(),
              period_end: r.periodEnd.toISOString(),
              status: r.status,
              created_at: r.createdAt.toISOString(),
              completed_at: r.completedAt?.toISOString() || null
            }))
          }
        };

        res.json(response);
      } catch (error) {
        next(error);
      }
    }
  );

  app.get(
    "/api/org/access-reviews/:id/evidence.pdf",
    requireOrgAccess,
    requireRole("admin"),
    async (req, res, next) => {
      try {
        const { id } = req.params;

        const review = await prisma.accessReviewRecord.findFirst({
          where: { id, orgId: req.orgId! },
          include: { reviewer: true, org: true }
        });

        if (!review) {
          return sendError(res, 404, "Access review not found", req.requestId);
        }

        // Fetch evidence data
        const consents = await prisma.sharingConsent.findMany({
          where: { orgId: req.orgId! },
          include: { owner: true, viewer: true },
          orderBy: { createdAt: "desc" }
        });

        const accessLogs = await prisma.sharedAccessLog.findMany({
          where: {
            orgId: req.orgId!,
            accessedAt: { gte: review.periodStart, lte: review.periodEnd }
          },
          include: { owner: true, viewer: true },
          orderBy: { accessedAt: "desc" }
        });

        // Generate PDF
        const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Access Review Evidence - ${review.org.name}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    h1 { color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 10px; }
    h2 { color: #1e40af; margin-top: 30px; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      font-size: 12px;
    }
    th, td {
      text-align: left;
      padding: 10px;
      border: 1px solid #ddd;
    }
    th {
      background-color: #f3f4f6;
      font-weight: 600;
    }
    .meta {
      background: #f9fafb;
      padding: 15px;
      border-radius: 5px;
      margin: 20px 0;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      margin: 5px 0;
    }
    .hash {
      font-family: monospace;
      font-size: 10px;
      word-break: break-all;
      color: #6b7280;
    }
    .disclaimer {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 15px;
      margin-top: 30px;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <h1>Access Review Evidence</h1>
  
  <div class="meta">
    <div class="meta-row">
      <strong>Organization:</strong>
      <span>${review.org.name}</span>
    </div>
    <div class="meta-row">
      <strong>Review Period:</strong>
      <span>${review.periodStart.toISOString().split("T")[0]} to ${review.periodEnd.toISOString().split("T")[0]}</span>
    </div>
    <div class="meta-row">
      <strong>Reviewer:</strong>
      <span>${review.reviewer.email}</span>
    </div>
    <div class="meta-row">
      <strong>Status:</strong>
      <span>${review.status}</span>
    </div>
    <div class="meta-row">
      <strong>Created:</strong>
      <span>${review.createdAt.toISOString()}</span>
    </div>
    ${
      review.completedAt
        ? `<div class="meta-row">
      <strong>Completed:</strong>
      <span>${review.completedAt.toISOString()}</span>
    </div>`
        : ""
    }
    <div class="meta-row">
      <strong>Evidence Hash:</strong>
      <span class="hash">${review.evidenceHash}</span>
    </div>
    ${
      review.completionHash
        ? `<div class="meta-row">
      <strong>Completion Hash:</strong>
      <span class="hash">${review.completionHash}</span>
    </div>`
        : ""
    }
  </div>

  <h2>Sharing Consents</h2>
  <table>
    <thead>
      <tr>
        <th>Data Owner</th>
        <th>Viewer</th>
        <th>Scope</th>
        <th>Status</th>
        <th>Created</th>
      </tr>
    </thead>
    <tbody>
      ${consents
        .map(
          (c) => `
        <tr>
          <td>${c.owner.email}</td>
          <td>${c.viewer.email}</td>
          <td>${c.scope}</td>
          <td>${c.status}</td>
          <td>${c.createdAt.toISOString().split("T")[0]}</td>
        </tr>
      `
        )
        .join("")}
    </tbody>
  </table>

  <h2>Access Log (Review Period)</h2>
  <table>
    <thead>
      <tr>
        <th>Data Owner</th>
        <th>Viewer</th>
        <th>Action</th>
        <th>Timestamp</th>
      </tr>
    </thead>
    <tbody>
      ${accessLogs
        .map(
          (log) => `
        <tr>
          <td>${log.owner.email}</td>
          <td>${log.viewer.email}</td>
          <td>${log.action}</td>
          <td>${log.accessedAt.toISOString()}</td>
        </tr>
      `
        )
        .join("")}
    </tbody>
  </table>

  <div class="disclaimer">
    <strong>SOC2 Compliance Notice:</strong> This evidence report contains metadata only for access control review.
    No personal notes, comments, or sensitive user content are included.
    Evidence integrity is verified via SHA256 hashes.
  </div>
</body>
</html>
        `;

        const pdf = await renderWeeklyPdf(html);

        await prisma.auditLog.create({
          data: {
            userId: req.user!.id,
            orgId: req.orgId!,
            eventType: "ACCESS_REVIEW_EVIDENCE_EXPORTED",
            metadata: { review_id: id }
          }
        });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="access-review-${review.org.name.replace(/\s+/g, "-")}-${review.periodStart.toISOString().split("T")[0]}.pdf"`
        );
        res.send(pdf);
      } catch (error) {
        next(error);
      }
    }
  );

  // ==================== MONITORING ENDPOINTS (SOC2) ====================
  
  app.get(
    "/api/org/monitoring",
    requireOrgAccess,
    requireRole("admin"),
    async (req, res, next) => {
      try {
        const limit = parseInt(req.query.limit as string) || 50;

        const events = await prisma.monitoringEvent.findMany({
          where: { orgId: req.orgId! },
          include: { user: true },
          orderBy: { createdAt: "desc" },
          take: limit
        });

        const response: ApiSuccessResponse = {
          ok: true,
          data: {
            events: events.map((e) => ({
              id: e.id,
              event_type: e.eventType,
              user_email: e.user?.email || null,
              metadata: e.metadata ? JSON.parse(e.metadata) : null,
              created_at: e.createdAt.toISOString()
            }))
          }
        };

        res.json(response);
      } catch (error) {
        next(error);
      }
    }
  );

  app.use((req, res) => {
    sendError(res, 404, "Not found", req.requestId);
  });

  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    logger.error(
      {
        request_id: req.requestId,
        err: {
          name: err.name,
          message: err.message,
          stack: err.stack
        }
      },
      "Unhandled error"
    );

    sendError(res, 500, "Internal server error", req.requestId);
  });

  return app;
}

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return sendError(res, 401, "Unauthorized", req.requestId);
    }
    req.user = user;
    return next();
  } catch (error) {
    return next(error as Error);
  }
}

async function getUserFromRequest(req: Request) {
  const token = getTokenFromCookies(req.headers.cookie);
  if (!token) {
    return null;
  }

  const payload = verifyToken(token);
  if (!payload) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub }
  });

  if (!user) {
    return null;
  }

  return { id: user.id, email: user.email };
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function validatePassword(password: string): string | null {
  if (password.length < 8) {
    return "Use at least 8 characters";
  }
  if (!/[0-9]/.test(password)) {
    return "Include at least one number";
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return "Include at least one symbol";
  }
  return null;
}

function normalizeProfileInput(input: ProfileInput) {
  const domains = Array.from(
    new Set(input.compliance_domains.map((domain) => domain.trim()).filter(Boolean))
  );
  return {
    ...input,
    compliance_domains: domains.length > 0 ? domains : ["bills", "visa/legal"],
    max_daily_focus_blocks: Math.round(input.max_daily_focus_blocks)
  };
}

function isProfileComplete(input: ProfileInput): boolean {
  return (
    Boolean(input.timezone) &&
    Boolean(input.wake_window_start) &&
    Boolean(input.wake_window_end) &&
    Boolean(input.sleep_window_start) &&
    Boolean(input.sleep_window_end) &&
    Boolean(input.work_pattern) &&
    Boolean(input.priority_bias) &&
    input.max_daily_focus_blocks >= 1 &&
    input.compliance_domains.length > 0
  );
}

async function requireOnboardedProfile(
  req: Request,
  res: Response
): Promise<Profile | null> {
  const profile = await prisma.profile.findUnique({
    where: { userId: req.user!.id }
  });

  if (!profile || !profile.onboarding_completed_at) {
    sendError(
      res,
      400,
      "Complete onboarding before using scenarios",
      req.requestId
    );
    return null;
  }

  return profile;
}

function buildProfileContext(profile: Profile) {
  return {
    timezone: profile.timezone,
    wake_window_start: profile.wake_window_start,
    wake_window_end: profile.wake_window_end,
    sleep_window_start: profile.sleep_window_start,
    sleep_window_end: profile.sleep_window_end,
    work_pattern: profile.work_pattern,
    max_daily_focus_blocks: profile.max_daily_focus_blocks,
    priority_bias: profile.priority_bias,
    compliance_domains: profile.compliance_domains
  };
}

function mapScenarioPack(pack: ScenarioPackWithScenarios) {
  return {
    id: pack.id,
    name: pack.name,
    description: pack.description ?? null,
    baseline_source: pack.baselineSource,
    scenarios: pack.scenarios.map((scenario) => ({
      id: scenario.scenarioId,
      type: scenario.type,
      params: scenario.params
    })),
    created_at: pack.createdAt.toISOString(),
    updated_at: pack.updatedAt.toISOString()
  };
}

function scenarioIdsUnique(
  scenarios: Array<{ id: string }>
): boolean {
  const seen = new Set<string>();
  for (const scenario of scenarios) {
    if (seen.has(scenario.id)) {
      return false;
    }
    seen.add(scenario.id);
  }
  return true;
}

async function buildBaselineInput({
  prisma: prismaClient,
  userId,
  profile,
  baselineDate
}: {
  prisma: PrismaClient;
  userId: string;
  profile: Profile;
  baselineDate: string;
}) {
  const checkin = await prismaClient.checkin.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" }
  });

  if (!checkin || !checkin.payload || typeof checkin.payload !== "object") {
    throw new Error("No check-in available for baseline");
  }

  const scheduleContext = await buildScheduleContext(
    prismaClient,
    userId,
    profile.timezone,
    baselineDate
  );

  return {
    baselineInput: {
      checkin: checkin.payload,
      profile_context: buildProfileContext(profile),
      schedule: scheduleContext.schedule
    },
    baselineRef: {
      checkin_id: checkin.id,
      profile_id: profile.id,
      baseline_date: baselineDate,
      checkin_created_at: checkin.createdAt.toISOString()
    }
  };
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function resolveBaselineDate(
  value: string | undefined,
  timeZone: string
): string {
  if (!value) {
    return getDateStringInTimeZone(new Date(), timeZone);
  }
  if (!DATE_PATTERN.test(value)) {
    throw new Error("baseline_date must be YYYY-MM-DD");
  }
  return value;
}

function extractWeekStart(req: Request, res: Response): string | null {
  const raw = Array.isArray(req.query.weekStart)
    ? req.query.weekStart[0]
    : req.query.weekStart;
  if (!raw || typeof raw !== "string") {
    sendError(res, 400, "weekStart query is required", req.requestId);
    return null;
  }
  try {
    parseWeekStart(raw);
  } catch (error) {
    sendError(res, 400, (error as Error).message, req.requestId);
    return null;
  }
  return raw;
}

function parseConnectorProvider(value: string | undefined) {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (isConnectorProvider(normalized)) {
    return normalized;
  }
  return null;
}

function getQueryParam(value: string | string[] | undefined) {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value[0];
  }
  return null;
}

async function buildScheduleContext(
  prismaClient: PrismaClient,
  userId: string,
  timezone: string,
  baselineDate?: string
) {
  const { startUtc, endUtc } = baselineDate
    ? getDateBoundsUtc(timezone, baselineDate)
    : getTodayBoundsUtc(timezone);
  const busyEvents = await prismaClient.event.findMany({
    where: {
      userId,
      kind: "calendar_busy_block",
      startTs: { lt: endUtc },
      endTs: { gt: startUtc }
    },
    orderBy: { startTs: "asc" }
  });

  const busy_blocks = busyEvents.map((event) => ({
    start_ts: event.startTs.toISOString(),
    end_ts: event.endTs.toISOString()
  }));

  return {
    schedule: {
      timezone,
      busy_blocks
    },
    hasBusyBlocks: busy_blocks.length > 0
  };
}

function getTodayBoundsUtc(timeZone: string, reference = new Date()) {
  const dateParts = getZonedDateParts(reference, timeZone);
  const nextDateParts = addDays(dateParts, 1);

  const startUtc = zonedTimeToUtc(
    { ...dateParts, hour: 0, minute: 0, second: 0 },
    timeZone
  );
  const endUtc = zonedTimeToUtc(
    { ...nextDateParts, hour: 0, minute: 0, second: 0 },
    timeZone
  );

  return { startUtc, endUtc };
}

function getDateBoundsUtc(timeZone: string, dateString: string) {
  const dateParts = parseDateParts(dateString);
  const nextDateParts = addDays(dateParts, 1);

  const startUtc = zonedTimeToUtc(
    { ...dateParts, hour: 0, minute: 0, second: 0 },
    timeZone
  );
  const endUtc = zonedTimeToUtc(
    { ...nextDateParts, hour: 0, minute: 0, second: 0 },
    timeZone
  );

  return { startUtc, endUtc };
}

function getZonedDateParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(date);
  const lookup: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      lookup[part.type] = part.value;
    }
  }
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day)
  };
}

function parseDateParts(dateString: string) {
  if (!DATE_PATTERN.test(dateString)) {
    throw new Error("baseline_date must be YYYY-MM-DD");
  }
  const [yearRaw, monthRaw, dayRaw] = dateString.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    throw new Error("baseline_date must be YYYY-MM-DD");
  }
  return { year, month, day };
}

function getDateStringInTimeZone(date: Date, timeZone: string) {
  const parts = getZonedDateParts(date, timeZone);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(
    2,
    "0"
  )}-${String(parts.day).padStart(2, "0")}`;
}

function addDays(
  parts: { year: number; month: number; day: number },
  days: number
) {
  const base = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  base.setUTCDate(base.getUTCDate() + days);
  return {
    year: base.getUTCFullYear(),
    month: base.getUTCMonth() + 1,
    day: base.getUTCDate()
  };
}

function zonedTimeToUtc(
  parts: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  },
  timeZone: string
) {
  const guess = new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    )
  );
  const offset = getTimeZoneOffset(guess, timeZone);
  const utc = new Date(guess.getTime() - offset * 60 * 1000);
  const offsetSecondPass = getTimeZoneOffset(utc, timeZone);
  if (offsetSecondPass !== offset) {
    return new Date(guess.getTime() - offsetSecondPass * 60 * 1000);
  }
  return utc;
}

function getTimeZoneOffset(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const parts = formatter.formatToParts(date);
  const lookup: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      lookup[part.type] = part.value;
    }
  }
  const iso = `${lookup.year}-${lookup.month}-${lookup.day}T${lookup.hour}:${lookup.minute}:${lookup.second}Z`;
  const zoned = new Date(iso);
  return (zoned.getTime() - date.getTime()) / 60000;
}

function sendError(
  res: Response,
  status: number,
  message: string,
  requestId?: string
) {
  const response: ApiErrorResponse = {
    ok: false,
    error: {
      message,
      request_id: requestId
    }
  };
  res.status(status).json(response);
}

function runEngine(input: unknown, requestId?: string): Promise<unknown> {
  const entrypoint = process.env.ENGINE_ENTRYPOINT;
  const pythonPath = process.env.ENGINE_PYTHON_PATH || "python3";
  const timeoutEnv = Number(process.env.ENGINE_TIMEOUT_MS || 5000);
  const timeoutMs = Number.isFinite(timeoutEnv) ? timeoutEnv : 5000;

  if (!entrypoint) {
    throw new Error("ENGINE_ENTRYPOINT is not set");
  }

  return new Promise((resolve, reject) => {
    const child = spawn(pythonPath, [entrypoint], {
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Engine timeout"));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        logger.error(
          { request_id: requestId, code, stderr },
          "Engine process failed"
        );
        reject(new Error("Engine failed"));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        logger.error(
          { request_id: requestId, stdout, stderr },
          "Engine output parse error"
        );
        reject(new Error("Engine output invalid"));
      }
    });

    child.stdin.write(JSON.stringify(input));
    child.stdin.end();
  });
}
