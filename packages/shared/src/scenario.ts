import { z } from "zod";

import { BreakdownSchema, FlagsSchema, PriorityItemSchema } from "./engine";

export const ScenarioTypeSchema = z.enum([
  "add_job",
  "drop_job",
  "increase_expense",
  "reduce_expense",
  "add_recurring_obligation",
  "remove_recurring_obligation",
  "sleep_schedule_change",
  "commute_change",
  "study_plan"
]);

export const ShiftTypeSchema = z.enum(["day", "night", "mixed"]);

export const AddJobParamsSchema = z
  .object({
    hours_per_week: z.number().min(0).max(80),
    shift_type: ShiftTypeSchema,
    commute_min_per_day: z.number().min(0).max(180),
    pay_per_month: z.number().min(0).max(20000)
  })
  .strict();

export const DropJobParamsSchema = AddJobParamsSchema;

export const ExpenseParamsSchema = z
  .object({
    amount_per_month: z.number().min(0).max(20000),
    category: z.string().min(1)
  })
  .strict();

export const RecurringObligationParamsSchema = z
  .object({
    hours_per_week: z.number().min(0).max(40),
    deadline_pressure: z.number().int().min(1).max(10)
  })
  .strict();

export const SleepScheduleParamsSchema = z
  .object({
    sleep_hours_delta: z.number().min(-4).max(4),
    bedtime_shift_min: z.number().min(-240).max(240)
  })
  .strict();

export const CommuteChangeParamsSchema = z
  .object({
    delta_min_per_day: z.number().min(-120).max(120),
    days_per_week: z.number().int().min(0).max(7)
  })
  .strict();

export const StudyPlanParamsSchema = z
  .object({
    hours_per_week: z.number().min(0).max(30),
    intensity: z.number().int().min(1).max(3),
    deadline_pressure: z.number().int().min(1).max(10)
  })
  .strict();

export const ScenarioSchema = z.discriminatedUnion("type", [
  z
    .object({
      id: z.string().min(1),
      type: z.literal("add_job"),
      params: AddJobParamsSchema
    })
    .strict(),
  z
    .object({
      id: z.string().min(1),
      type: z.literal("drop_job"),
      params: DropJobParamsSchema
    })
    .strict(),
  z
    .object({
      id: z.string().min(1),
      type: z.literal("increase_expense"),
      params: ExpenseParamsSchema
    })
    .strict(),
  z
    .object({
      id: z.string().min(1),
      type: z.literal("reduce_expense"),
      params: ExpenseParamsSchema
    })
    .strict(),
  z
    .object({
      id: z.string().min(1),
      type: z.literal("add_recurring_obligation"),
      params: RecurringObligationParamsSchema
    })
    .strict(),
  z
    .object({
      id: z.string().min(1),
      type: z.literal("remove_recurring_obligation"),
      params: RecurringObligationParamsSchema
    })
    .strict(),
  z
    .object({
      id: z.string().min(1),
      type: z.literal("sleep_schedule_change"),
      params: SleepScheduleParamsSchema
    })
    .strict(),
  z
    .object({
      id: z.string().min(1),
      type: z.literal("commute_change"),
      params: CommuteChangeParamsSchema
    })
    .strict(),
  z
    .object({
      id: z.string().min(1),
      type: z.literal("study_plan"),
      params: StudyPlanParamsSchema
    })
    .strict()
]);

export const BaselineSourceSchema = z.enum([
  "latest_checkin",
  "custom_checkin"
]);

export const ScenarioPackInputSchema = z
  .object({
    name: z.string().min(1).max(80),
    description: z.string().max(400).nullable().optional(),
    baseline_source: BaselineSourceSchema,
    scenarios: z.array(ScenarioSchema).max(6)
  })
  .strict();

export const ScenarioPackSchema = ScenarioPackInputSchema.extend({
  id: z.string(),
  created_at: z.string(),
  updated_at: z.string()
});

export const ScenarioPackListItemSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    updated_at: z.string(),
    scenarios_count: z.number().int().min(0)
  })
  .strict();

export const RiskFlagKeySchema = z.enum([
  "burnout_risk",
  "financial_risk",
  "compliance_risk",
  "overload_risk"
]);

export const RiskChangeSchema = z
  .object({
    flag: RiskFlagKeySchema,
    from: z.string(),
    to: z.string(),
    why: z.string()
  })
  .strict();

export const BreakdownDeltaSchema = z
  .object({
    energy: z.number().int(),
    money: z.number().int(),
    obligations: z.number().int(),
    growth: z.number().int(),
    stability: z.number().int()
  })
  .strict();

export const ConstraintsImpactSchema = z
  .object({
    free_time_delta_min: z.number().int(),
    largest_window_delta_min: z.number().int(),
    sleep_delta_hours: z.number(),
    stress_pressure_delta: z.number().int()
  })
  .strict();

export const MitigationPlanSchema = z
  .object({
    priorities: z.array(PriorityItemSchema).max(3),
    avoid_today: z.array(z.string()),
    next_best_actions: z.array(z.string())
  })
  .strict();

export const SensitivitySchema = z
  .object({
    assumption: z.string(),
    if_wrong_effect: z.string()
  })
  .strict();

export const SimulationResultSchema = z
  .object({
    scenario_id: z.string(),
    scenario_type: ScenarioTypeSchema,
    delta: z
      .object({
        life_stability_score: z.number().int(),
        breakdown: BreakdownDeltaSchema
      })
      .strict(),
    new_estimate: z
      .object({
        life_stability_score: z.number().int().min(0).max(100),
        breakdown: BreakdownSchema,
        flags: FlagsSchema
      })
      .strict(),
    risk_changes: z.array(RiskChangeSchema),
    constraints_impact: ConstraintsImpactSchema,
    mitigation_plan: MitigationPlanSchema,
    assumptions: z.array(z.string()),
    sensitivity: z.array(SensitivitySchema),
    confidence: z.number().min(0).max(1),
    explanation: z.string()
  })
  .strict();

export const ComparisonResultSchema = z
  .object({
    baseline: z
      .object({
        score: z.number().int().min(0).max(100),
        breakdown: BreakdownSchema,
        flags: FlagsSchema
      })
      .strict(),
    ranked: z.array(
      z
        .object({
          scenario_id: z.string(),
          overall_rank: z.number().int().min(1),
          net_benefit_score: z.number().int(),
          summary: z.string(),
          key_tradeoffs: z.array(z.string()),
          top_risks: z.array(z.string())
        })
        .strict()
    ),
    recommendation: z
      .object({
        best_scenario_id: z.string().nullable(),
        why_best: z.array(z.string()),
        who_should_not_choose_this: z.array(z.string())
      })
      .strict()
  })
  .strict();

export type Scenario = z.infer<typeof ScenarioSchema>;
export type ScenarioType = z.infer<typeof ScenarioTypeSchema>;
export type BaselineSource = z.infer<typeof BaselineSourceSchema>;
export type ScenarioPackInput = z.infer<typeof ScenarioPackInputSchema>;
export type ScenarioPack = z.infer<typeof ScenarioPackSchema>;
export type ScenarioPackListItem = z.infer<typeof ScenarioPackListItemSchema>;
export type SimulationResult = z.infer<typeof SimulationResultSchema>;
export type ComparisonResult = z.infer<typeof ComparisonResultSchema>;
