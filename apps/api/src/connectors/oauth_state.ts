import { randomBytes } from "crypto";

import type { ConnectorProvider, PrismaClient } from "@prisma/client";

const STATE_TTL_MS = 10 * 60 * 1000;

export async function createOAuthState(params: {
  prisma: PrismaClient;
  userId: string;
  provider: ConnectorProvider;
}) {
  const { prisma, userId, provider } = params;
  const now = new Date();

  await prisma.oAuthState.deleteMany({
    where: {
      userId,
      provider,
      expiresAt: { lt: now }
    }
  });

  const state = randomBytes(32).toString("hex");
  const expiresAt = new Date(now.getTime() + STATE_TTL_MS);

  await prisma.oAuthState.create({
    data: {
      userId,
      provider,
      state,
      expiresAt
    }
  });

  return { state, expiresAt };
}

export async function consumeOAuthState(params: {
  prisma: PrismaClient;
  userId: string;
  provider: ConnectorProvider;
  state: string;
}) {
  const { prisma, userId, provider, state } = params;
  const now = new Date();

  const record = await prisma.oAuthState.findUnique({
    where: { state }
  });

  if (!record) {
    return { ok: false, reason: "missing" };
  }

  if (record.userId !== userId || record.provider !== provider) {
    return { ok: false, reason: "invalid" };
  }

  if (record.expiresAt < now) {
    await prisma.oAuthState.delete({ where: { state } });
    return { ok: false, reason: "expired" };
  }

  await prisma.oAuthState.delete({ where: { state } });
  return { ok: true };
}
