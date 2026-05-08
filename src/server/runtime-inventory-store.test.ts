import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import fixtureSnapshot from "../../fixtures/runtime/collector-snapshot.sample.json";
import type { RuntimeInventorySnapshot } from "../runtime";
import { createRuntimeInventoryStore, validateRuntimeInventorySnapshot } from "./runtime-inventory-store";

const fixture = fixtureSnapshot as RuntimeInventorySnapshot;

describe("runtime inventory store", () => {
  it("writes and reads the latest runtime inventory snapshot", () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "agentlane-runtime-store-"));
    const store = createRuntimeInventoryStore({
      snapshotPath: path.join(dataDir, "latest.json"),
    });
    const snapshot = {
      ...fixture,
      device: { ...fixture.device, name: "Backend Fixture Mac" },
    };

    expect(store.readLatestSnapshot()).toBeNull();

    store.writeLatestSnapshot(snapshot);

    expect(store.readLatestSnapshot()?.device.name).toBe("Backend Fixture Mac");
  });

  it("rejects malformed snapshots before persistence", () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "agentlane-runtime-store-"));
    const store = createRuntimeInventoryStore({
      snapshotPath: path.join(dataDir, "latest.json"),
    });

    expect(validateRuntimeInventorySnapshot({ device: { id: "missing-fields" } })).toBe(false);
    expect(() => store.writeLatestSnapshot({ device: { id: "missing-fields" } })).toThrow(/invalid/i);
  });
});
