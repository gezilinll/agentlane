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
  it("uses only work-item backed cards and exposes human-readable task context", () => {
    const board = createRuntimeWorkBoard(snapshot);

    expect(board.lanes.map((lane) => lane.stage)).toEqual(["pending", "processing", "review", "closed", "attention"]);
    expect(board.lanes.find((lane) => lane.stage === "pending")?.items.map((item) => item.title)).toContain(
      "Unstarted example task",
    );
    expect(board.lanes.find((lane) => lane.stage === "processing")?.items.some((item) => item.confidence === "partial")).toBe(
      true,
    );
    expect(board.visibleItems.some((item) => item.source === "openclaw")).toBe(false);

    const slockCard = board.visibleItems.find((item) => item.title === "Example in progress card");
    expect(slockCard).toMatchObject({
      creatorLabel: "@fixture-human",
      assigneeLabel: "@example-agent",
      channelLabel: "#example-board",
      requestExcerpt: "Example in progress card",
    });
  });

  it("summarizes confidence and unsupported capability signals", () => {
    const board = createRuntimeWorkBoard(snapshot);

    expect(board.summary.totalItems).toBe(snapshot.workItems.length);
    expect(board.summary.partialItems).toBeGreaterThan(0);
    expect(board.summary.unsupportedCapabilities).toBeGreaterThan(0);
    expect(board.capabilityNotes.some((note) => note.source === "slock" && note.surface === "executions")).toBe(true);
  });

  it("filters by source, stage, confidence, and search text", () => {
    const board = createRuntimeWorkBoard(snapshot, {
      source: "slock",
      stage: "processing",
      confidence: "partial",
      search: "progress",
    });

    expect(board.visibleItems).toHaveLength(1);
    expect(board.visibleItems[0]).toMatchObject({
      source: "slock",
      stage: "processing",
      confidence: "partial",
      title: "Example in progress card",
    });
  });
});
