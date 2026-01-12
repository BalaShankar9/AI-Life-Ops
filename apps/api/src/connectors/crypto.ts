import crypto from "crypto";

let cachedKey: Buffer | null = null;

export function validateConnectorEncryptionKey() {
  getEncryptionKey();
}

export function encryptString(plain: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decryptString(payload: string): string {
  const key = getEncryptionKey();
  const raw = Buffer.from(payload, "base64");
  if (raw.length < 28) {
    throw new Error("Encrypted payload is too short");
  }
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

function getEncryptionKey(): Buffer {
  if (cachedKey) {
    return cachedKey;
  }
  const keyHex = process.env.CONNECTOR_ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error("CONNECTOR_ENCRYPTION_KEY is required for connector encryption");
  }
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) {
    throw new Error("CONNECTOR_ENCRYPTION_KEY must be 32 bytes / 64 hex chars");
  }
  cachedKey = key;
  return key;
}
