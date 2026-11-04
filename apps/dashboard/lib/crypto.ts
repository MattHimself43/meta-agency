import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * AES-256-GCM for integration tokens. Key: TOKEN_ENCRYPTION_KEY, 32 bytes as base64 or hex.
 * Output format: base64(iv).base64(tag).base64(ciphertext)
 */
function key(raw = process.env.TOKEN_ENCRYPTION_KEY): Buffer {
  if (!raw) throw new Error("TOKEN_ENCRYPTION_KEY is not set");
  const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must decode to 32 bytes");
  return buf;
}

export function encryptSecret(plaintext: string, rawKey?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(rawKey), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, data].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(payload: string, rawKey?: string): string {
  const [iv, tag, data] = payload.split(".").map((p) => Buffer.from(p, "base64"));
  if (!iv || !tag || !data) throw new Error("Malformed ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", key(rawKey), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/** URL-safe random token with at least 32 bytes of entropy (portal, share links). */
export function generateToken(bytes = 32): string {
  if (bytes < 32) throw new Error("Tokens must be at least 32 random bytes");
  return randomBytes(bytes).toString("base64url");
}

/** Tokens are stored hashed so a database leak doesn't leak working links. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
