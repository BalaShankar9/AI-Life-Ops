import dotenv from "dotenv";
import { Worker } from "bullmq";

import type { ConnectorProvider } from "@prisma/client";

import { prisma, logger } from "./app";
import { validateConnectorEncryptionKey } from "./connectors/crypto";
import { validateGoogleOAuthConfig } from "./connectors/google_oauth";
import { runConnectorSync } from "./connectors/sync";
import {
  buildRedisConnection,
  CONNECTOR_SYNC_QUEUE,
  WEEKLY_REPORT_QUEUE
} from "./queues";
import { generateWeeklyReport } from "./weekly";

dotenv.config();
validateConnectorEncryptionKey();
validateGoogleOAuthConfig();

type WeeklyJobPayload = {
  userId: string;
  weekStart: string;
};

const worker = new Worker<WeeklyJobPayload>(
  WEEKLY_REPORT_QUEUE,
  async (job) => {
    const { userId, weekStart } = job.data;
    await generateWeeklyReport({
      prisma,
      logger,
      userId,
      weekStart,
      requestId: job.id?.toString()
    });
  },
  {
    connection: buildRedisConnection()
  }
);

worker.on("completed", (job) => {
  logger.info({ jobId: job.id }, "Weekly report job completed");
});

worker.on("failed", (job, error) => {
  logger.error(
    { jobId: job?.id, err: error?.message },
    "Weekly report job failed"
  );
});

type ConnectorJobPayload = {
  userId: string;
  provider: ConnectorProvider;
};

const connectorWorker = new Worker<ConnectorJobPayload>(
  CONNECTOR_SYNC_QUEUE,
  async (job) => {
    const { userId, provider } = job.data;
    await runConnectorSync({
      prisma,
      logger,
      userId,
      provider,
      requestId: job.id?.toString()
    });
  },
  {
    connection: buildRedisConnection()
  }
);

connectorWorker.on("completed", (job) => {
  logger.info({ jobId: job.id }, "Connector sync job completed");
});

connectorWorker.on("failed", (job, error) => {
  logger.error(
    { jobId: job?.id, err: error?.message },
    "Connector sync job failed"
  );
});

async function shutdown() {
  await worker.close();
  await connectorWorker.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
