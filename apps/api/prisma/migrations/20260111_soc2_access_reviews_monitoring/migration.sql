-- SOC2 Security Hardening: Access Reviews and Monitoring
-- Migration: 20260111_soc2_access_reviews_monitoring

-- AccessReviewRecord table for SOC2 evidence tracking
CREATE TABLE "AccessReviewRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "reviewerUserId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "notes" TEXT,
    "evidenceHash" TEXT,
    "completionHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    
    CONSTRAINT "AccessReviewRecord_orgId_fkey" FOREIGN KEY ("orgId") 
        REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AccessReviewRecord_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") 
        REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AccessReviewRecord_orgId_createdAt_idx" ON "AccessReviewRecord"("orgId", "createdAt");
CREATE INDEX "AccessReviewRecord_reviewerUserId_idx" ON "AccessReviewRecord"("reviewerUserId");

-- MonitoringEvent table for operational alerts
CREATE TABLE "MonitoringEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventType" TEXT NOT NULL,
    "orgId" TEXT,
    "userId" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT "MonitoringEvent_orgId_fkey" FOREIGN KEY ("orgId") 
        REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MonitoringEvent_userId_fkey" FOREIGN KEY ("userId") 
        REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "MonitoringEvent_orgId_createdAt_idx" ON "MonitoringEvent"("orgId", "createdAt");
CREATE INDEX "MonitoringEvent_eventType_createdAt_idx" ON "MonitoringEvent"("eventType", "createdAt");
