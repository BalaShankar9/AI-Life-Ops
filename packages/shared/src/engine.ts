import { z } from "zod";

export const RiskLevelSchema = z.enum(["low", "medium", "high"]);

export const FlagsSchema = z
  .object({
    burnout_risk: RiskLevelSchema,
    financial_risk: RiskLevelSchema,
    compliance_risk: RiskLevelSchema,
    overload_risk: RiskLevelSchema,
    crisis_risk: RiskLevelSchema
  })
  .strict();

export const BreakdownSchema = z
  .object({
    energy: z.number().int().min(0).max(20),
    money: z.number().int().min(0).max(20),
    obligations: z.number().int().min(0).max(20),
    growth: z.number().int().min(0).max(20),
    stability: z.number().int().min(0).max(20)
  })
  .strict();

export const PriorityItemSchema = z
  .object({
    title: z.string().min(1),
    category: z.string().min(1),
    time_estimate_min: z.number().int().min(1),
    effort: z.number().int().min(1).max(5),
    impact: z.number().int().min(1).max(5),
    why: z.string().min(1),
    assumptions: z.array(z.string()),
    variability: z.array(z.string())
  })
  .strict();

export const SchedulePlanItemSchema = z
  .object({
    title: z.string().min(1),
    start_ts: z.string().min(1),
    end_ts: z.string().min(1),
    duration_min: z.number().int().min(1),
    category: z.string().min(1),
    why_this_time: z.string().min(1)
  })
  .strict();

export const FreeTimeSummarySchema = z
  .object({
    total_free_min: z.number().int().min(0),
    largest_window_min: z.number().int().min(0),
    windows_count: z.number().int().min(0)
  })
  .strict();

export const EngineOutputSchema = z
  .object({
    life_stability_score: z.number().int().min(0).max(100),
    breakdown: BreakdownSchema,
    confidence: z.number().min(0).max(1),
    confidence_reasons: z.array(z.string()),
    data_quality_warnings: z.array(z.string()),
    flags: FlagsSchema,
    priorities: z.array(PriorityItemSchema).max(3),
    avoid_today: z.array(z.string()),
    next_best_actions: z.array(z.string()),
    reasoning: z.string(),
    used_context: z.array(z.string()),
    assumptions: z.array(z.string()),
    variability_notes: z.array(z.string()),
    safety_notice: z.string().nullable(),
    schedule_plan: z.array(SchedulePlanItemSchema),
    schedule_conflicts: z.array(z.string()),
    free_time_summary: FreeTimeSummarySchema
  })
  .strict();

export type PriorityItem = z.infer<typeof PriorityItemSchema>;
export type SchedulePlanItem = z.infer<typeof SchedulePlanItemSchema>;
export type FreeTimeSummary = z.infer<typeof FreeTimeSummarySchema>;
export type EngineOutput = z.infer<typeof EngineOutputSchema>;
export type RiskLevel = z.infer<typeof RiskLevelSchema>;
export type Flags = z.infer<typeof FlagsSchema>;
export type Breakdown = z.infer<typeof BreakdownSchema>;
