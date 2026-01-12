import { Queue } from "bullmq";

export const WEEKLY_REPORT_QUEUE = "weekly-reports";
export const CONNECTOR_SYNC_QUEUE = "connector-sync";

let weeklyQueue: Queue | null = null;
let connectorQueue: Queue | null = null;

type QueueLike = Pick<Queue, "add">;

export function getWeeklyReportQueue(): Queue {
  if (weeklyQueue) {
    return weeklyQueue;
  }

  weeklyQueue = new Queue(WEEKLY_REPORT_QUEUE, {
    connection: buildRedisConnection()
  });

  return weeklyQueue;
}

export function getConnectorSyncQueue(): QueueLike {
  if (connectorQueue) {
    return connectorQueue;
  }

  if (process.env.NODE_ENV === "test") {
    return {
      add: async () => ({ id: "test-job" })
    } as QueueLike;
  }

  connectorQueue = new Queue(CONNECTOR_SYNC_QUEUE, {
    connection: buildRedisConnection()
  });

  return connectorQueue;
}

export function buildRedisConnection() {
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
  const parsed = new URL(redisUrl);
  const db = parsed.pathname ? Number(parsed.pathname.slice(1)) : undefined;

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    db: Number.isNaN(db) ? undefined : db
  };
}
