import { describe, expect, it } from "vitest";
import {
  createRuntimeListeningAcceptanceReport,
  getRuntimeListeningProfile,
} from "./runtime-listening-acceptance";
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

const openclaw = mapOpenClawWorkState(openClawWorkStateFixture);
const multica = mapMulticaWorkState(multicaWorkStateFixture);
const slock = mapSlockWorkState(slockWorkStateFixture);

const fixtureSnapshot: RuntimeWorkStateSnapshot = {
  observedAt: "2026-05-09T08:00:00.000Z",
  deviceId: "fixture-device",
  workItems: [...openclaw.workItems, ...multica.workItems, ...slock.workItems],
  conversations: [...openclaw.conversations, ...multica.conversations, ...slock.conversations],
  executions: [...openclaw.executions, ...multica.executions, ...slock.executions],
  capabilities: [...openclaw.capabilities, ...multica.capabilities, ...slock.capabilities],
};

describe("runtime listening acceptance", () => {
  it("defines source-specific listening and lane policies", () => {
    expect(getRuntimeListeningProfile("openclaw")).toMatchObject({
      source: "openclaw",
      role: "execution_source",
      runsBoardPolicy: "requires_upstream_work_item",
      supportedStandaloneStages: ["processing", "closed", "attention"],
    });

    expect(getRuntimeListeningProfile("multica")).toMatchObject({
      source: "multica",
      role: "work_item_and_execution_source",
      runsBoardPolicy: "work_item_cards",
      supportedStandaloneStages: ["pending", "processing", "review", "closed", "attention"],
    });

    expect(getRuntimeListeningProfile("slock")).toMatchObject({
      source: "slock",
      role: "work_item_source",
      runsBoardPolicy: "task_board_cards",
      executionRule: "execution requires activity, event, observer, or proxy evidence; server active is not enough",
    });
  });

  it("marks fixture-backed Multica and Slock work items as runs-board usable", () => {
    const report = createRuntimeListeningAcceptanceReport(fixtureSnapshot);

    expect(report.sources.multica.readiness).toBe("ready_for_runs");
    expect(report.sources.multica.fields.creator).toBe("supported");
    expect(report.sources.multica.fields.assigneeAgent).toBe("supported");
    expect(report.sources.multica.fields.requestExcerpt).toBe("supported");
    expect(report.sources.multica.fields.executionStatus).toBe("supported");

    expect(report.sources.slock.readiness).toBe("ready_for_runs");
    expect(report.sources.slock.fields.channel).toBe("supported");
    expect(report.sources.slock.fields.conversationLink).toBe("supported");
    expect(report.sources.slock.fields.executionStatus).toBe("unknown");
  });

  it("keeps OpenClaw as execution-only until an upstream task source links it", () => {
    const report = createRuntimeListeningAcceptanceReport(fixtureSnapshot);

    expect(report.sources.openclaw.readiness).toBe("execution_only");
    expect(report.sources.openclaw.fields.executionStatus).toBe("supported");
    expect(report.sources.openclaw.fields.workItemStatus).toBe("unsupported");
    expect(report.sources.openclaw.gaps).toContain("缺少上游 WorkItem 关联，不能单独进入 Runs 任务泳道");
  });

  it("flags Slock workspace-only snapshots as not ready for real task listening", () => {
    const snapshot: RuntimeWorkStateSnapshot = {
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
          evidence: ["~/.slock/agents exists"],
          limitations: ["Workspace files prove local agent presence, not task board state."],
        },
        conversations: {
          support: "unknown",
          strategies: ["local_state"],
          evidence: ["~/.slock/agents exists"],
          limitations: ["Workspace files do not expose channel history."],
        },
        executions: {
          support: "unknown",
          strategies: ["local_state"],
          evidence: ["~/.slock/agents exists"],
          limitations: ["Workspace files do not expose execution state."],
        },
      }],
      warnings: ["Slock work-state probe unavailable: slock command not found."],
    };

    const report = createRuntimeListeningAcceptanceReport(snapshot);

    expect(report.sources.slock.readiness).toBe("not_ready");
    expect(report.sources.slock.gaps).toContain("缺少 Slock task board 或 API adapter，不能确认任务卡、群组和发起消息");
  });

  it("marks UUID-only Multica participant labels as partial instead of fully readable", () => {
    const snapshot: RuntimeWorkStateSnapshot = {
      observedAt: "2026-05-09T08:00:00.000Z",
      deviceId: "fixture-device",
      workItems: [{
        id: "fixture-device:multica:runtime-openclaw:work-item:issue-1",
        source: "multica",
        externalId: "issue-1",
        title: "Investigate production issue",
        status: "todo",
        creator: { kind: "human", label: "a3e3d268-2427-4a7a-b661-7433585a2b0f" },
        assignee: { kind: "agent", label: "84ef1f10-300b-49d9-9beb-944fde510965" },
        runtimeId: "fixture-device:multica:runtime-openclaw",
        agentId: "fixture-device:multica:runtime-openclaw:agent:fixture-agent",
        lastSeenAt: "2026-05-09T08:00:00.000Z",
      }],
      conversations: [],
      executions: [{
        id: "fixture-device:multica:runtime-openclaw:execution:run-1",
        source: "multica",
        externalId: "run-1",
        runtimeId: "fixture-device:multica:runtime-openclaw",
        agentId: "fixture-device:multica:runtime-openclaw:agent:fixture-agent",
        workItemId: "fixture-device:multica:runtime-openclaw:work-item:issue-1",
        status: "running",
        lastSeenAt: "2026-05-09T08:00:00.000Z",
      }],
      capabilities: [multica.capabilities[0]],
    };

    const report = createRuntimeListeningAcceptanceReport(snapshot);

    expect(report.sources.multica.readiness).toBe("ready_for_runs");
    expect(report.sources.multica.fields.creator).toBe("partial");
    expect(report.sources.multica.fields.assigneeAgent).toBe("partial");
    expect(report.sources.multica.gaps).toContain("creator 字段已监听但缺少可读名称");
    expect(report.sources.multica.gaps).toContain("assigneeAgent 字段已监听但缺少可读名称");
  });
});
