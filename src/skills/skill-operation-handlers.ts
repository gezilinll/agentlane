import type { OperationJobHandler, OperationJobHandlerResult } from "../operations/job-runner";
import type { OperationJobRow } from "../operations/operation-store";
import type { OperationJobType } from "../operations/operation-store";
import type {
  RuntimeControlChannel,
  RuntimeSkillSyncFilePayload,
} from "../server/runtime-control-channel";
import type { SkillAssignmentTargetType, SkillGovernanceStore } from "./skill-governance-store";
import type { SkillStore } from "./skill-store";

/** Dependencies for Skill-related Operation Job handlers. */
export interface SkillOperationJobHandlersOptions {
  governanceStore: Pick<
    SkillGovernanceStore,
    | "createSkillAssignment"
    | "createSkillSyncJob"
    | "finishSkillSyncJob"
    | "publishSkillVersion"
    | "readSkillAssignment"
    | "updateSkillSyncJobCommand"
  >;
  skillStore?: Pick<SkillStore, "readSkillDetail" | "readSkillVersionFiles">;
  controlChannel?: Pick<RuntimeControlChannel, "requestSkillSync" | "waitForCommandResult">;
  commandTimeoutMs?: number;
}

/** Create handlers that apply Skill Operation Jobs to the governance store. */
export function createSkillOperationJobHandlers(
  options: SkillOperationJobHandlersOptions,
): Partial<Record<OperationJobType, OperationJobHandler>> {
  return {
    skill_assign: (job) => handleSkillAssign(options, job.payload),
    skill_publish: (job) => handleSkillPublish(options, job.payload),
    skill_sync: (job) => handleSkillSync(options, job),
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

async function handleSkillSync(
  options: SkillOperationJobHandlersOptions,
  job: OperationJobRow,
): Promise<OperationJobHandlerResult> {
  if (!options.skillStore || !options.controlChannel) {
    return {
      manualInstruction: "Skill sync requires the Skill store and device control channel.",
      status: "unsupported",
    };
  }

  const assignmentId = readRequiredString(job.payload, "assignmentId", "skill_sync");
  const assignment = await options.governanceStore.readSkillAssignment({ assignmentId });
  if (!assignment) throw new Error(`skill_sync assignment not found: ${assignmentId}`);

  const skillDetail = await options.skillStore.readSkillDetail({ skillId: assignment.skillId });
  if (!skillDetail) throw new Error(`skill_sync skill not found: ${assignment.skillId}`);

  const version = skillDetail.versions.find((candidate) => candidate.id === assignment.skillVersionId);
  if (!version) throw new Error(`skill_sync version not found: ${assignment.skillVersionId}`);

  const files = await options.skillStore.readSkillVersionFiles({
    skillId: assignment.skillId,
    skillVersionId: assignment.skillVersionId,
  });
  const syncJob = await options.governanceStore.createSkillSyncJob({
    action: "sync",
    assignmentId: assignment.id,
    jobId: job.id,
    operationId: job.operationId,
    organizationId: assignment.organizationId,
    packageHash: version.packageHash,
    targetId: assignment.targetId,
    targetType: assignment.targetType,
  });

  try {
    const command = options.controlChannel.requestSkillSync(resolveTargetDeviceId(assignment.targetId), {
      assignmentId: assignment.id,
      files: files.map(toSkillSyncFilePayload),
      organizationId: assignment.organizationId,
      packageHash: version.packageHash,
      skillId: assignment.skillId,
      skillSlug: skillDetail.skill.slug,
      skillVersionId: assignment.skillVersionId,
      targetId: assignment.targetId,
      targetType: assignment.targetType,
    });
    await options.governanceStore.updateSkillSyncJobCommand({
      commandId: command.commandId,
      syncJobId: syncJob.id,
    });

    const result = await options.controlChannel.waitForCommandResult(command.commandId, {
      timeoutMs: options.commandTimeoutMs ?? 30_000,
    });
    if (result.status === "succeeded") {
      await options.governanceStore.finishSkillSyncJob({
        status: "succeeded",
        syncJobId: syncJob.id,
      });
      return { status: "succeeded" };
    }

    throw new Error(result.error || `Skill sync command ${result.status}`);
  } catch (error) {
    const errorSummary = error instanceof Error ? error.message : String(error);
    await options.governanceStore.finishSkillSyncJob({
      errorSummary,
      status: "failed",
      syncJobId: syncJob.id,
    });
    throw error;
  }
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

function resolveTargetDeviceId(targetId: string): string {
  const deviceId = targetId.split(":")[0]?.trim();
  if (!deviceId) throw new Error("skill_sync targetId cannot resolve device id");
  return deviceId;
}

function toSkillSyncFilePayload(file: {
  content?: string;
  contentHash: string;
  path: string;
  sizeBytes?: number;
}): RuntimeSkillSyncFilePayload {
  const content = file.content ?? "";
  return {
    content,
    contentHash: file.contentHash,
    path: file.path,
    sizeBytes: file.sizeBytes ?? Buffer.byteLength(content, "utf8"),
  };
}
