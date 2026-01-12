import { z } from "zod";

export const WeekRangeSchema = z
  .object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  })
  .strict();

export const TrendSchema = z
  .object({
    start: z.number().int(),
    end: z.number().int(),
    delta: z.number().int()
  })
  .strict();

export const ScoreTrendSchema = z
  .object({
    start_score: z.number().int(),
    end_score: z.number().int(),
    delta: z.number().int()
  })
  .strict();

export const BreakdownTrendsSchema = z
  .object({
    energy: TrendSchema,
    money: TrendSchema,
    obligations: TrendSchema,
    growth: TrendSchema,
    stability: TrendSchema
  })
  .strict();

export const FlagKeySchema = z.enum([
  "burnout_risk",
  "financial_risk",
  "compliance_risk",
  "overload_risk"
]);

export const TopRiskSchema = z
  .object({
    flag: FlagKeySchema,
    frequency: z.number().int().min(0),
    why_it_matters: z.string().min(1)
  })
  .strict();

export const FocusItemSchema = z
  .object({
    title: z.string().min(1),
    why: z.string().min(1),
    target: z.string().min(1)
  })
  .strict();

export const WeeklyReviewSchema = z
  .object({
    week_range: WeekRangeSchema,
    summary: z.string().min(1),
    score_trend: ScoreTrendSchema,
    breakdown_trends: BreakdownTrendsSchema,
    top_risks: z.array(TopRiskSchema),
    wins: z.array(z.string()),
    misses: z.array(z.string()),
    most_effective_actions: z.array(z.string()),
    recurring_bottlenecks: z.array(z.string()),
    next_week_focus: z.array(FocusItemSchema).max(3),
    confidence: z.number().min(0).max(1),
    confidence_reasons: z.array(z.string()),
    variability_notes: z.array(z.string()),
    assumptions: z.array(z.string())
  })
  .strict();

export type WeekRange = z.infer<typeof WeekRangeSchema>;
export type Trend = z.infer<typeof TrendSchema>;
export type ScoreTrend = z.infer<typeof ScoreTrendSchema>;
export type BreakdownTrends = z.infer<typeof BreakdownTrendsSchema>;
export type TopRisk = z.infer<typeof TopRiskSchema>;
export type FocusItem = z.infer<typeof FocusItemSchema>;
export type WeeklyReview = z.infer<typeof WeeklyReviewSchema>;
