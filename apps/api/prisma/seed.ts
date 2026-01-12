import { randomBytes, scrypt as _scrypt } from "crypto";
import { promisify } from "util";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const scrypt = promisify(_scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

async function main() {
  const email = process.env.DEV_USER_EMAIL || "dev-user";
  const password = process.env.DEV_USER_PASSWORD || "dev-password";

  const passwordHash = await hashPassword(password);

  await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash
    },
    create: {
      email,
      passwordHash
    }
  });
}

main()
  .catch((error) => {
    console.error("Seed failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
