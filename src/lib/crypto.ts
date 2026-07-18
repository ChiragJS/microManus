// AES-256-GCM encryption for user API keys at rest.
// APP_ENCRYPTION_SECRET: any long random string (32+ chars).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function key(): Buffer {
  const secret = process.env.APP_ENCRYPTION_SECRET;
  if (!secret) throw new Error("APP_ENCRYPTION_SECRET is not set");
  return createHash("sha256").update(secret).digest();
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/** Mask a key for display: sk-ab...xyz */
export function maskKey(k: string): string {
  if (k.length <= 8) return "****";
  return `${k.slice(0, 5)}...${k.slice(-4)}`;
}
