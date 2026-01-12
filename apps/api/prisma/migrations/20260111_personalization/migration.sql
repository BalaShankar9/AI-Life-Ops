-- Create personalization enums
CREATE TYPE "FocusPreference" AS ENUM ('deep_work', 'mixed', 'light_tasks');
CREATE TYPE "FeedbackType" AS ENUM ('helped', 'neutral', 'did_not_help');

-- CreateTable
CREATE TABLE "PersonalizationProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weights" JSONB NOT NULL,
    "riskAversion" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
    "focusPreference" "FocusPreference" NOT NULL DEFAULT 'mixed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalizationProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "actionTitle" TEXT NOT NULL,
    "actionCategory" TEXT NOT NULL,
    "scheduled" BOOLEAN NOT NULL,
    "feedback" "FeedbackType" NOT NULL,
    "perceivedEffort" INTEGER,
    "perceivedImpact" INTEGER,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PersonalizationProfile_userId_key" ON "PersonalizationProfile"("userId");

-- CreateIndex
CREATE INDEX "PersonalizationProfile_userId_idx" ON "PersonalizationProfile"("userId");

-- CreateIndex
CREATE INDEX "ActionFeedback_userId_createdAt_idx" ON "ActionFeedback"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ActionFeedback_snapshotId_idx" ON "ActionFeedback"("snapshotId");

-- AddForeignKey
ALTER TABLE "PersonalizationProfile" ADD CONSTRAINT "PersonalizationProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionFeedback" ADD CONSTRAINT "ActionFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionFeedback" ADD CONSTRAINT "ActionFeedback_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "Snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
