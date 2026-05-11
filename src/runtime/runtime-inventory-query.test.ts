import { describe, expect, it } from "vitest";
import fixtureSnapshot from "../../fixtures/runtime/collector-snapshot.sample.json";
import {
  deriveRuntimeOperatingStatus,
  formatRuntimeTimestamp,
  filterRuntimeFleet,
  getRuntimeFleetDetail,
  runtimeOperatingStatusLabels,
  runtimeDisplayName,
  listRuntimeFleetHealthOptions,
  listRuntimeFleetRuntimeKindOptions,
  summarizeRuntimeFleet,
} from "./runtime-inventory-query";
import type { RuntimeInventorySnapshot } from "./runtime-normalize";
import type { RuntimeWorkStateSnapshot } from "./runtime-work-state";

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

  it("lists Runtime Fleet filter options from the current snapshot", () => {
    expect(listRuntimeFleetRuntimeKindOptions(snapshot).map((option) => option.value)).toEqual([
      "openclaw",
      "slock",
    ]);
    expect(listRuntimeFleetHealthOptions(snapshot).map((option) => option.value)).toEqual(["online"]);
  });

  it("derives Runtime operating status from Agent work state without using platform raw states", () => {
    const slockRuntime = snapshot.runtimes.find((runtime) => runtime.kind === "slock");
    if (!slockRuntime) throw new Error("missing Slock runtime fixture");
    const workState: RuntimeWorkStateSnapshot = {
      observedAt: "2026-05-09T08:00:00.000Z",
      deviceId: snapshot.device.id,
      workItems: [
        {
          id: "fixture-slock-task-1",
          source: "slock",
          externalId: "fixture-slock-task-1",
          title: "Example in progress card",
          status: "in_progress",
          runtimeId: slockRuntime.id,
          agentId: "fixture-mac:slock:slock-daemon:agent:tester",
        },
      ],
      conversations: [],
      executions: [],
      capabilities: [],
    };

    expect(deriveRuntimeOperatingStatus(snapshot, slockRuntime, workState)).toBe("working");
    expect(runtimeOperatingStatusLabels.working).toBe("工作中");
  });

  it("marks an online Runtime idle only when the adapter can observe that it has no processing work", () => {
    const slockRuntime = snapshot.runtimes.find((runtime) => runtime.kind === "slock");
    if (!slockRuntime) throw new Error("missing Slock runtime fixture");
    const idleWorkState: RuntimeWorkStateSnapshot = {
      observedAt: "2026-05-09T08:00:00.000Z",
      deviceId: snapshot.device.id,
      workItems: [],
      conversations: [],
      executions: [],
      capabilities: [
        {
          source: "slock",
          collectedAt: "2026-05-09T08:00:00.000Z",
          workItems: { support: "supported", strategies: ["native_api"], evidence: [], limitations: [] },
          conversations: { support: "partial", strategies: ["native_api"], evidence: [], limitations: [] },
          executions: { support: "unknown", strategies: ["native_api"], evidence: [], limitations: [] },
        },
      ],
    };

    expect(deriveRuntimeOperatingStatus(snapshot, slockRuntime, idleWorkState)).toBe("idle");
    expect(deriveRuntimeOperatingStatus(snapshot, slockRuntime, undefined)).toBe("unknown");
  });

  it("treats linked non-processing work evidence as enough to mark a Runtime idle", () => {
    const slockRuntime = snapshot.runtimes.find((runtime) => runtime.kind === "slock");
    if (!slockRuntime) throw new Error("missing Slock runtime fixture");
    const closedWorkState: RuntimeWorkStateSnapshot = {
      observedAt: "2026-05-09T08:00:00.000Z",
      deviceId: snapshot.device.id,
      workItems: [
        {
          id: "fixture-slock-task-3",
          source: "slock",
          externalId: "fixture-slock-task-3",
          title: "Example done card",
          status: "done",
          runtimeId: slockRuntime.id,
          agentId: "fixture-mac:slock:slock-daemon:agent:tester",
        },
      ],
      conversations: [],
      executions: [],
      capabilities: [],
    };

    expect(deriveRuntimeOperatingStatus(snapshot, slockRuntime, closedWorkState)).toBe("idle");
  });

  it("uses latest execution evidence when deriving Runtime operating status", () => {
    const openClawRuntime = snapshot.runtimes.find((runtime) => runtime.kind === "openclaw");
    if (!openClawRuntime) throw new Error("missing OpenClaw runtime fixture");
    const completedWorkState: RuntimeWorkStateSnapshot = {
      observedAt: "2026-05-09T08:00:00.000Z",
      deviceId: snapshot.device.id,
      workItems: [
        {
          id: "fixture-openclaw-work-item",
          source: "openclaw",
          externalId: "fixture-openclaw-work-item",
          title: "Retry eventually succeeded",
          status: "in_progress",
          runtimeId: openClawRuntime.id,
          agentId: "fixture-mac:openclaw:gateway-18789:agent:main",
        },
      ],
      conversations: [],
      executions: [
        {
          id: "fixture-openclaw-execution-old",
          source: "openclaw",
          externalId: "old",
          runtimeId: openClawRuntime.id,
          agentId: "fixture-mac:openclaw:gateway-18789:agent:main",
          workItemId: "fixture-openclaw-work-item",
          status: "running",
          lastSeenAt: "2026-05-09T08:00:00.000Z",
        },
        {
          id: "fixture-openclaw-execution-new",
          source: "openclaw",
          externalId: "new",
          runtimeId: openClawRuntime.id,
          agentId: "fixture-mac:openclaw:gateway-18789:agent:main",
          workItemId: "fixture-openclaw-work-item",
          status: "succeeded",
          lastSeenAt: "2026-05-09T08:05:00.000Z",
        },
      ],
      capabilities: [],
    };

    expect(deriveRuntimeOperatingStatus(snapshot, openClawRuntime, completedWorkState)).toBe("idle");
  });

  it("keeps offline Runtime status separate from Agent work-board stages", () => {
    const slockRuntime = snapshot.runtimes.find((runtime) => runtime.kind === "slock");
    if (!slockRuntime) throw new Error("missing Slock runtime fixture");
    const offlineSnapshot: RuntimeInventorySnapshot = {
      ...snapshot,
      device: { ...snapshot.device, status: "offline" },
    };

    expect(deriveRuntimeOperatingStatus(offlineSnapshot, slockRuntime, undefined)).toBe("offline");
  });

  it("filters runtimes and agents by query", () => {
    const result = filterRuntimeFleet(snapshot, { query: "tester" });

    expect(result.runtimes).toEqual([]);
    expect(result.agents.map((agent) => agent.name)).toEqual(["tester"]);
  });

  it("filters agents by runtime kind without dropping device context", () => {
    const result = filterRuntimeFleet(snapshot, { runtimeKind: "slock" });

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

  it("derives Slock Agent display status from task-board assignee evidence", () => {
    const detail = getRuntimeFleetDetail(
      snapshot,
      "agent",
      "fixture-mac:slock:slock-daemon:agent:tester",
      {
        observedAt: "2026-05-09T08:00:00.000Z",
        deviceId: snapshot.device.id,
        workItems: [
          {
            id: "fixture-slock-task-1",
            source: "slock",
            externalId: "fixture-slock-task-1",
            title: "Slock board card assigned to tester",
            status: "in_progress",
            runtimeId: "fixture-mac:slock:slock-daemon",
            agentId: "fixture-mac:slock:slock-daemon:agent:workspace-owner",
            assignee: { kind: "agent", label: "tester" },
          },
        ],
        conversations: [],
        executions: [],
        capabilities: [],
      },
    );

    expect(detail).toMatchObject({
      kind: "agent",
      title: "tester",
      status: "active",
      statusLabel: "活跃",
      subtitle: "Slock · 活跃",
    });
    expect(sectionItems(detailSections(detail), "身份信息")).toContain("状态: 活跃");
  });

  it("aggregates Agent runtime statistics from linked work-state evidence", () => {
    const detail = getRuntimeFleetDetail(
      snapshot,
      "agent",
      "fixture-mac:slock:slock-daemon:agent:tester",
      {
        observedAt: "2026-05-09T08:00:00.000Z",
        deviceId: snapshot.device.id,
        workItems: [
          {
            id: "fixture-slock-task-running",
            source: "slock",
            externalId: "fixture-slock-task-running",
            title: "Running Slock board card",
            status: "in_progress",
            runtimeId: "fixture-mac:slock:slock-daemon",
            agentId: "fixture-mac:slock:slock-daemon:agent:workspace-owner",
            assignee: { kind: "agent", label: "tester" },
            conversationId: "fixture-mac:slock:slock-daemon:conversation:thread-running",
          },
          {
            id: "fixture-slock-task-queued",
            source: "slock",
            externalId: "fixture-slock-task-queued",
            title: "Queued Slock board card",
            status: "todo",
            runtimeId: "fixture-mac:slock:slock-daemon",
            agentId: "fixture-mac:slock:slock-daemon:agent:workspace-owner",
            assignee: { kind: "agent", label: "tester" },
            conversationId: "fixture-mac:slock:slock-daemon:conversation:thread-queued",
          },
        ],
        conversations: [
          {
            id: "fixture-mac:slock:slock-daemon:conversation:thread-running",
            source: "slock",
            externalId: "thread-running",
            status: "open",
            runtimeId: "fixture-mac:slock:slock-daemon",
            agentId: "fixture-mac:slock:slock-daemon:agent:workspace-owner",
            workItemId: "fixture-slock-task-running",
          },
          {
            id: "fixture-mac:slock:slock-daemon:conversation:thread-queued",
            source: "slock",
            externalId: "thread-queued",
            status: "closed",
            runtimeId: "fixture-mac:slock:slock-daemon",
            agentId: "fixture-mac:slock:slock-daemon:agent:workspace-owner",
            workItemId: "fixture-slock-task-queued",
          },
        ],
        executions: [],
        capabilities: [],
      },
    );

    expect(sectionItems(detailSections(detail), "运行统计")).toEqual([
      "活跃任务: 1",
      "队列深度: 1",
      "活跃会话: 1",
      "历史会话: 2",
      "最大并发: 不支持采集",
    ]);
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

  it("resolves runtime detail around ownership without agent workload statistics", () => {
    const detail = getRuntimeFleetDetail(snapshot, "runtime", "fixture-mac:openclaw:gateway-18789");
    const sections = detailSections(detail);

    expect(sectionItems(sections, "身份信息")).toEqual([
      "Runtime ID: fixture-mac:openclaw:gateway-18789",
      "Runtime: OpenClaw",
      "Version: 2026.4.27",
      "可用性: 在线",
      "运行状态: 未知",
      `最近同步: ${fixtureLastSeenAt}`,
    ]);
    expect(sectionItems(sections, "归属关系")).toEqual(["所属设备: Fixture Mac", "Agent 数量: 1"]);
    expect(sectionItems(sections, "运行入口")).toEqual([]);
    expect(sectionItems(sections, "运行统计")).toEqual([]);
    expect((detail as { capabilities?: string[] })?.capabilities).toBeUndefined();
    expect((detail as { channelLabels?: string[] })?.channelLabels).toBeUndefined();
  });

  it("resolves agent detail around runtime ownership and channel exposure", () => {
    const detail = getRuntimeFleetDetail(snapshot, "agent", "fixture-mac:slock:slock-daemon:agent:tester");
    const sections = detailSections(detail);

    expect(sectionItems(sections, "身份信息")).toEqual([
      "Agent ID: fixture-mac:slock:slock-daemon:agent:tester",
      "Runtime: Slock",
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
