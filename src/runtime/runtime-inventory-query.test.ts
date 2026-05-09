import { describe, expect, it } from "vitest";
import fixtureSnapshot from "../../fixtures/runtime/collector-snapshot.sample.json";
import {
  formatRuntimeTimestamp,
  filterRuntimeFleet,
  getRuntimeFleetDetail,
  runtimeDisplayName,
  summarizeRuntimeFleet,
  type RuntimeFleetFilters,
} from "./runtime-inventory-query";
import type { RuntimeInventorySnapshot } from "./runtime-normalize";

const snapshot = fixtureSnapshot as RuntimeInventorySnapshot;
const fixtureLastSeenAt = formatRuntimeTimestamp("2026-05-08T08:00:01.000Z");

describe("runtime inventory query", () => {
  it("summarizes fixture inventory for Runtime Fleet metrics", () => {
    expect(summarizeRuntimeFleet(snapshot)).toEqual({
      devices: 1,
      runtimes: 2,
      onlineRuntimes: 2,
      agents: 2,
      issues: 1,
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
      status: "unknown",
      sections: expect.arrayContaining([
        expect.objectContaining({ title: "关联渠道", items: ["Slock"] }),
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
      "Collector: 0.1.0",
    ]);
    expect(sectionItems(sections, "已注册 Runtime")).toEqual(["OpenClaw Gateway", "Slock daemon"]);
    expect((detail as { sourceLabels?: string[] })?.sourceLabels).toBeUndefined();
  });

  it("resolves runtime detail around ownership and statistics instead of endpoint or table capabilities", () => {
    const detail = getRuntimeFleetDetail(snapshot, "runtime", "fixture-mac:openclaw:gateway-18789");
    const sections = detailSections(detail);

    expect(sectionItems(sections, "身份信息")).toEqual([
      "Runtime ID: fixture-mac:openclaw:gateway-18789",
      "Kind: OpenClaw",
      "Version: 2026.4.27",
      `最近同步: ${fixtureLastSeenAt}`,
    ]);
    expect(sectionItems(sections, "归属关系")).toEqual(["所属设备: Fixture Mac", "Agent 数量: 1"]);
    expect(sectionItems(sections, "运行入口")).toEqual([]);
    expect(sectionItems(sections, "运行统计")).toEqual([
      "活跃任务: 不支持采集",
      "队列深度: 不支持采集",
      "活跃会话: 不支持采集",
      "历史会话: 2",
      "最大并发: 不支持采集",
    ]);
    expect((detail as { capabilities?: string[] })?.capabilities).toBeUndefined();
    expect((detail as { channelLabels?: string[] })?.channelLabels).toBeUndefined();
  });

  it("resolves agent detail around runtime ownership and channel exposure", () => {
    const detail = getRuntimeFleetDetail(snapshot, "agent", "fixture-mac:slock:slock-daemon:agent:tester");
    const sections = detailSections(detail);

    expect(sectionItems(sections, "身份信息")).toEqual([
      "Agent ID: fixture-mac:slock:slock-daemon:agent:tester",
      "来源平台: Slock",
      "状态: 未知",
      `最近同步: ${fixtureLastSeenAt}`,
    ]);
    expect(sectionItems(sections, "归属关系")).toEqual([
      "所属 Runtime: Slock daemon",
      "所属设备: Fixture Mac",
    ]);
    expect(sectionItems(sections, "关联渠道")).toEqual(["Slock"]);
    expect(sectionItems(sections, "运行统计")).toEqual([
      "活跃任务: 不支持采集",
      "队列深度: 不支持采集",
      "活跃会话: 不支持采集",
      "历史会话: 不支持采集",
      "最大并发: 不支持采集",
    ]);
    expect((detail as { sourceLabels?: string[] })?.sourceLabels).toBeUndefined();
  });

  it("falls back agent last sync to its runtime when older snapshots omit agent-level observation time", () => {
    const legacySnapshot: RuntimeInventorySnapshot = {
      ...snapshot,
      agents: snapshot.agents.map((agent) => {
        if (agent.id !== "fixture-mac:slock:slock-daemon:agent:tester") return agent;
        const { lastSeenAt, ...agentWithoutLastSeenAt } = agent;
        void lastSeenAt;
        return agentWithoutLastSeenAt;
      }),
    };

    const detail = getRuntimeFleetDetail(
      legacySnapshot,
      "agent",
      "fixture-mac:slock:slock-daemon:agent:tester",
    );
    const sections = detailSections(detail);

    expect(sectionItems(sections, "身份信息")).toContain(`最近同步: ${fixtureLastSeenAt}`);
  });

  it("formats timestamps for UI display without leaking raw ISO strings", () => {
    const formatted = formatRuntimeTimestamp("2026-05-08T08:00:01.000Z");

    expect(formatted).not.toContain("T");
    expect(formatted).toContain("2026");
    expect(formatted).toContain("16:00");
  });

  it("uses runtime names as the stable display label for agent ownership", () => {
    expect(runtimeDisplayName(snapshot.runtimes[0])).toBe("OpenClaw Gateway");
    expect(runtimeDisplayName(snapshot.runtimes[1])).toBe("Slock daemon");
  });
});

function detailSections(detail: unknown): Array<{ title: string; items: string[] }> {
  if (!detail || typeof detail !== "object" || !("sections" in detail)) return [];
  return (detail as { sections: Array<{ title: string; items: string[] }> }).sections;
}

function sectionItems(sections: Array<{ title: string; items: string[] }>, title: string): string[] {
  return sections.find((section) => section.title === title)?.items ?? [];
}
