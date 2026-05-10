import { describe, expect, it } from "vitest";
import {
  mapMulticaWorkState,
  mapOpenClawWorkState,
  mapSlockWorkState,
} from "./runtime-work-state-adapters";
import {
  multicaWorkStateFixture,
  openClawWorkStateFixture,
  slockWorkStateFixture,
} from "./runtime-work-state-fixtures";
import type { RuntimeWorkStateSnapshot } from "./runtime-work-state";
import { createRuntimeWorkBoard } from "./runtime-work-state-query";

const snapshot: RuntimeWorkStateSnapshot = {
  observedAt: "2026-05-09T08:00:00.000Z",
  deviceId: "fixture-device",
  workItems: [
    ...mapOpenClawWorkState(openClawWorkStateFixture).workItems,
    ...mapMulticaWorkState(multicaWorkStateFixture).workItems,
    ...mapSlockWorkState(slockWorkStateFixture).workItems,
  ],
  conversations: [
    ...mapOpenClawWorkState(openClawWorkStateFixture).conversations,
    ...mapMulticaWorkState(multicaWorkStateFixture).conversations,
    ...mapSlockWorkState(slockWorkStateFixture).conversations,
  ],
  executions: [
    ...mapOpenClawWorkState(openClawWorkStateFixture).executions,
    ...mapMulticaWorkState(multicaWorkStateFixture).executions,
    ...mapSlockWorkState(slockWorkStateFixture).executions,
  ],
  capabilities: [
    ...mapOpenClawWorkState(openClawWorkStateFixture).capabilities,
    ...mapMulticaWorkState(multicaWorkStateFixture).capabilities,
    ...mapSlockWorkState(slockWorkStateFixture).capabilities,
  ],
};

