import { describe, expect, it } from "vitest";
import { resolveTargetSkillAssignments } from "./skill-effective";
import type { SkillAssignmentRow } from "./skill-governance-store";

describe("resolveTargetSkillAssignments", () => {
  it("treats organization skills as reusable assets and only resolves explicit target assignments", () => {
    const assignments = [
      assignment({ skillId: "skill-a", targetType: "device", targetId: "device-1", status: "synced" }),
      assignment({ skillId: "skill-b", targetType: "runtime", targetId: "runtime-1", status: "approved" }),
      assignment({ skillId: "skill-c", targetType: "agent", targetId: "agent-1", status: "synced" }),
    ];

    const resolved = resolveTargetSkillAssignments({
      assignments,
      targetLineage: [
        { targetType: "device", targetId: "device-1" },
        { targetType: "runtime", targetId: "runtime-1" },
        { targetType: "agent", targetId: "agent-1" },
      ],
    });

    expect(resolved.map((entry) => [entry.skillId, entry.targetType, entry.resolutionState])).toEqual([
      ["skill-a", "device", "installed"],
      ["skill-b", "runtime", "pending_sync"],
      ["skill-c", "agent", "installed"],
    ]);
  });

  it("lets the nearest target assignment override a broader assignment of the same Skill", () => {
    const assignments = [
      assignment({
        skillId: "skill-a",
        skillVersionId: "version-device",
        targetType: "device",
        targetId: "device-1",
        status: "synced",
      }),
      assignment({
        skillId: "skill-a",
        skillVersionId: "version-agent",
        targetType: "agent",
        targetId: "agent-1",
        status: "approved",
      }),
    ];

    const resolved = resolveTargetSkillAssignments({
      assignments,
      targetLineage: [
        { targetType: "device", targetId: "device-1" },
        { targetType: "runtime", targetId: "runtime-1" },
        { targetType: "agent", targetId: "agent-1" },
      ],
    });

    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({
      skillId: "skill-a",
      skillVersionId: "version-agent",
      targetType: "agent",
      resolutionState: "pending_sync",
      overriddenAssignmentIds: ["assignment-device-1-skill-a"],
    });
  });

  it("excludes disabled and unrelated assignments from the target skill set", () => {
    const resolved = resolveTargetSkillAssignments({
      assignments: [
        assignment({ skillId: "skill-a", targetType: "device", targetId: "device-1", status: "disabled" }),
        assignment({ skillId: "skill-b", targetType: "runtime", targetId: "other-runtime", status: "synced" }),
        assignment({ skillId: "skill-c", targetType: "agent", targetId: "agent-1", status: "unsupported" }),
      ],
      targetLineage: [
        { targetType: "device", targetId: "device-1" },
        { targetType: "runtime", targetId: "runtime-1" },
        { targetType: "agent", targetId: "agent-1" },
      ],
    });

    expect(resolved.map((entry) => [entry.skillId, entry.resolutionState])).toEqual([
      ["skill-c", "unsupported"],
    ]);
  });
});

function assignment(
  input: Partial<SkillAssignmentRow> & Pick<SkillAssignmentRow, "skillId" | "targetId" | "targetType" | "status">,
): SkillAssignmentRow {
  const now = new Date("2026-05-16T00:00:00.000Z");
  return {
    approvedByUserId: "owner-1",
    createdAt: now,
    createdByUserId: "owner-1",
    id: `assignment-${input.targetId}-${input.skillId}`,
    lastSyncJobId: null,
    organizationId: "organization-1",
    skillId: input.skillId,
    skillVersionId: input.skillVersionId ?? `version-${input.skillId}`,
    status: input.status,
    targetId: input.targetId,
    targetType: input.targetType,
    updatedAt: now,
  };
}
