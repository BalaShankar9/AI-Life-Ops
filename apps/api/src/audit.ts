import type { AuditLog } from "@prisma/client";

export type AuditEvent = {
  event_type: string;
  created_at: string;
  metadata_summary: string;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function toAuditEvent(event: AuditLog): AuditEvent {
  return {
    event_type: event.eventType,
    created_at: event.createdAt.toISOString(),
    metadata_summary: summarizeEvent(event.eventType, event.metadata)
  };
}

function summarizeEvent(eventType: string, metadata: unknown): string {
  const info = parseMetadata(metadata);
  switch (eventType) {
    case "REGISTER":
      return "Account created.";
    case "LOGIN":
      return "Signed in.";
    case "LOGOUT":
      return "Signed out.";
    case "PROFILE_UPDATED":
      return "Profile updated.";
    case "ONBOARDING_COMPLETED":
      return "Onboarding completed.";
    case "CHECKIN_CREATED":
      return "Daily check-in recorded.";
    case "WEEKLY_REPORT_GENERATED":
      return info.weekStart
        ? `Weekly review generated for week of ${info.weekStart}.`
        : "Weekly review generated.";
    case "WEEKLY_PDF_EXPORTED":
      return info.weekStart
        ? `Weekly review exported as PDF for week of ${info.weekStart}.`
        : "Weekly review exported as PDF.";
    case "PDF_EXPORTED":
      return "Daily plan exported as PDF.";
    case "CONNECTOR_DISCONNECTED":
      return info.provider
        ? `${formatProvider(info.provider)} disconnected.`
        : "Connector disconnected.";
    case "CONNECTOR_CONNECTED":
      return info.provider
        ? `${formatProvider(info.provider)} connected.`
        : "Connector connected.";
    case "CONNECTOR_SYNC_REQUESTED":
      return info.provider
        ? `${formatProvider(info.provider)} sync requested.`
        : "Connector sync requested.";
    case "CONNECTOR_SYNC_COMPLETED":
      return info.provider
        ? `${formatProvider(info.provider)} sync completed.`
        : "Connector sync completed.";
    case "CONNECTOR_SYNC_FAILED":
      return info.provider
        ? `${formatProvider(info.provider)} sync failed.`
        : "Connector sync failed.";
    case "SCHEDULE_USED":
      return "Calendar schedule used for today's plan.";
    case "SCHEDULE_NOT_AVAILABLE":
      return "Calendar schedule not available for today's plan.";
    case "SCENARIO_PACK_CREATED":
      return "Scenario pack created.";
    case "SCENARIO_PACK_UPDATED":
      return "Scenario pack updated.";
    case "SCENARIO_PACK_DELETED":
      return "Scenario pack deleted.";
    case "SCENARIO_SIMULATED":
      return "Scenario simulation run.";
    case "SCENARIO_COMPARED":
      return "Scenario comparison run.";
    default:
      return "Event recorded.";
  }
}

function parseMetadata(metadata: unknown): {
  weekStart: string | null;
  provider: string | null;
} {
  if (!metadata || typeof metadata !== "object") {
    return { weekStart: null, provider: null };
  }
  const record = metadata as Record<string, unknown>;
  const weekStart = typeof record.weekStart === "string" ? record.weekStart : null;
  const provider = typeof record.provider === "string" ? record.provider : null;
  return {
    weekStart: weekStart && DATE_PATTERN.test(weekStart) ? weekStart : null,
    provider
  };
}

function formatProvider(value: string) {
  return value.replace(/_/g, " ");
}
