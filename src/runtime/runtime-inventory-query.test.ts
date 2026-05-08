import { describe, expect, it } from "vitest";
import fixtureSnapshot from "../../fixtures/runtime/collector-snapshot.sample.json";
import {
  filterRuntimeFleet,
  getRuntimeFleetDetail,
  summarizeRuntimeFleet,
  type RuntimeFleetFilters,
} from "./runtime-inventory-query";
import type { RuntimeInventorySnapshot } from "./runtime-normalize";

const snapshot = fixtureSnapshot as RuntimeInventorySnapshot;

describe("runtime inventory query", () => {
  it("summarizes fixture inventory for Runtime Fleet metrics", () => {
    expect(summarizeRuntimeFleet(snapshot)).toEqual({
      devices: 1,
      runtimes: 2,
      onlineRuntimes: 2,
      agents: 2,
      issues: 0,
    });
  });

  it("filters runtimes and agents by query", () => {
    const result = filterRuntimeFleet(snapshot, { query: "tester" });

    expect(result.runtimes).toEqual([]);
    expect(result.agents.map((agent) => agent.name)).toEqual(["tester"]);
  });

  it("filters agents by channel without dropping device context", () => {
    const filters: RuntimeFleetFilters = { channelKind: "slock" };
    const result = filterRuntimeFleet(snapshot, filters);

    expect(result.device.id).toBe("fixture-mac");
    expect(result.agents.map((agent) => agent.name)).toEqual(["tester"]);
    expect(result.runtimes.map((runtime) => runtime.kind)).toEqual(["slock"]);
  });

  it("resolves selected agent detail with its runtime", () => {
    const detail = getRuntimeFleetDetail(snapshot, "agent", "fixture-mac:slock:slock-daemon:agent:tester");

    expect(detail).toMatchObject({
      kind: "agent",
      title: "tester",
      runtimeName: "Slock daemon",
      channelLabels: ["Slock"],
      sourceLabels: ["slock: tester"],
    });
  });
});
