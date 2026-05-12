import { describe, expect, it } from "vitest";
import { createNumericCode, createSecretToken, hashSecret, verifySecret } from "./auth-crypto";

describe("auth crypto helpers", () => {
  it("hashes login codes and tokens without exposing the original secret", () => {
    const hash = hashSecret("123456", "login-code", "test-pepper");

    expect(hash).not.toContain("123456");
    expect(verifySecret("123456", hash, "login-code", "test-pepper")).toBe(true);
    expect(verifySecret("123457", hash, "login-code", "test-pepper")).toBe(false);
    expect(verifySecret("123456", hash, "session-token", "test-pepper")).toBe(false);
  });

  it("creates short numeric email codes and high-entropy bearer tokens", () => {
    expect(createNumericCode({ length: 6 })).toMatch(/^\d{6}$/);
    expect(createSecretToken("agt")).toMatch(/^agt_[A-Za-z0-9_-]{32,}$/);
  });
});
