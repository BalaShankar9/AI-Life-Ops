-- Multi-tenancy migration: Add Organizations, Membership, and org_id to all data tables
-- CreateEnum
CREATE TYPE "OrgType" AS ENUM ('personal', 'team');
CREATE TYPE "MembershipRole" AS ENUM ('owner', 'admin', 'member', 'coach', 'viewer');
CREATE TYPE "MembershipStatus" AS ENUM ('active', 'invited', 'revoked');

-- CreateTable Organization
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" "OrgType" NOT NULL DEFAULT 'personal',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateTable Membership
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'member',
    "status" "MembershipStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Membership_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable OrgInvite
CREATE TABLE "OrgInvite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'member',
    "inviteToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrgInvite_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_orgId_key" ON "Membership"("userId", "orgId");
CREATE INDEX "Membership_orgId_idx" ON "Membership"("orgId");
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");
CREATE UNIQUE INDEX "OrgInvite_inviteToken_key" ON "OrgInvite"("inviteToken");
CREATE INDEX "OrgInvite_orgId_idx" ON "OrgInvite"("orgId");
CREATE INDEX "OrgInvite_inviteToken_idx" ON "OrgInvite"("inviteToken");
CREATE INDEX "OrgInvite_email_idx" ON "OrgInvite"("email");

-- AlterTable: Add org_id columns to all data tables (nullable initially for backfill)
ALTER TABLE "Checkin" ADD COLUMN "orgId" TEXT;
ALTER TABLE "Snapshot" ADD COLUMN "orgId" TEXT;
ALTER TABLE "WeeklyReport" ADD COLUMN "orgId" TEXT;
ALTER TABLE "Connector" ADD COLUMN "orgId" TEXT;
ALTER TABLE "ConnectorRun" ADD COLUMN "orgId" TEXT;
ALTER TABLE "Event" ADD COLUMN "orgId" TEXT;
ALTER TABLE "ScenarioPack" ADD COLUMN "orgId" TEXT;
ALTER TABLE "Scenario" ADD COLUMN "orgId" TEXT;
ALTER TABLE "ScenarioRun" ADD COLUMN "orgId" TEXT;
ALTER TABLE "PersonalizationProfile" ADD COLUMN "orgId" TEXT;
ALTER TABLE "ActionFeedback" ADD COLUMN "orgId" TEXT;

-- BACKFILL LOGIC:
-- 1. Create Personal org for each existing user
DO $$
DECLARE
    user_record RECORD;
    personal_org_id TEXT;
BEGIN
    FOR user_record IN SELECT id, email FROM "User"
    LOOP
        -- Generate UUID for personal org
        personal_org_id := gen_random_uuid()::TEXT;
        
        -- Create Personal organization
        INSERT INTO "Organization" (id, name, type, "createdAt", "updatedAt")
        VALUES (personal_org_id, user_record.email || '''s Personal', 'personal', NOW(), NOW());
        
        -- Create owner membership
        INSERT INTO "Membership" (id, "userId", "orgId", role, status, "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::TEXT, user_record.id, personal_org_id, 'owner', 'active', NOW(), NOW());
        
        -- Backfill all user data to Personal org
        UPDATE "Checkin" SET "orgId" = personal_org_id WHERE "userId" = user_record.id;
        UPDATE "Snapshot" SET "orgId" = personal_org_id WHERE "userId" = user_record.id;
        UPDATE "WeeklyReport" SET "orgId" = personal_org_id WHERE "userId" = user_record.id;
        UPDATE "Connector" SET "orgId" = personal_org_id WHERE "userId" = user_record.id;
        UPDATE "ConnectorRun" SET "orgId" = personal_org_id
        WHERE "connectorId" IN (SELECT id FROM "Connector" WHERE "userId" = user_record.id);
        UPDATE "Event" SET "orgId" = personal_org_id WHERE "userId" = user_record.id;
        UPDATE "ScenarioPack" SET "orgId" = personal_org_id WHERE "userId" = user_record.id;
        UPDATE "Scenario" SET "orgId" = personal_org_id
        WHERE "scenarioPackId" IN (SELECT id FROM "ScenarioPack" WHERE "userId" = user_record.id);
        UPDATE "ScenarioRun" SET "orgId" = personal_org_id WHERE "userId" = user_record.id;
        UPDATE "PersonalizationProfile" SET "orgId" = personal_org_id WHERE "userId" = user_record.id;
        UPDATE "ActionFeedback" SET "orgId" = personal_org_id WHERE "userId" = user_record.id;
    END LOOP;
END $$;

-- Make org_id NOT NULL and add foreign keys
ALTER TABLE "Checkin" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "Checkin" ADD CONSTRAINT "Checkin_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Snapshot" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "Snapshot" ADD CONSTRAINT "Snapshot_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WeeklyReport" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "WeeklyReport" ADD CONSTRAINT "WeeklyReport_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Connector" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "Connector" ADD CONSTRAINT "Connector_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConnectorRun" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "ConnectorRun" ADD CONSTRAINT "ConnectorRun_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Event" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "Event" ADD CONSTRAINT "Event_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScenarioPack" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "ScenarioPack" ADD CONSTRAINT "ScenarioPack_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Scenario" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScenarioRun" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "ScenarioRun" ADD CONSTRAINT "ScenarioRun_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PersonalizationProfile" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "PersonalizationProfile" ADD CONSTRAINT "PersonalizationProfile_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActionFeedback" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "ActionFeedback" ADD CONSTRAINT "ActionFeedback_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex: Add indexes on org_id
CREATE INDEX "Checkin_orgId_idx" ON "Checkin"("orgId");
CREATE INDEX "Snapshot_orgId_idx" ON "Snapshot"("orgId");
CREATE INDEX "WeeklyReport_orgId_idx" ON "WeeklyReport"("orgId");
CREATE INDEX "Connector_orgId_idx" ON "Connector"("orgId");
CREATE INDEX "ConnectorRun_orgId_idx" ON "ConnectorRun"("orgId");
CREATE INDEX "Event_orgId_idx" ON "Event"("orgId");
CREATE INDEX "ScenarioPack_orgId_idx" ON "ScenarioPack"("orgId");
CREATE INDEX "Scenario_orgId_idx" ON "Scenario"("orgId");
CREATE INDEX "ScenarioRun_orgId_idx" ON "ScenarioRun"("orgId");
CREATE INDEX "PersonalizationProfile_orgId_idx" ON "PersonalizationProfile"("orgId");
CREATE INDEX "ActionFeedback_orgId_idx" ON "ActionFeedback"("orgId");
