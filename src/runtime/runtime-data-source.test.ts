import { describe, expect, it } from "vitest";
import { isFixtureFallbackAllowed } from "./runtime-data-source";

describe("runtime data source mode", () => {
  it("allows fixture fallback only outside production builds", () => {
    expect(isFixtureFallbackAllowed("development")).toBe(true);
    expect(isFixtureFallbackAllowed("test")).toBe(true);
    expect(isFixtureFallbackAllowed("production")).toBe(false);
  });
});
