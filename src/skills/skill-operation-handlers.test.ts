import { describe, expect, it, vi } from "vitest";
import { createSkillOperationJobHandlers } from "./skill-operation-handlers";
import type { SkillAssignmentRow, SkillGovernanceStore, SkillSyncJobRow } from "./skill-governance-store";
import type { SkillStore } from "./skill-store";

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

  it("dispatches approved Skill assignments to the connected target device", async () => {
    const governanceStore = createFakeGovernanceStore();
    const skillStore = createFakeSkillStore();
    const controlChannel = {
      requestSkillSync: vi.fn(() => ({
        commandId: "cmd-sync-1",
        createdAt: "2026-05-14T12:02:00.000Z",
        deviceId: "fixture-mac",
        sentAt: "2026-05-14T12:02:00.000Z",
        status: "sent" as const,
        type: "skill.sync" as const,
      })),
      waitForCommandResult: vi.fn(async () => ({
        commandId: "cmd-sync-1",
        completedAt: "2026-05-14T12:02:03.000Z",
        createdAt: "2026-05-14T12:02:00.000Z",
        deviceId: "fixture-mac",
        result: { writtenFiles: 1 },
        sentAt: "2026-05-14T12:02:00.000Z",
        status: "succeeded" as const,
        type: "skill.sync" as const,
      })),
    };
    const handlers = createSkillOperationJobHandlers({
      controlChannel,
      governanceStore,
      skillStore,
    });

    await expect(handlers.skill_sync?.({
      id: "opjob_1",
      operationId: "op_1",
      payload: { assignmentId: "assignment_1" },
    } as never)).resolves.toEqual({ status: "succeeded" });

    expect(governanceStore.createSkillSyncJob).toHaveBeenCalledWith(expect.objectContaining({
      assignmentId: "assignment_1",
      operationId: "op_1",
      targetId: "fixture-mac:codex:local:agent:main",
    }));
    expect(controlChannel.requestSkillSync).toHaveBeenCalledWith("fixture-mac", expect.objectContaining({
      files: [expect.objectContaining({ path: "SKILL.md" })],
      skillSlug: "shared-skill",
      targetType: "agent",
    }));
    expect(governanceStore.finishSkillSyncJob).toHaveBeenCalledWith({
      status: "succeeded",
      syncJobId: "syncjob_1",
    });
  });

  it("marks Skill sync failed when the target device command cannot be dispatched", async () => {
    const governanceStore = createFakeGovernanceStore();
    const controlChannel = {
      requestSkillSync: vi.fn(() => {
        throw new Error("device is not connected: fixture-mac");
      }),
      waitForCommandResult: vi.fn(),
    };
    const handlers = createSkillOperationJobHandlers({
      controlChannel,
      governanceStore,
      skillStore: createFakeSkillStore(),
    });

    await expect(handlers.skill_sync?.({
      id: "opjob_1",
      operationId: "op_1",
      payload: { assignmentId: "assignment_1" },
    } as never)).rejects.toThrow("device is not connected: fixture-mac");

    expect(controlChannel.waitForCommandResult).not.toHaveBeenCalled();
    expect(governanceStore.finishSkillSyncJob).toHaveBeenCalledWith({
      errorSummary: "device is not connected: fixture-mac",
      status: "failed",
      syncJobId: "syncjob_1",
    });
  });
});

function createFakeSkillStore(): Pick<SkillStore, "readSkillDetail" | "readSkillVersionFiles"> {
  return {
    readSkillDetail: vi.fn(async () => ({
      files: [],
      skill: {
        archivedAt: null,
        createdAt: new Date("2026-05-14T12:00:00.000Z"),
        description: "Shared rules",
        id: "skill_1",
        name: "Shared Skill",
        organizationId: "organization_1",
        ownerUserId: "user_1",
        slug: "shared-skill",
        source: { type: "upload_md" as const },
        status: "published" as const,
        updatedAt: new Date("2026-05-14T12:00:00.000Z"),
      },
      versions: [
        {
          createdAt: new Date("2026-05-14T12:00:00.000Z"),
          createdByUserId: "user_1",
          id: "version_1",
          packageHash: "sha256:package",
          publishedAt: new Date("2026-05-14T12:01:00.000Z"),
          publishedByUserId: "owner_1",
          skillId: "skill_1",
          summary: null,
          validationResult: { status: "passed" as const, issues: [] },
          validationStatus: "passed" as const,
          version: "1",
        },
      ],
    })),
    readSkillVersionFiles: vi.fn(async () => [
      {
        content: "# Shared Skill\n",
        contentHash: "sha256:file",
        createdAt: new Date("2026-05-14T12:00:00.000Z"),
        id: "file_1",
        path: "SKILL.md",
        sizeBytes: 15,
        skillVersionId: "version_1",
      },
    ]),
  };
}

function createFakeGovernanceStore(): Pick<
  SkillGovernanceStore,
  | "createSkillAssignment"
  | "createSkillSyncJob"
  | "finishSkillSyncJob"
  | "publishSkillVersion"
  | "readSkillAssignment"
  | "updateSkillSyncJobCommand"
> {
  const syncJob: SkillSyncJobRow = {
    action: "sync",
    assignmentId: "assignment_1",
    commandId: null,
    createdAt: new Date("2026-05-14T12:02:00.000Z"),
    errorSummary: null,
    finishedAt: null,
    id: "syncjob_1",
    jobId: "opjob_1",
    operationId: "op_1",
    organizationId: "organization_1",
    packageHash: "sha256:package",
    startedAt: new Date("2026-05-14T12:02:00.000Z"),
    status: "running",
    targetId: "fixture-mac:codex:local:agent:main",
    targetType: "agent",
  };
  const assignment: SkillAssignmentRow = {
    approvedByUserId: "owner_1",
    createdAt: new Date("2026-05-14T12:00:00.000Z"),
    createdByUserId: "user_1",
    id: "assignment_1",
    lastSyncJobId: null,
    organizationId: "organization_1",
    skillId: "skill_1",
    skillVersionId: "version_1",
    status: "approved",
    targetId: "fixture-mac:codex:local:agent:main",
    targetType: "agent",
    updatedAt: new Date("2026-05-14T12:00:00.000Z"),
  };
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
    createSkillSyncJob: vi.fn(async (input) => ({
      ...syncJob,
      action: input.action,
      assignmentId: input.assignmentId ?? null,
      jobId: input.jobId ?? null,
      operationId: input.operationId ?? null,
      organizationId: input.organizationId,
      packageHash: input.packageHash ?? null,
      targetId: input.targetId,
      targetType: input.targetType,
    })),
    finishSkillSyncJob: vi.fn(async (input) => ({
      ...syncJob,
      errorSummary: input.errorSummary ?? null,
      finishedAt: new Date("2026-05-14T12:03:00.000Z"),
      status: input.status,
    })),
    publishSkillVersion: vi.fn(async () => {}),
    readSkillAssignment: vi.fn(async () => assignment),
    updateSkillSyncJobCommand: vi.fn(async (input) => ({
      ...syncJob,
      commandId: input.commandId,
    })),
  };
}
