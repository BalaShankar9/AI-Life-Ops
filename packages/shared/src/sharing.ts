import { z } from "zod";

export const ConsentScopeSchema = z.enum([
  "weekly_summary_only",
  "daily_scores_only",
  "daily_scores_and_flags",
  "daily_plan_redacted",
  "scenario_reports_redacted",
  "insights_metrics_only"
]);
export type ConsentScope = z.infer<typeof ConsentScopeSchema>;

export const ConsentStatusSchema = z.enum(["active", "revoked"]);
export type ConsentStatus = z.infer<typeof ConsentStatusSchema>;

export const SharedAccessActionSchema = z.enum([
  "view_weekly",
  "view_today",
  "view_history",
  "view_scenarios",
  "view_insights"
]);
export type SharedAccessAction = z.infer<typeof SharedAccessActionSchema>;

export const SharingConsentSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  ownerUserId: z.string(),
  viewerUserId: z.string(),
  scope: ConsentScopeSchema,
  status: ConsentStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  revokedAt: z.string().nullable()
}).strict();
export type SharingConsent = z.infer<typeof SharingConsentSchema>;

export const SharedAccessLogSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  ownerUserId: z.string(),
  viewerUserId: z.string(),
  action: SharedAccessActionSchema,
  metadata: z.record(z.unknown()).nullable(),
  createdAt: z.string()
}).strict();
export type SharedAccessLog = z.infer<typeof SharedAccessLogSchema>;

// Scope descriptions for UI
export const SCOPE_DESCRIPTIONS: Record<ConsentScope, string> = {
  weekly_summary_only: "Weekly reports only: summary, score trends, top risks, next week focus",
  daily_scores_only: "Daily life stability scores and breakdown (energy/money/obligations/growth/stability)",
  daily_scores_and_flags: "Daily scores + risk flags (burnout, financial, compliance, overload)",
  daily_plan_redacted: "Daily plan with priorities (redacted: no personal notes/assumptions)",
  scenario_reports_redacted: "Scenario simulation reports (redacted: no personal assumptions)",
  insights_metrics_only: "Evaluation insights summary metrics only"
};

// Redacted weekly report (safe for sharing)
export const RedactedWeeklyReportSchema = z.object({
  weekStart: z.string(),
  weekEnd: z.string(),
  summary: z.string(),
  scoreTrend: z.string(),
  breakdownTrends: z.record(z.string()),
  topRisks: z.array(z.string()),
  nextWeekFocus: z.array(z.string()),
  confidence: z.string()
}).strict();
export type RedactedWeeklyReport = z.infer<typeof RedactedWeeklyReportSchema>;

// Redacted history item
export const RedactedHistoryItemSchema = z.object({
  date: z.string(),
  lifeStabilityScore: z.number().int().min(0).max(100),
  breakdown: z.object({
    energy: z.number(),
    money: z.number(),
    obligations: z.number(),
    growth: z.number(),
    stability: z.number()
  }).strict().optional(),
  flags: z.object({
    burnout_risk: z.string(),
    financial_risk: z.string(),
    compliance_risk: z.string(),
    overload_risk: z.string()
  }).strict().optional()
}).strict();
export type RedactedHistoryItem = z.infer<typeof RedactedHistoryItemSchema>;

// Redacted today snapshot
export const RedactedPrioritySchema = z.object({
  title: z.string(),
  category: z.string(),
  timeEstimateMin: z.number(),
  effort: z.number(),
  impact: z.number(),
  why: z.string() // Generic explanation, personal references removed
}).strict();

export const RedactedTodaySchema = z.object({
  date: z.string(),
  lifeStabilityScore: z.number().int().min(0).max(100),
  breakdown: z.object({
    energy: z.number(),
    money: z.number(),
    obligations: z.number(),
    growth: z.number(),
    stability: z.number()
  }).strict(),
  flags: z.object({
    burnout_risk: z.string(),
    financial_risk: z.string(),
    compliance_risk: z.string(),
    overload_risk: z.string()
  }).strict().optional(),
  priorities: z.array(RedactedPrioritySchema).optional(),
  schedulePlan: z.array(z.object({
    startTs: z.string(),
    endTs: z.string(),
    durationMin: z.number(),
    category: z.string()
  }).strict()).optional()
}).strict();
export type RedactedToday = z.infer<typeof RedactedTodaySchema>;

// Shared owner summary (for viewer's list)
export const SharedOwnerSchema = z.object({
  ownerUserId: z.string(),
  ownerEmailMasked: z.string(),
  scopes: z.array(ConsentScopeSchema)
}).strict();
export type SharedOwner = z.infer<typeof SharedOwnerSchema>;
