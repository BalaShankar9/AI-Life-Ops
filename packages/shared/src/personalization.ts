import { z } from "zod";

export const FocusPreferenceSchema = z.enum([
  "deep_work",
  "mixed",
  "light_tasks"
]);

export const FeedbackTypeSchema = z.enum([
  "helped",
  "neutral",
  "did_not_help"
]);

export const WeightsSchema = z
  .object({
    energy: z.number().min(0).max(1),
    money: z.number().min(0).max(1),
    obligations: z.number().min(0).max(1),
    growth: z.number().min(0).max(1),
    stability: z.number().min(0).max(1)
  })
  .strict()
  .refine(
    (weights) => {
      const sum =
        weights.energy +
        weights.money +
        weights.obligations +
        weights.growth +
        weights.stability;
      return sum >= 0.95 && sum <= 1.05;
    },
    { message: "Weights must sum to approximately 1 (0.95-1.05)" }
  );

export const PersonalizationProfileSchema = z
  .object({
    weights: WeightsSchema,
    risk_aversion: z.number().min(0).max(1),
    focus_preference: FocusPreferenceSchema
  })
  .strict();

export const PersonalizationProfileInputSchema = z
  .object({
    weights: WeightsSchema,
    risk_aversion: z.number().min(0).max(1),
    focus_preference: FocusPreferenceSchema
  })
  .strict();

export const ActionFeedbackInputSchema = z
  .object({
    snapshot_id: z.string().min(1),
    action_title: z.string().min(1).max(200),
    action_category: z.string().min(1).max(50),
    scheduled: z.boolean(),
    feedback: FeedbackTypeSchema,
    perceived_effort: z.number().int().min(1).max(5).optional(),
    perceived_impact: z.number().int().min(1).max(5).optional(),
    comment: z.string().max(500).optional()
  })
  .strict();

export const ActionFeedbackSchema = ActionFeedbackInputSchema.extend({
  id: z.string(),
  user_id: z.string(),
  created_at: z.string()
});

export const RecalibrationProposalSchema = z
  .object({
    proposed_weights: WeightsSchema,
    reasons: z.array(z.string()),
    confidence: z.number().min(0).max(1),
    feedback_count: z.number().int().min(0),
    changes: z.array(
      z
        .object({
          dimension: z.string(),
          old_weight: z.number(),
          new_weight: z.number(),
          reason: z.string()
        })
        .strict()
    )
  })
  .strict();

export type FocusPreference = z.infer<typeof FocusPreferenceSchema>;
export type FeedbackType = z.infer<typeof FeedbackTypeSchema>;
export type Weights = z.infer<typeof WeightsSchema>;
export type PersonalizationProfile = z.infer<
  typeof PersonalizationProfileSchema
>;
export type PersonalizationProfileInput = z.infer<
  typeof PersonalizationProfileInputSchema
>;
export type ActionFeedbackInput = z.infer<typeof ActionFeedbackInputSchema>;
export type ActionFeedback = z.infer<typeof ActionFeedbackSchema>;
export type RecalibrationProposal = z.infer<
  typeof RecalibrationProposalSchema
>;
