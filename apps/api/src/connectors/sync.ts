import type { ConnectorProvider, PrismaClient } from "@prisma/client";
import type { Logger } from "pino";

import { getConnectorAdapter } from "./registry";
import type { CanonicalEventInput } from "./types";

export async function runConnectorSync(params: {
  prisma: PrismaClient;
  logger: Logger;
  userId: string;
  provider: ConnectorProvider;
  requestId?: string;
}) {
  const { prisma, logger, userId, provider, requestId } = params;
  const adapter = getConnectorAdapter(provider);

  const connector = await prisma.connector.upsert({
    where: { userId_provider: { userId, provider } },
    update: {},
    create: {
      userId,
      provider,
      status: "disconnected",
      scopes: []
    }
  });

  const startedAt = new Date();

  try {
    const result = await adapter.syncEvents({ connector, prisma });
    const upsertedCount = result.replaceWindow
      ? await replaceCanonicalEvents(
          prisma,
          userId,
          provider,
          result.events,
          result.replaceWindow
        )
      : await upsertCanonicalEvents(prisma, userId, provider, result.events);

    const finishedAt = new Date();
    const hasTokens = Boolean(
      connector.encryptedAccessToken || connector.encryptedRefreshToken
    );
    await prisma.connectorRun.create({
      data: {
        connectorId: connector.id,
        startedAt,
        finishedAt,
        status: "success",
        fetchedCount: result.fetchedCount,
        upsertedCount
      }
    });

    await prisma.connector.update({
      where: { id: connector.id },
      data: {
        lastSyncedAt: finishedAt,
        lastError: null,
        status: hasTokens ? "connected" : "disconnected"
      }
    });

    await prisma.auditLog.create({
      data: {
        userId,
        eventType: "CONNECTOR_SYNC_COMPLETED",
        metadata: {
          provider,
          connectorId: connector.id,
          fetchedCount: result.fetchedCount,
          upsertedCount
        }
      }
    });

    return {
      fetchedCount: result.fetchedCount,
      upsertedCount
    };
  } catch (error) {
    const finishedAt = new Date();
    const safeMessage = toSafeErrorMessage(error);

    await prisma.connectorRun.create({
      data: {
        connectorId: connector.id,
        startedAt,
        finishedAt,
        status: "error",
        fetchedCount: 0,
        upsertedCount: 0,
        errorMessage: safeMessage
      }
    });

    await prisma.connector.update({
      where: { id: connector.id },
      data: {
        lastError: safeMessage,
        status: "error"
      }
    });

    await prisma.auditLog.create({
      data: {
        userId,
        eventType: "CONNECTOR_SYNC_FAILED",
        metadata: {
          provider,
          connectorId: connector.id,
          error: safeMessage
        }
      }
    });

    logger.error(
      { request_id: requestId, err: safeMessage, provider },
      "Connector sync failed"
    );
    throw error;
  }
}

async function upsertCanonicalEvents(
  prisma: PrismaClient,
  userId: string,
  provider: ConnectorProvider,
  events: CanonicalEventInput[]
) {
  let upserted = 0;
  for (const event of events) {
    await prisma.event.upsert({
      where: {
        userId_sourceProvider_sourceId: {
          userId,
          sourceProvider: provider,
          sourceId: event.sourceId
        }
      },
      update: {
        kind: event.kind,
        startTs: event.startTs,
        endTs: event.endTs,
        timezone: event.timezone,
        title: event.title ?? null,
        location: event.location ?? null,
        isAllDay: event.isAllDay ?? false,
        metadata: event.metadata ?? {}
      },
      create: {
        userId,
        sourceProvider: provider,
        sourceId: event.sourceId,
        kind: event.kind,
        startTs: event.startTs,
        endTs: event.endTs,
        timezone: event.timezone,
        title: event.title ?? null,
        location: event.location ?? null,
        isAllDay: event.isAllDay ?? false,
        metadata: event.metadata ?? {}
      }
    });
    upserted += 1;
  }
  return upserted;
}

async function replaceCanonicalEvents(
  prisma: PrismaClient,
  userId: string,
  provider: ConnectorProvider,
  events: CanonicalEventInput[],
  window: { start: Date; end: Date }
) {
  const kinds = Array.from(new Set(events.map((event) => event.kind)));

  await prisma.event.deleteMany({
    where: {
      userId,
      sourceProvider: provider,
      startTs: { gte: window.start },
      endTs: { lte: window.end },
      ...(kinds.length > 0 ? { kind: { in: kinds } } : {})
    }
  });

  if (events.length === 0) {
    return 0;
  }

  const createResult = await prisma.event.createMany({
    data: events.map((event) => ({
      userId,
      sourceProvider: provider,
      sourceId: event.sourceId,
      kind: event.kind,
      startTs: event.startTs,
      endTs: event.endTs,
      timezone: event.timezone,
      title: event.title ?? null,
      location: event.location ?? null,
      isAllDay: event.isAllDay ?? false,
      metadata: event.metadata ?? {}
    }))
  });

  return createResult.count;
}

function toSafeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.slice(0, 180);
  }
  return "Unknown connector sync error";
}
