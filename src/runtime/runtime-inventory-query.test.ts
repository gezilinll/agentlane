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
      status: "active",
      sections: expect.arrayContaining([
        expect.objectContaining({ title: "可用渠道", items: ["Slock"] }),
      ]),
    });
  });

  it("resolves device detail into human-readable sections without raw source lists", () => {
    const detail = getRuntimeFleetDetail(snapshot, "device", "fixture-mac");
    const sections = detailSections(detail);

    expect(sectionItems(sections, "身份信息")).toEqual([
      "Device ID: fixture-mac",
      "Hostname: fixture-mac.local",
      "OS: darwin",
      "Arch: arm64",
    ]);
    expect(sectionItems(sections, "连接状态")).toEqual([
      "连接方式: Collector",
      "设备状态: 在线",
      "最近同步: 2026-05-08T08:00:01.000Z",
      "Collector: 0.1.0",
    ]);
    expect(sectionItems(sections, "平台注册")).toEqual(["OpenClaw: OpenClaw Gateway", "Slock: Slock daemon"]);
    expect((detail as { sourceLabels?: string[] })?.sourceLabels).toBeUndefined();
  });

  it("resolves runtime detail around ownership and endpoint instead of table capabilities", () => {
    const detail = getRuntimeFleetDetail(snapshot, "runtime", "fixture-mac:openclaw:gateway-18789");
    const sections = detailSections(detail);

    expect(sectionItems(sections, "身份信息")).toEqual([
      "Runtime ID: fixture-mac:openclaw:gateway-18789",
      "Kind: OpenClaw",
      "Version: 2026.4.27",
    ]);
    expect(sectionItems(sections, "归属关系")).toEqual(["所属设备: Fixture Mac", "Agent 数量: 1"]);
    expect(sectionItems(sections, "运行入口")).toEqual(["暂无运行入口"]);
    expect((detail as { capabilities?: string[] })?.capabilities).toBeUndefined();
    expect((detail as { channelLabels?: string[] })?.channelLabels).toBeUndefined();
  });

  it("resolves agent detail around runtime ownership and channel exposure", () => {
    const detail = getRuntimeFleetDetail(snapshot, "agent", "fixture-mac:slock:slock-daemon:agent:tester");
    const sections = detailSections(detail);

    expect(sectionItems(sections, "身份信息")).toEqual([
      "Agent ID: fixture-mac:slock:slock-daemon:agent:tester",
      "来源平台: Slock",
      "状态: 活跃",
    ]);
    expect(sectionItems(sections, "归属关系")).toEqual([
      "所属 Runtime: Slock daemon",
      "所属设备: Fixture Mac",
    ]);
    expect(sectionItems(sections, "可用渠道")).toEqual(["Slock"]);
    expect(sectionItems(sections, "负载状态")).toEqual(["暂无负载数据"]);
    expect((detail as { sourceLabels?: string[] })?.sourceLabels).toBeUndefined();
  });
});

function detailSections(detail: unknown): Array<{ title: string; items: string[] }> {
  if (!detail || typeof detail !== "object" || !("sections" in detail)) return [];
  return (detail as { sections: Array<{ title: string; items: string[] }> }).sections;
}

function sectionItems(sections: Array<{ title: string; items: string[] }>, title: string): string[] {
  return sections.find((section) => section.title === title)?.items ?? [];
}
