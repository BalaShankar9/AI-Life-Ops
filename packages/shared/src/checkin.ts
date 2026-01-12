import { z } from "zod";

export const CheckinInputSchema = z
  .object({
    sleep_hours: z.number().min(0).max(12),
    energy_level: z.number().min(1).max(10),
    stress_level: z.number().min(1).max(10),
    money_pressure: z.number().min(1).max(10),
    today_deadlines_count: z.number().int().min(0).max(10),
    critical_deadline: z.boolean(),
    available_time_hours: z.number().min(0).max(16),
    notes: z.string().optional()
  })
  .strict();

export type CheckinInput = z.infer<typeof CheckinInputSchema>;
