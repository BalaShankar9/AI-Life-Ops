-- Consent-based sharing migration: Add SharingConsent and SharedAccessLog

-- CreateEnum
CREATE TYPE "ConsentScope" AS ENUM ('weekly_summary_only', 'daily_scores_only', 'daily_scores_and_flags', 'daily_plan_redacted', 'scenario_reports_redacted', 'insights_metrics_only');
CREATE TYPE "ConsentStatus" AS ENUM ('active', 'revoked');
CREATE TYPE "SharedAccessAction" AS ENUM ('view_weekly', 'view_today', 'view_history', 'view_scenarios', 'view_insights');

-- CreateTable SharingConsent
CREATE TABLE "SharingConsent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "viewerUserId" TEXT NOT NULL,
    "scope" "ConsentScope" NOT NULL,
    "status" "ConsentStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "SharingConsent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SharingConsent_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SharingConsent_viewerUserId_fkey" FOREIGN KEY ("viewerUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable SharedAccessLog
CREATE TABLE "SharedAccessLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "viewerUserId" TEXT NOT NULL,
    "action" "SharedAccessAction" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SharedAccessLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SharedAccessLog_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SharedAccessLog_viewerUserId_fkey" FOREIGN KEY ("viewerUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SharingConsent_orgId_ownerUserId_viewerUserId_scope_key" ON "SharingConsent"("orgId", "ownerUserId", "viewerUserId", "scope");
CREATE INDEX "SharingConsent_orgId_ownerUserId_idx" ON "SharingConsent"("orgId", "ownerUserId");
CREATE INDEX "SharingConsent_orgId_viewerUserId_idx" ON "SharingConsent"("orgId", "viewerUserId");
CREATE INDEX "SharingConsent_ownerUserId_viewerUserId_idx" ON "SharingConsent"("ownerUserId", "viewerUserId");

CREATE INDEX "SharedAccessLog_ownerUserId_createdAt_idx" ON "SharedAccessLog"("ownerUserId", "createdAt");
CREATE INDEX "SharedAccessLog_viewerUserId_createdAt_idx" ON "SharedAccessLog"("viewerUserId", "createdAt");
CREATE INDEX "SharedAccessLog_orgId_idx" ON "SharedAccessLog"("orgId");
