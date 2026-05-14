import type { OperationJobHandler, OperationJobHandlerResult } from "../operations/job-runner";
import type { OperationJobType } from "../operations/operation-store";
import type { SkillAssignmentTargetType, SkillGovernanceStore } from "./skill-governance-store";

/** Dependencies for Skill-related Operation Job handlers. */
export interface SkillOperationJobHandlersOptions {
  governanceStore: Pick<SkillGovernanceStore, "publishSkillVersion" | "createSkillAssignment">;
}

/** Create handlers that apply Skill Operation Jobs to the governance store. */
export function createSkillOperationJobHandlers(
  options: SkillOperationJobHandlersOptions,
): Partial<Record<OperationJobType, OperationJobHandler>> {
  return {
    skill_assign: (job) => handleSkillAssign(options, job.payload),
    skill_publish: (job) => handleSkillPublish(options, job.payload),
  };
}

async function handleSkillPublish(
  options: SkillOperationJobHandlersOptions,
  payload: Record<string, unknown>,
): Promise<OperationJobHandlerResult> {
  await options.governanceStore.publishSkillVersion({
    publishedByUserId: readRequiredString(payload, "publishedByUserId", "skill_publish"),
    skillId: readRequiredString(payload, "skillId", "skill_publish"),
    skillVersionId: readRequiredString(payload, "skillVersionId", "skill_publish"),
  });
  return { status: "succeeded" };
}

async function handleSkillAssign(
  options: SkillOperationJobHandlersOptions,
  payload: Record<string, unknown>,
): Promise<OperationJobHandlerResult> {
  const targetType = readRequiredString(payload, "targetType", "skill_assign");
  if (!isSkillAssignmentTargetType(targetType)) {
    throw new Error(`skill_assign job payload has invalid targetType`);
  }
  await options.governanceStore.createSkillAssignment({
    approvedByUserId: readRequiredString(payload, "approvedByUserId", "skill_assign"),
    createdByUserId: readRequiredString(payload, "createdByUserId", "skill_assign"),
    organizationId: readRequiredString(payload, "organizationId", "skill_assign"),
    skillId: readRequiredString(payload, "skillId", "skill_assign"),
    skillVersionId: readRequiredString(payload, "skillVersionId", "skill_assign"),
    status: "approved",
    targetId: readRequiredString(payload, "targetId", "skill_assign"),
    targetType,
  });
  return { status: "succeeded" };
}

function readRequiredString(payload: Record<string, unknown>, key: string, jobType: OperationJobType): string {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${jobType} job payload missing ${key}`);
  }
  return value.trim();
}

function isSkillAssignmentTargetType(value: string): value is SkillAssignmentTargetType {
  return value === "device" || value === "runtime" || value === "agent";
}
