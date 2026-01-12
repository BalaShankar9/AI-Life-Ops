import type { Connector, PrismaClient } from "@prisma/client";

import { decryptString, encryptString } from "./crypto";

export type ConnectorTokens = {
  access_token?: string | null;
  refresh_token?: string | null;
  token_expires_at?: Date | null;
  scopes?: string[] | null;
};

export function getConnectorTokens(connector: Connector) {
  return {
    access_token: connector.encryptedAccessToken
      ? decryptString(connector.encryptedAccessToken)
      : null,
    refresh_token: connector.encryptedRefreshToken
      ? decryptString(connector.encryptedRefreshToken)
      : null,
    token_expires_at: connector.tokenExpiresAt,
    scopes: connector.scopes
  };
}

export async function setConnectorTokens(params: {
  prisma: PrismaClient;
  connectorId: string;
  tokens: ConnectorTokens;
}) {
  const { prisma, connectorId, tokens } = params;
  return prisma.connector.update({
    where: { id: connectorId },
    data: {
      encryptedAccessToken: tokens.access_token
        ? encryptString(tokens.access_token)
        : null,
      encryptedRefreshToken: tokens.refresh_token
        ? encryptString(tokens.refresh_token)
        : null,
      tokenExpiresAt: tokens.token_expires_at ?? null,
      scopes: tokens.scopes ?? [],
      status: "connected",
      lastError: null
    }
  });
}

export async function clearConnectorTokens(params: {
  prisma: PrismaClient;
  connectorId: string;
}) {
  const { prisma, connectorId } = params;
  return prisma.connector.update({
    where: { id: connectorId },
    data: {
      encryptedAccessToken: null,
      encryptedRefreshToken: null,
      tokenExpiresAt: null,
      scopes: [],
      status: "disconnected",
      lastError: null
    }
  });
}
