import crypto from "crypto";

import type { CanonicalEventInput, ConnectorAdapter } from "../types";
import {
  buildGoogleAuthUrl,
  exchangeCodeForTokens,
  GOOGLE_CALENDAR_SCOPES,
  refreshAccessToken
} from "../google_oauth";
import { getConnectorTokens, setConnectorTokens } from "../tokens";

const FREEBUSY_URL = "https://www.googleapis.com/calendar/v3/freeBusy";
const SYNC_WINDOW_PAST_DAYS = 7;
const SYNC_WINDOW_FUTURE_DAYS = 14;
const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;

export const googleCalendarConnector: ConnectorAdapter = {
  provider: "google_calendar",
  getAuthUrl: ({ state, redirectUri, scopes }) => {
    return buildGoogleAuthUrl({ state, redirectUri, scopes });
  },
  handleOAuthCallback: async ({ code, redirectUri }) => {
    return exchangeCodeForTokens({ code, redirectUri });
  },
  refreshTokenIfNeeded: async ({ connector, prisma }) => {
    const tokens = getConnectorTokens(connector);
    const shouldRefresh =
      !tokens.access_token ||
      (tokens.token_expires_at && isExpiring(tokens.token_expires_at));

    if (!shouldRefresh) {
      return null;
    }

    if (!tokens.refresh_token) {
      throw new Error("Connector refresh token missing");
    }

    const refreshed = await refreshAccessToken({
      refreshToken: tokens.refresh_token
    });

    const fallbackScopes =
      tokens.scopes && tokens.scopes.length > 0
        ? tokens.scopes
        : GOOGLE_CALENDAR_SCOPES;

    const updated = {
      access_token: refreshed.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: refreshed.expires_at ?? null,
      scopes: refreshed.scopes ?? fallbackScopes
    };

    await setConnectorTokens({
      prisma,
      connectorId: connector.id,
      tokens: updated
    });

    return updated;
  },
  syncEvents: async ({ connector, prisma }) => {
    const tokens = getConnectorTokens(connector);
    let accessToken = tokens.access_token;

    if (!accessToken || (tokens.token_expires_at && isExpiring(tokens.token_expires_at))) {
      const refreshed = await googleCalendarConnector.refreshTokenIfNeeded({
        connector,
        prisma
      });
      accessToken = refreshed?.access_token ?? accessToken;
    }

    if (!accessToken) {
      throw new Error("Connector is not connected");
    }

    const profile = await prisma.profile.findUnique({
      where: { userId: connector.userId }
    });
    const timezone = profile?.timezone || "UTC";

    const now = new Date();
    const windowStart = addDays(now, -SYNC_WINDOW_PAST_DAYS);
    const windowEnd = addDays(now, SYNC_WINDOW_FUTURE_DAYS);

    const response = await fetch(FREEBUSY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        timeMin: windowStart.toISOString(),
        timeMax: windowEnd.toISOString(),
        items: [{ id: "primary" }]
      })
    });

    if (!response.ok) {
      throw new Error("Google Calendar sync failed");
    }

    const payload = await response.json();
    const events = googleCalendarConnector.normalizeToCanonicalEvents({
      data: payload,
      timezone
    });

    return {
      fetchedCount: events.length,
      events,
      replaceWindow: {
        start: windowStart,
        end: windowEnd
      }
    };
  },
  normalizeToCanonicalEvents: (payload) => {
    return normalizeBusyBlocks(payload);
  }
};

type FreeBusyPayload = {
  data?: {
    calendars?: {
      primary?: {
        busy?: Array<{ start?: string; end?: string }>;
      };
    };
  };
  calendars?: {
    primary?: {
      busy?: Array<{ start?: string; end?: string }>;
    };
  };
  timezone?: string;
};

function normalizeBusyBlocks(payload: unknown): CanonicalEventInput[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as FreeBusyPayload;
  const timezone = typeof record.timezone === "string" ? record.timezone : "UTC";
  const rawData =
    record.data && typeof record.data === "object" ? record.data : record;
  const busy = rawData.calendars?.primary?.busy;
  if (!Array.isArray(busy)) {
    return [];
  }

  const events: CanonicalEventInput[] = [];
  const seen = new Set<string>();
  for (const block of busy) {
    const startValue = typeof block.start === "string" ? block.start : null;
    const endValue = typeof block.end === "string" ? block.end : null;
    if (!startValue || !endValue) {
      continue;
    }
    const start = startValue ? new Date(startValue) : null;
    const end = endValue ? new Date(endValue) : null;
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      continue;
    }

    const sourceId = buildBusyId(startValue, endValue);
    if (seen.has(sourceId)) {
      continue;
    }
    seen.add(sourceId);

    events.push({
      sourceId,
      kind: "calendar_busy_block",
      startTs: start,
      endTs: end,
      timezone,
      title: null,
      location: null,
      isAllDay: false,
      metadata: {
        calendarId: "primary"
      }
    });
  }

  return events;
}

function buildBusyId(start: string, end: string) {
  const hash = crypto.createHash("sha256");
  hash.update(`busy|${start}|${end}`);
  return hash.digest("hex").slice(0, 24);
}

function isExpiring(expiresAt: Date) {
  return expiresAt.getTime() - Date.now() <= TOKEN_REFRESH_BUFFER_MS;
}

function addDays(date: Date, offset: number) {
  return new Date(date.getTime() + offset * 24 * 60 * 60 * 1000);
}
