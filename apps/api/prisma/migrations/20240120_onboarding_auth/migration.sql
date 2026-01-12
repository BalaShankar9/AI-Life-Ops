-- Add auth and onboarding profile fields

ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;

CREATE TYPE "WorkPattern" AS ENUM ('day', 'night', 'mixed', 'unemployed');
CREATE TYPE "PriorityBias" AS ENUM ('stability_first', 'income_first', 'growth_first');

ALTER TABLE "Profile"
  DROP COLUMN "preferences",
  ADD COLUMN "wake_window_start" TEXT NOT NULL DEFAULT '07:00',
  ADD COLUMN "wake_window_end" TEXT NOT NULL DEFAULT '10:00',
  ADD COLUMN "sleep_window_start" TEXT NOT NULL DEFAULT '22:00',
  ADD COLUMN "sleep_window_end" TEXT NOT NULL DEFAULT '06:00',
  ADD COLUMN "work_pattern" "WorkPattern" NOT NULL DEFAULT 'day',
  ADD COLUMN "max_daily_focus_blocks" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "priority_bias" "PriorityBias" NOT NULL DEFAULT 'stability_first',
  ADD COLUMN "compliance_domains" TEXT[] NOT NULL DEFAULT ARRAY['bills', 'visa/legal']::TEXT[],
  ADD COLUMN "onboarding_completed_at" TIMESTAMP(3);