describe("runtime work state query", () => {
  it("shows only real work-item cards without platform listening placeholders", () => {
    const board = createRuntimeWorkBoard(snapshot);

    expect(board.lanes.map((lane) => lane.stage)).toEqual(["pending", "processing", "review", "closed", "attention"]);
    expect(board.lanes.find((lane) => lane.stage === "pending")?.items.map((item) => item.title)).toContain(
      "Unstarted example task",
    );
    expect(board.lanes.find((lane) => lane.stage === "processing")?.items.some((item) => item.confidence === "direct")).toBe(
      true,
    );
    expect(board.visibleItems.every((item) => item.kind === "work_item")).toBe(true);
    expect(board.visibleItems.some((item) => item.title.startsWith("OpenClaw execution"))).toBe(false);
    expect(board.visibleItems.some((item) => item.title.includes("监听"))).toBe(false);

    const slockCard = board.visibleItems.find((item) => item.title === "Example in progress card");
    expect(slockCard).toMatchObject({
      runtimeLabel: "Slock",
      channelKindLabel: "Slock",
      creatorLabel: "@fixture-human",
      assigneeLabel: "@example-agent",
      channelLabel: "#example-board",
      requestExcerpt: "Example in progress card",
      stage: "processing",
      confidence: "direct",
    });
    expect(slockCard?.executionStatus).toBeUndefined();
  });

  it("uses the linked OpenClaw agent id when an item has no explicit assignee", () => {
    const openClawOnly = mapOpenClawWorkState(openClawWorkStateFixture);
    const board = createRuntimeWorkBoard({
      observedAt: "2026-05-09T08:00:00.000Z",
      deviceId: "fixture-device",
      workItems: openClawOnly.workItems,
      conversations: openClawOnly.conversations,
      executions: openClawOnly.executions,
      capabilities: openClawOnly.capabilities,
    });

    expect(board.visibleItems).not.toHaveLength(0);
    expect(board.visibleItems.every((item) => item.assigneeLabel === "main")).toBe(true);
  });

  it("uses the latest linked execution when a work item has multiple attempts", () => {
    const board = createRuntimeWorkBoard({
      observedAt: "2026-05-09T08:00:00.000Z",
      deviceId: "fixture-device",
      workItems: [
        {
          id: "fixture-openclaw-work-item",
          source: "openclaw",
          externalId: "fixture-openclaw-work-item",
          title: "Retry succeeds later",
          status: "in_progress",
          runtimeId: "fixture-device:openclaw:gateway",
          agentId: "fixture-device:openclaw:gateway:agent:main",
        },
      ],
      conversations: [],
      executions: [
        {
          id: "fixture-openclaw-execution-old",
          source: "openclaw",
          externalId: "old",
          runtimeId: "fixture-device:openclaw:gateway",
          agentId: "fixture-device:openclaw:gateway:agent:main",
          workItemId: "fixture-openclaw-work-item",
          status: "failed",
          lastSeenAt: "2026-05-09T08:00:00.000Z",
        },
        {
          id: "fixture-openclaw-execution-new",
          source: "openclaw",
          externalId: "new",
          runtimeId: "fixture-device:openclaw:gateway",
          agentId: "fixture-device:openclaw:gateway:agent:main",
          workItemId: "fixture-openclaw-work-item",
          status: "succeeded",
          lastSeenAt: "2026-05-09T08:05:00.000Z",
        },
      ],
      capabilities: [],
    });

    expect(board.visibleItems[0]).toMatchObject({
      title: "Retry succeeds later",
      stage: "closed",
      executionStatus: "succeeded",
    });
  });

  it("keeps raw DingTalk conversation ids out of board-facing group labels", () => {
    const board = createRuntimeWorkBoard({
      observedAt: "2026-05-09T08:00:00.000Z",
      deviceId: "fixture-device",
      workItems: [
        {
          id: "fixture-openclaw-dingtalk-fallback",
          source: "openclaw",
          externalId: "fixture-openclaw-dingtalk-fallback",
          title: "Message from an unmapped DingTalk group",
          status: "done",
          channel: {
            kind: "dingtalk",
            label: "DingTalk 群聊 cid4G5KcuCR0Op9eL9yDpGO1O+Y4Sq2M1vWtjO5wKS8wsg=",
            externalId: "cid4G5KcuCR0Op9eL9yDpGO1O+Y4Sq2M1vWtjO5wKS8wsg=",
          },
        },
        {
          id: "fixture-openclaw-dingtalk-compact-fallback",
          source: "openclaw",
          externalId: "fixture-openclaw-dingtalk-compact-fallback",
          title: "Message from a compacted DingTalk group id",
          status: "done",
          channel: {
            kind: "dingtalk",
            label: "DingTalk 群聊 cidX02...6Ew=",
            externalId: "cidX02kx5Ggk9qxIW+JQHoovcDXXrImZd8c8zvepIik6Ew=",
          },
        },
        {
          id: "fixture-openclaw-dingtalk-direct-fallback",
          source: "openclaw",
          externalId: "fixture-openclaw-dingtalk-direct-fallback",
          title: "Message from an unmapped DingTalk direct chat",
          status: "done",
          channel: {
            kind: "dingtalk",
            label: "DingTalk 私聊 040308...5013",
            externalId: "0403085742945013",
          },
        },
      ],
      conversations: [],
      executions: [],
      capabilities: [],
    });

    const fullIdFallback = board.visibleItems.find((item) => item.title === "Message from an unmapped DingTalk group");
    const compactIdFallback = board.visibleItems.find((item) => item.title === "Message from a compacted DingTalk group id");
    const directFallback = board.visibleItems.find((item) => item.title === "Message from an unmapped DingTalk direct chat");
    expect(fullIdFallback?.channelLabel).toBe("DingTalk 群聊（名称待补全）");
    expect(fullIdFallback?.channelLabel).not.toContain("cid4G5");
    expect(compactIdFallback?.channelLabel).toBe("DingTalk 群聊（名称待补全）");
    expect(compactIdFallback?.channelLabel).not.toContain("cidX02");
    expect(directFallback?.channelLabel).toBe("DingTalk 私聊");
    expect(directFallback?.channelLabel).not.toContain("040308");
  });

  it("summarizes confidence and unsupported capability signals", () => {
    const board = createRuntimeWorkBoard(snapshot);

    expect(board.summary.totalItems).toBe(snapshot.workItems.length);
    expect(board.summary.partialItems).toBe(0);
    expect(board.summary.unsupportedCapabilities).toBe(1);
    expect(board.capabilityNotes.some((note) => note.source === "slock" && note.surface === "executions")).toBe(true);
  });

  it("treats Slock in_progress task-board cards as processing without linked executions", () => {
    const slockOnly = mapSlockWorkState({
      ...slockWorkStateFixture,
      activities: [],
    });
    const board = createRuntimeWorkBoard({
      observedAt: "2026-05-09T08:00:00.000Z",
      deviceId: "fixture-device",
      workItems: slockOnly.workItems,
      conversations: slockOnly.conversations,
      executions: slockOnly.executions,
      capabilities: slockOnly.capabilities,
    }, {
      source: "slock",
      stage: "processing",
      confidence: "direct",
    });

    expect(board.visibleItems).toHaveLength(1);
    expect(board.visibleItems[0]).toMatchObject({
      title: "Example in progress card",
      source: "slock",
      stage: "processing",
      confidence: "direct",
      executionStatus: undefined,
    });
  });

  it("filters by source, stage, confidence, and search text", () => {
    const board = createRuntimeWorkBoard(snapshot, {
      source: "slock",
      stage: "processing",
      confidence: "direct",
      search: "progress",
    });

    expect(board.visibleItems).toHaveLength(1);
    expect(board.visibleItems[0]).toMatchObject({
      source: "slock",
      stage: "processing",
      confidence: "direct",
      title: "Example in progress card",
    });
  });

  it("keeps platform capability gaps out of Runs cards when task-board data is unavailable", () => {
    const board = createRuntimeWorkBoard({
      observedAt: "2026-05-09T08:00:00.000Z",
      deviceId: "fixture-device",
      workItems: [],
      conversations: [],
      executions: [],
      capabilities: [{
        source: "slock",
        collectedAt: "2026-05-09T08:00:00.000Z",
        workItems: {
          support: "unknown",
          strategies: ["local_state"],
          evidence: ["workspace exists"],
          limitations: ["workspace does not expose task board"],
        },
        conversations: {
          support: "unknown",
          strategies: ["local_state"],
          evidence: ["workspace exists"],
          limitations: ["workspace does not expose conversations"],
        },
        executions: {
          support: "unknown",
          strategies: ["local_state"],
          evidence: ["workspace exists"],
          limitations: ["workspace does not expose executions"],
        },
      }],
    }, { source: "slock" });

    expect(board.visibleItems).toEqual([]);
    expect(board.capabilityNotes).toContainEqual(expect.objectContaining({
      source: "slock",
      surface: "workItems",
      support: "unknown",
    }));
  });
});
