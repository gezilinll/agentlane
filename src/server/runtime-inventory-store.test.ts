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
    const dataDir = mkdtempSync(path.join(tmpdir(), "lorume-runtime-store-"));
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
    const dataDir = mkdtempSync(path.join(tmpdir(), "lorume-runtime-store-"));
    const store = createRuntimeInventoryStore({
      snapshotPath: path.join(dataDir, "latest.json"),
    });

    expect(validateRuntimeInventorySnapshot({ device: { id: "missing-fields" } })).toBe(false);
    expect(() => store.writeLatestSnapshot({ device: { id: "missing-fields" } })).toThrow(/invalid/i);
  });

  it("tracks device connection freshness separately from the latest snapshot", () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "lorume-runtime-store-"));
    const store = createRuntimeInventoryStore({
      snapshotPath: path.join(dataDir, "latest.json"),
      staleAfterMs: 60_000,
    });

    expect(store.readDeviceConnection("fixture-mac")).toBeNull();

    store.writeDeviceConnection({
      deviceId: "fixture-mac",
      status: "online",
      connectedAt: "2026-05-08T08:00:00.000Z",
      lastHeartbeatAt: "2026-05-08T08:00:10.000Z",
      collectorVersion: "0.1.0",
    });

    expect(store.readDeviceConnection("fixture-mac", new Date("2026-05-08T08:00:30.000Z"))).toMatchObject({
      deviceId: "fixture-mac",
      status: "online",
      collectorVersion: "0.1.0",
    });
    expect(store.readDeviceConnection("fixture-mac", new Date("2026-05-08T08:02:00.000Z"))).toMatchObject({
      deviceId: "fixture-mac",
      status: "stale",
    });

    store.markDeviceDisconnected("fixture-mac", "2026-05-08T08:02:30.000Z", "socket closed");

    expect(store.readDeviceConnection("fixture-mac")).toMatchObject({
      deviceId: "fixture-mac",
      status: "offline",
      lastDisconnectedAt: "2026-05-08T08:02:30.000Z",
      lastError: "socket closed",
    });
  });

  it("tracks refresh command lifecycle by command id", () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "lorume-runtime-store-"));
    const store = createRuntimeInventoryStore({
      snapshotPath: path.join(dataDir, "latest.json"),
    });

    const command = store.createRuntimeCommand({
      commandId: "cmd-refresh-1",
      deviceId: "fixture-mac",
      type: "inventory.refresh",
      createdAt: "2026-05-08T08:00:00.000Z",
    });

    expect(command).toMatchObject({
      commandId: "cmd-refresh-1",
      deviceId: "fixture-mac",
      type: "inventory.refresh",
      status: "pending",
    });

    store.updateRuntimeCommand("cmd-refresh-1", {
      status: "accepted",
      acceptedAt: "2026-05-08T08:00:01.000Z",
    });
    store.updateRuntimeCommand("cmd-refresh-1", {
      status: "succeeded",
      completedAt: "2026-05-08T08:00:03.000Z",
      result: { observedAt: "2026-05-08T08:00:02.000Z" },
    });

    expect(store.readRuntimeCommand("cmd-refresh-1")).toMatchObject({
      commandId: "cmd-refresh-1",
      status: "succeeded",
      acceptedAt: "2026-05-08T08:00:01.000Z",
      completedAt: "2026-05-08T08:00:03.000Z",
      result: { observedAt: "2026-05-08T08:00:02.000Z" },
    });
  });
});
