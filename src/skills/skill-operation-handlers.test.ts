import { describe, expect, it, vi } from "vitest";
import { createSkillOperationJobHandlers } from "./skill-operation-handlers";
import type { SkillGovernanceStore } from "./skill-governance-store";

describe("Skill operation job handlers", () => {
  it("publishes Skill versions from operation job payloads", async () => {
    const governanceStore = createFakeGovernanceStore();
    const handlers = createSkillOperationJobHandlers({ governanceStore });

    await expect(handlers.skill_publish?.({
      payload: {
        publishedByUserId: "user_1",
        skillId: "skill_1",
        skillVersionId: "version_1",
      },
    } as never)).resolves.toEqual({ status: "succeeded" });

    expect(governanceStore.publishSkillVersion).toHaveBeenCalledWith({
      publishedByUserId: "user_1",
      skillId: "skill_1",
      skillVersionId: "version_1",
    });
  });

  it("creates approved Skill assignments from operation job payloads", async () => {
    const governanceStore = createFakeGovernanceStore();
    const handlers = createSkillOperationJobHandlers({ governanceStore });

    await expect(handlers.skill_assign?.({
      payload: {
        approvedByUserId: "owner_1",
        createdByUserId: "user_1",
        organizationId: "organization_1",
        skillId: "skill_1",
        skillVersionId: "version_1",
        targetId: "agent-main",
        targetType: "agent",
      },
    } as never)).resolves.toEqual({ status: "succeeded" });

    expect(governanceStore.createSkillAssignment).toHaveBeenCalledWith({
      approvedByUserId: "owner_1",
      createdByUserId: "user_1",
      organizationId: "organization_1",
      skillId: "skill_1",
      skillVersionId: "version_1",
      status: "approved",
      targetId: "agent-main",
      targetType: "agent",
    });
  });

  it("fails fast when required payload fields are missing", async () => {
    const handlers = createSkillOperationJobHandlers({ governanceStore: createFakeGovernanceStore() });

    await expect(handlers.skill_publish?.({
      payload: {
        publishedByUserId: "user_1",
        skillId: "skill_1",
      },
    } as never)).rejects.toThrow(
      "skill_publish job payload missing skillVersionId",
    );
  });
});

function createFakeGovernanceStore(): Pick<SkillGovernanceStore, "publishSkillVersion" | "createSkillAssignment"> {
  return {
    createSkillAssignment: vi.fn(async (input) => ({
      approvedByUserId: input.approvedByUserId ?? null,
      createdAt: new Date("2026-05-14T12:00:00.000Z"),
      createdByUserId: input.createdByUserId,
      id: "assignment_1",
      lastSyncJobId: null,
      organizationId: input.organizationId,
      skillId: input.skillId,
      skillVersionId: input.skillVersionId,
      status: input.status,
      targetId: input.targetId,
      targetType: input.targetType,
      updatedAt: new Date("2026-05-14T12:00:00.000Z"),
    })),
    publishSkillVersion: vi.fn(async () => {}),
  };
}
