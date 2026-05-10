import { describe, expect, it } from "vitest";
import {
  deriveRuntimeWorkStage,
  EXECUTION_STATUSES,
  OBSERVATION_STRATEGIES,
  WORK_STAGE_IDS,
  WORK_ITEM_STATUSES,
  type RuntimeObservationCapability,
  type RuntimeWorkStateSnapshot,
} from "./runtime-work-state";

describe("runtime work state model", () => {
  it("keeps business work item state separate from execution state", () => {
    expect(WORK_STAGE_IDS).toEqual(["pending", "processing", "review", "closed", "attention"]);

    expect(WORK_ITEM_STATUSES).toEqual([
      "todo",
      "in_progress",
      "in_review",
      "done",
      "blocked",
      "cancelled",
      "unknown",
    ]);

    expect(EXECUTION_STATUSES).toEqual([
      "queued",
      "running",
      "succeeded",
      "failed",
      "cancelled",
      "unknown",
    ]);
  });

  it("allows adapters to use platform-specific observation strategies", () => {
    expect(OBSERVATION_STRATEGIES).toEqual([
      "native_api",
      "cli",
      "local_state",
      "process",
      "network_proxy",
      "managed_launcher",
      "manual",
    ]);

    const capability: RuntimeObservationCapability = {
      source: "slock",
      collectedAt: "2026-05-09T08:00:00.000Z",
      workItems: {
        support: "partial",
        strategies: ["cli", "native_api"],
        evidence: ["slock task list --channel <channel>"],
        limitations: ["Requires an agent context that can see the channel."],
      },
      conversations: {
        support: "partial",
        strategies: ["cli", "native_api"],
        evidence: ["slock message read --channel <target>"],
        limitations: ["Message history is channel-scoped, not a global execution queue."],
      },
      executions: {
        support: "unknown",
        strategies: ["network_proxy", "managed_launcher"],
        evidence: ["Slock daemon emits agent:activity internally."],
        limitations: ["Server info active means online, not currently running."],
      },
    };

    expect(capability.executions.strategies).toContain("network_proxy");
    expect(capability.executions.support).toBe("unknown");
  });

  it("represents one snapshot containing work items, conversations, and executions", () => {
    const snapshot: RuntimeWorkStateSnapshot = {
      observedAt: "2026-05-09T08:00:00.000Z",
      deviceId: "gezilinll-claw",
      workItems: [
        {
          id: "slock:example-board:50",
          source: "slock",
          externalId: "50",
          title: "Example board task",
          status: "in_progress",
          channel: { kind: "slock", label: "#example-board", externalId: "example-board" },
          assignee: { kind: "agent", label: "@example-agent" },
          creator: { kind: "human", label: "@example-human" },
          lastSeenAt: "2026-05-09T08:00:00.000Z",
        },
      ],
      conversations: [],
      executions: [
        {
          id: "openclaw:run:abc",
          source: "openclaw",
          externalId: "abc",
          runtimeId: "gezilinll-claw:openclaw:gateway-18789",
          agentId: "gezilinll-claw:openclaw:gateway-18789:agent:main",
          status: "running",
          startedAt: "2026-05-09T08:00:00.000Z",
          lastSeenAt: "2026-05-09T08:00:10.000Z",
        },
      ],
      capabilities: [],
    };

    expect(snapshot.workItems[0]?.status).toBe("in_progress");
    expect(snapshot.executions[0]?.status).toBe("running");
  });

  it("maps OpenClaw executions directly to processing, closed, or attention stages", () => {
    expect(deriveRuntimeWorkStage({ source: "openclaw", executionStatus: "running" })).toMatchObject({
      stage: "processing",
      confidence: "direct",
    });
    expect(deriveRuntimeWorkStage({ source: "openclaw", executionStatus: "succeeded" })).toMatchObject({
      stage: "closed",
      confidence: "direct",
    });
    expect(deriveRuntimeWorkStage({ source: "openclaw", executionStatus: "failed" })).toMatchObject({
      stage: "attention",
      confidence: "direct",
    });
    expect(deriveRuntimeWorkStage({ source: "openclaw", workItemStatus: "todo" })).toMatchObject({
      stage: "pending",
      confidence: "partial",
    });
    expect(deriveRuntimeWorkStage({ source: "openclaw", workItemStatus: "in_review" })).toMatchObject({
      stage: "attention",
      confidence: "unsupported",
    });
  });

  it("maps Multica issue and execution data into project-management stages", () => {
    expect(deriveRuntimeWorkStage({ source: "multica", workItemStatus: "todo" })).toMatchObject({
      stage: "pending",
      confidence: "direct",
    });
    expect(deriveRuntimeWorkStage({ source: "multica", workItemStatus: "in_review" })).toMatchObject({
      stage: "review",
      confidence: "direct",
    });
    expect(deriveRuntimeWorkStage({
      source: "multica",
      workItemStatus: "todo",
      executionStatus: "running",
    })).toMatchObject({
      stage: "processing",
      confidence: "direct",
    });
    expect(deriveRuntimeWorkStage({
      source: "multica",
      workItemStatus: "done",
      executionStatus: "failed",
    })).toMatchObject({
      stage: "attention",
      confidence: "direct",
    });
  });

  it("maps Slock task-board state as the v1 Runs authority without requiring execution state", () => {
    expect(deriveRuntimeWorkStage({ source: "slock", workItemStatus: "in_progress" })).toMatchObject({
      stage: "processing",
      confidence: "direct",
    });
    expect(deriveRuntimeWorkStage({ source: "slock", workItemStatus: "in_review" })).toMatchObject({
      stage: "review",
      confidence: "direct",
    });
    expect(deriveRuntimeWorkStage({
      source: "slock",
      workItemStatus: "in_progress",
      executionStatus: "running",
    })).toMatchObject({
      stage: "processing",
      confidence: "direct",
    });
    expect(deriveRuntimeWorkStage({
      source: "slock",
      workItemStatus: "in_progress",
      executionStatus: "failed",
    })).toMatchObject({
      stage: "attention",
      confidence: "direct",
    });
    expect(deriveRuntimeWorkStage({ source: "slock", workItemStatus: "cancelled" })).toMatchObject({
      stage: "closed",
      confidence: "direct",
    });
  });
});
