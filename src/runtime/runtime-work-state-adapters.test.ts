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

describe("runtime work state adapters", () => {
  it("maps OpenClaw as an execution and conversation source without project-management work items", () => {
    const result = mapOpenClawWorkState(openClawWorkStateFixture);

    expect(result.workItems).toEqual([]);
    expect(result.executions.map((item) => item.status)).toContain("succeeded");
    expect(result.executions.map((item) => item.status)).toContain("failed");
    expect(result.conversations[0]).toMatchObject({
      source: "openclaw",
      status: "active",
      agentId: "fixture-device:openclaw:gateway:agent:main",
    });
  });

  it("maps Multica issues and runs into work items and executions", () => {
    const result = mapMulticaWorkState(multicaWorkStateFixture);

    expect(result.workItems.map((item) => item.status)).toContain("todo");
    expect(result.workItems.map((item) => item.status)).toContain("blocked");
    expect(result.executions.map((item) => item.status)).toContain("running");
    expect(result.capabilities[0]).toMatchObject({
      source: "multica",
      workItems: { support: "supported" },
      executions: { support: "supported" },
    });
  });

  it("maps Slock task board state without pretending server active means execution running", () => {
    const result = mapSlockWorkState(slockWorkStateFixture);

    expect(result.workItems.map((item) => item.status)).toContain("in_review");
    expect(result.workItems.map((item) => item.status)).toContain("in_progress");
    expect(result.executions).toEqual([]);
    expect(result.capabilities[0]).toMatchObject({
      source: "slock",
      executions: { support: "unknown" },
    });
  });
});
