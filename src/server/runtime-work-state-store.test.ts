import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createRuntimeWorkStateStore } from "./runtime-work-state-store";

describe("runtime work state store", () => {
  it("stores and reads the latest runtime work state snapshot", () => {
    const store = createRuntimeWorkStateStore({
      snapshotPath: path.join(mkdtempSync(path.join(tmpdir(), "agentlane-work-state-")), "latest.json"),
    });
    const snapshot = {
      observedAt: "2026-05-09T08:00:00.000Z",
      deviceId: "fixture-device",
      workItems: [],
      conversations: [],
      executions: [],
      capabilities: [],
    };

    store.writeLatestSnapshot(snapshot);

    expect(store.readLatestSnapshot()).toEqual(snapshot);
  });

  it("rejects snapshots without required arrays", () => {
    const store = createRuntimeWorkStateStore({
      snapshotPath: path.join(mkdtempSync(path.join(tmpdir(), "agentlane-work-state-")), "latest.json"),
    });

    expect(() => store.writeLatestSnapshot({ deviceId: "fixture-device" })).toThrow(
      "invalid runtime work state snapshot",
    );
  });
});
