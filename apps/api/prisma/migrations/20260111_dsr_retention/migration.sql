-- Add DSR and retention models
CREATE TABLE "DataRetentionPolicy" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "retentionDaysSnapshots" INTEGER NOT NULL DEFAULT 365,
    "retentionDaysAudit" INTEGER NOT NULL DEFAULT 730,
    "retentionDaysAccessLogs" INTEGER NOT NULL DEFAULT 180,
    "retentionDaysFeedback" INTEGER NOT NULL DEFAULT 365,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataRetentionPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeletionRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeletionRequest_pkey" PRIMARY KEY ("id")
);

-- Create unique index
CREATE UNIQUE INDEX "DataRetentionPolicy_orgId_key" ON "DataRetentionPolicy"("orgId");

-- Create indexes
CREATE INDEX "DeletionRequest_userId_expiresAt_idx" ON "DeletionRequest"("userId", "expiresAt");
CREATE INDEX "DeletionRequest_tokenHash_idx" ON "DeletionRequest"("tokenHash");

-- Add foreign keys
ALTER TABLE "DataRetentionPolicy" ADD CONSTRAINT "DataRetentionPolicy_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeletionRequest" ADD CONSTRAINT "DeletionRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
