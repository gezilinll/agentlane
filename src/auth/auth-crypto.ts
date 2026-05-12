import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Create a short numeric code for email verification. */
export function createNumericCode(options: { length?: number } = {}): string {
  const length = options.length ?? 6;
  const digits = Array.from({ length }, () => String(randomBytes(1)[0] % 10));
  return digits.join("");
}

/** Create an opaque bearer token with a readable prefix for diagnostics. */
export function createSecretToken(prefix: string): string {
  return `${prefix}_${randomBytes(32).toString("base64url")}`;
}

/** Hash a secret with a purpose-specific HMAC. The returned value is safe to persist. */
export function hashSecret(secret: string, purpose: string, pepper = defaultPepper()): string {
  return createHmac("sha256", pepper)
    .update(`${purpose}\0${secret}`)
    .digest("base64url");
}

/** Constant-time verification for secrets represented by `hashSecret`. */
export function verifySecret(secret: string, expectedHash: string, purpose: string, pepper = defaultPepper()): boolean {
  const actualHash = hashSecret(secret, purpose, pepper);
  const actual = Buffer.from(actualHash);
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function defaultPepper(): string {
  return process.env.AGENTLANE_AUTH_SECRET || "agentlane-development-auth-secret";
}
