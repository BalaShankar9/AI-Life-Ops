import type { Connector, ConnectorProvider, PrismaClient } from "@prisma/client";

export type CanonicalEventInput = {
  sourceId: string;
  kind: "calendar_busy_block";
  startTs: Date;
  endTs: Date;
  timezone: string;
  title?: string | null;
  location?: string | null;
  isAllDay?: boolean;
  metadata?: Record<string, unknown>;
};

export type ConnectorSyncResult = {
  fetchedCount: number;
  events: CanonicalEventInput[];
  replaceWindow?: {
    start: Date;
    end: Date;
  };
};

export type ConnectorContext = {
  connector: Connector;
  prisma: PrismaClient;
};

export type ConnectorAdapter = {
  provider: ConnectorProvider;
  getAuthUrl: (params: {
    state: string;
    redirectUri: string;
    scopes: string[];
  }) => string;
  handleOAuthCallback: (params: {
    code: string;
    redirectUri: string;
  }) => Promise<{
    access_token: string;
    refresh_token?: string;
    expires_at?: Date | null;
    scopes?: string[];
  }>;
  refreshTokenIfNeeded: (params: ConnectorContext) => Promise<{
    access_token: string;
    refresh_token?: string;
    expires_at?: Date | null;
    scopes?: string[];
  } | null>;
  syncEvents: (params: ConnectorContext) => Promise<ConnectorSyncResult>;
  normalizeToCanonicalEvents: (payload: unknown) => CanonicalEventInput[];
};
