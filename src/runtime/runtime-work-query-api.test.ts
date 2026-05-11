import { describe, expect, it } from "vitest";
import {
  createWorkItemsQueryUrl,
  runtimeWorkItemsQueryPageFromResponse,
} from "./runtime-work-query-api";

describe("Runtime work item query API helpers", () => {
  it("adds cursor to backend query URLs", () => {
    const url = createWorkItemsQueryUrl("http://agentlane.local", { source: "slock" }, { cursor: "cursor-1" });

    expect(url.pathname).toBe("/api/runtime-work-items");
    expect(url.searchParams.get("source")).toBe("slock");
    expect(url.searchParams.get("cursor")).toBe("cursor-1");
  });

  it("preserves total and next cursor while converting rows to a snapshot", () => {
    const page = runtimeWorkItemsQueryPageFromResponse({
      items: [{
        id: "work-1",
        externalId: "external-1",
        source: "slock",
        status: "in_progress",
        stage: "processing",
        title: "Inspect task handoff",
        description: "Check the handoff context",
        runtimeId: "runtime-1",
        agentId: "agent-1",
        conversationId: "conversation-1",
        channelKind: "other",
        channelLabel: "#AjisGTD",
        creator: { kind: "human", label: "PMO" },
        assignee: { kind: "agent", label: "tester" },
        lastSeenAt: "2026-05-10T10:00:00.000Z",
      }],
      nextCursor: "cursor-2",
      total: 2,
    });

    expect(page).toMatchObject({
      nextCursor: "cursor-2",
      total: 2,
      snapshot: {
        workItems: [expect.objectContaining({ id: "work-1", title: "Inspect task handoff" })],
      },
    });
  });
});
