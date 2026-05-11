import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("dev e2e server configuration", () => {
  it("keeps internal e2e snapshots away from manual dev snapshot paths", () => {
    const source = readFileSync(path.resolve("scripts/dev-e2e.ts"), "utf8");

    expect(source).toContain("inventorySnapshotPath");
    expect(source).toContain("workStateSnapshotPath");
    expect(source).toContain('path.join(repoRoot, ".agentlane", "e2e")');
    expect(source).toContain('path.join(e2eSnapshotRoot, "runtime-inventory", "latest.json")');
    expect(source).toContain('path.join(e2eSnapshotRoot, "runtime-work-state", "latest.json")');
  });
});
