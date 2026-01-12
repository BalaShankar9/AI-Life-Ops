/**
 * Monitoring Event Helpers
 * 
 * Utilities for emitting monitoring events for SOC2 compliance.
 */

import { prisma } from "./app";

export type MonitoringEventType =
  | "CONNECTOR_SYNC_FAILURE"
  | "RETENTION_PURGE_FAILURE"
  | "AUTH_FAILURE_PATTERN"
  | "REPEATED_LOGIN_FAILURES"
  | "OAUTH_CALLBACK_FAILURE";

export async function emitMonitoringEvent(
  eventType: MonitoringEventType,
  metadata: Record<string, any>,
  orgId?: string,
  userId?: string
) {
  try {
    await prisma.monitoringEvent.create({
      data: {
        eventType,
        orgId: orgId || null,
        userId: userId || null,
        metadata: JSON.stringify(metadata)
      }
    });
  } catch (error) {
    // Don't let monitoring failures break the app
    console.error("Failed to emit monitoring event:", error);
  }
}
