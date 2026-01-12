import { z } from "zod";

export const WorkPatternSchema = z.enum([
  "day",
  "night",
  "mixed",
  "unemployed"
]);

export const PriorityBiasSchema = z.enum([
  "stability_first",
  "income_first",
  "growth_first"
]);

export const TimeStringSchema = z
  .string()
  .regex(/^\d{2}:\d{2}$/, "Use HH:MM 24h format");

export const TimezoneSchema = z
  .string()
  .min(1)
  .regex(/^(UTC|[A-Za-z_]+\/[A-Za-z_]+)$/, "Use a valid IANA timezone");

export const ProfileInputSchema = z
  .object({
    timezone: TimezoneSchema,
    wake_window_start: TimeStringSchema,
    wake_window_end: TimeStringSchema,
    sleep_window_start: TimeStringSchema,
    sleep_window_end: TimeStringSchema,
    work_pattern: WorkPatternSchema,
    max_daily_focus_blocks: z.number().int().min(1).max(4).default(2),
    priority_bias: PriorityBiasSchema.default("stability_first"),
    compliance_domains: z
      .array(z.string().min(1))
      .max(10)
      .default(["bills", "visa/legal"])
  })
  .strict();

export const ProfileSchema = ProfileInputSchema.extend({
  onboarding_completed_at: z.string().datetime().nullable()
});

export const OnboardingStatusSchema = z
  .object({
    completed: z.boolean()
  })
  .strict();

export type ProfileInput = z.infer<typeof ProfileInputSchema>;
export type Profile = z.infer<typeof ProfileSchema>;
export type WorkPattern = z.infer<typeof WorkPatternSchema>;
export type PriorityBias = z.infer<typeof PriorityBiasSchema>;
export type OnboardingStatus = z.infer<typeof OnboardingStatusSchema>;
