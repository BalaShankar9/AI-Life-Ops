import type { PrismaClient } from "@prisma/client";
import type { Logger } from "pino";

import { getWeeklyReportQueue } from "./queues";

export async function enqueueWeeklyReportsForAllUsers(params: {
  prisma: PrismaClient;
  logger: Logger;
  weekStart: string;
}) {
  const { prisma, logger, weekStart } = params;
  const queue = getWeeklyReportQueue();

  const users = await prisma.user.findMany({
    select: { id: true }
  });

  for (const user of users) {
    try {
      await queue.add(
        "weekly-report",
        { userId: user.id, weekStart },
        { jobId: `${user.id}-${weekStart}` }
      );
    } catch (error) {
      logger.error(
        { err: error instanceof Error ? error.message : error },
        "Failed to enqueue weekly report job"
      );
    }
  }
}

// Scheduler hook: in production run this on a separate worker dyno (cron) once per week.
