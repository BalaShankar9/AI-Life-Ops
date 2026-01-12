-- Create scenario enums
CREATE TYPE "BaselineSource" AS ENUM ('latest_checkin', 'custom_checkin');
CREATE TYPE "ScenarioRunType" AS ENUM ('simulate', 'compare');

-- CreateTable
CREATE TABLE "ScenarioPack" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "baselineSource" "BaselineSource" NOT NULL DEFAULT 'latest_checkin',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScenarioPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL,
    "scenarioPackId" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScenarioRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scenarioPackId" TEXT,
    "runType" "ScenarioRunType" NOT NULL,
    "baselineRef" JSONB NOT NULL,
    "resultJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScenarioRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScenarioPack_userId_updatedAt_idx" ON "ScenarioPack"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "Scenario_scenarioPackId_createdAt_idx" ON "Scenario"("scenarioPackId", "createdAt");

-- CreateIndex
CREATE INDEX "ScenarioRun_userId_createdAt_idx" ON "ScenarioRun"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ScenarioRun_scenarioPackId_createdAt_idx" ON "ScenarioRun"("scenarioPackId", "createdAt");

-- AddForeignKey
ALTER TABLE "ScenarioPack" ADD CONSTRAINT "ScenarioPack_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_scenarioPackId_fkey" FOREIGN KEY ("scenarioPackId") REFERENCES "ScenarioPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioRun" ADD CONSTRAINT "ScenarioRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioRun" ADD CONSTRAINT "ScenarioRun_scenarioPackId_fkey" FOREIGN KEY ("scenarioPackId") REFERENCES "ScenarioPack"("id") ON DELETE SET NULL ON UPDATE CASCADE;
