import type { RuntimeSource } from "./runtime-normalize";
import type {
  RuntimeConversation,
  RuntimeExecution,
  RuntimeObservationCapability,
  RuntimeWorkItem,
  RuntimeWorkStageId,
  RuntimeWorkStateSnapshot,
} from "./runtime-work-state";

/** Fields Lorume needs to make Runs understandable instead of merely debuggable. */
export const RUNTIME_LISTENING_FIELDS = [
  "creator",
  "assigneeAgent",
  "channel",
  "requestExcerpt",
  "workItemStatus",
  "executionStatus",
  "conversationLink",
  "lastSeenAt",
] as const;

/** One normalized field required by Lorume's runtime listening acceptance harness. */
export type RuntimeListeningField = (typeof RUNTIME_LISTENING_FIELDS)[number];

/** Field-level support after checking normalized objects and platform capability reports. */
export type RuntimeListeningFieldSupport = "supported" | "partial" | "unsupported" | "unknown";

/** Source role in Lorume's unified work-state model. */
export type RuntimeListeningSourceRole =
  | "execution_source"
  | "work_item_source"
  | "work_item_and_execution_source";

/** Product rule for whether a source can create cards in Runs. */
export type RuntimeRunsBoardPolicy =
  | "requires_upstream_work_item"
  | "work_item_cards"
  | "task_board_cards";

/** Source-level readiness for Runs and future task management. */
export type RuntimeListeningReadiness = "ready_for_runs" | "execution_only" | "not_ready";

/** Static platform profile reviewed by product and adapter work. */
export interface RuntimeListeningProfile {
  /** Source adapter this profile describes. */
  source: RuntimeSource;
  /** Source role in the normalized Lorume model. */
  role: RuntimeListeningSourceRole;
  /** Whether this source may independently create Runs cards. */
  runsBoardPolicy: RuntimeRunsBoardPolicy;
  /** Work stages this platform can support without inventing upstream state. */
  supportedStandaloneStages: RuntimeWorkStageId[];
  /** Required fields for this source to be considered usable in the Runs board. */
  requiredForRuns: RuntimeListeningField[];
  /** Execution-specific rule that prevents platform-specific overclaiming. */
  executionRule: string;
}

/** Runtime listening acceptance result for one source. */
export interface RuntimeSourceListeningReport {
  /** Static source profile. */
  profile: RuntimeListeningProfile;
  /** Source-level readiness after checking the current snapshot. */
  readiness: RuntimeListeningReadiness;
  /** Field support produced by normalized objects and capabilities. */
  fields: Record<RuntimeListeningField, RuntimeListeningFieldSupport>;
  /** Product-facing gaps that must be closed before treating this source as fully listened. */
  gaps: string[];
}

/** Runtime listening acceptance report for all current target sources. */
export interface RuntimeListeningAcceptanceReport {
  /** Snapshot timestamp assessed by this report. */
  observedAt: string;
  /** Device id assessed by this report. */
  deviceId: string;
  /** Per-source reports in current target order. */
  sources: Record<"openclaw" | "multica" | "slock", RuntimeSourceListeningReport>;
}

const profiles: Record<"openclaw" | "multica" | "slock", RuntimeListeningProfile> = {
  openclaw: {
    source: "openclaw",
    role: "execution_source",
    runsBoardPolicy: "requires_upstream_work_item",
    supportedStandaloneStages: ["pending", "processing", "closed", "attention"],
    requiredForRuns: [
      "creator",
      "assigneeAgent",
      "channel",
      "requestExcerpt",
      "workItemStatus",
      "executionStatus",
      "conversationLink",
      "lastSeenAt",
    ],
    executionRule: "execution status can come from OpenClaw task/run/trajectory state, but pending and review require message or upstream WorkItem context",
  },
  multica: {
    source: "multica",
    role: "work_item_and_execution_source",
    runsBoardPolicy: "work_item_cards",
    supportedStandaloneStages: ["pending", "processing", "review", "closed", "attention"],
    requiredForRuns: ["creator", "assigneeAgent", "requestExcerpt", "workItemStatus", "executionStatus", "lastSeenAt"],
    executionRule: "execution status can come from Multica task/run state and may override issue state for running or failed work",
  },
  slock: {
    source: "slock",
    role: "work_item_source",
    runsBoardPolicy: "task_board_cards",
    supportedStandaloneStages: ["pending", "processing", "review", "closed", "attention"],
    requiredForRuns: ["creator", "assigneeAgent", "channel", "requestExcerpt", "workItemStatus", "conversationLink", "lastSeenAt"],
    executionRule: "execution requires activity, event, observer, or proxy evidence; server active is not enough",
  },
};

/** Return the current listening profile for a target source. */
export function getRuntimeListeningProfile(source: "openclaw" | "multica" | "slock"): RuntimeListeningProfile {
  return profiles[source];
}

/** Assess whether the current normalized snapshot satisfies Lorume's listening needs. */
export function createRuntimeListeningAcceptanceReport(
  snapshot: RuntimeWorkStateSnapshot,
): RuntimeListeningAcceptanceReport {
  return {
    observedAt: snapshot.observedAt,
    deviceId: snapshot.deviceId,
    sources: {
      openclaw: createSourceReport("openclaw", snapshot),
      multica: createSourceReport("multica", snapshot),
      slock: createSourceReport("slock", snapshot),
    },
  };
}

function createSourceReport(
  source: "openclaw" | "multica" | "slock",
  snapshot: RuntimeWorkStateSnapshot,
): RuntimeSourceListeningReport {
  const profile = getRuntimeListeningProfile(source);
  const workItems = snapshot.workItems.filter((item) => item.source === source);
  const conversations = snapshot.conversations.filter((conversation) => conversation.source === source);
  const executions = snapshot.executions.filter((execution) => execution.source === source);
  const capability = snapshot.capabilities.find((candidate) => candidate.source === source);
  const fields = createFieldCoverage(workItems, conversations, executions, capability);
  const readiness = createReadiness(profile, fields, workItems, executions);
  return {
    profile,
    readiness,
    fields,
    gaps: createGaps(profile, fields, readiness),
  };
}

function createFieldCoverage(
  workItems: RuntimeWorkItem[],
  conversations: RuntimeConversation[],
  executions: RuntimeExecution[],
  capability: RuntimeObservationCapability | undefined,
): Record<RuntimeListeningField, RuntimeListeningFieldSupport> {
  return {
    creator: participantFieldSupport(workItems, (item) => item.creator?.label, capability),
    assigneeAgent: participantFieldSupport(workItems, (item) => item.assignee?.label ?? item.agentId, capability),
    channel: hasWorkItemValue(workItems, (item) => item.channel?.label) || conversations.some((conversation) => Boolean(conversation.channel?.label))
      ? "supported"
      : workItemSupport(capability),
    requestExcerpt: hasWorkItemValue(workItems, (item) => item.description ?? item.title) ? "supported" : workItemSupport(capability),
    workItemStatus: workItems.length > 0 ? "supported" : capabilitySupport(capability?.workItems?.support),
    executionStatus: executions.length > 0 ? "supported" : capabilitySupport(capability?.executions?.support),
    conversationLink: hasWorkItemValue(workItems, (item) => item.conversationId) || conversations.length > 0
      ? "supported"
      : capabilitySupport(capability?.conversations?.support),
    lastSeenAt: hasWorkItemValue(workItems, (item) => item.lastSeenAt ?? item.updatedAt ?? item.createdAt) ||
      conversations.some((conversation) => Boolean(conversation.lastSeenAt ?? conversation.lastActivityAt)) ||
      executions.some((execution) => Boolean(execution.lastSeenAt ?? execution.startedAt ?? execution.endedAt))
      ? "supported"
      : "unknown",
  };
}

function createReadiness(
  profile: RuntimeListeningProfile,
  fields: Record<RuntimeListeningField, RuntimeListeningFieldSupport>,
  workItems: RuntimeWorkItem[],
  executions: RuntimeExecution[],
): RuntimeListeningReadiness {
  if (profile.runsBoardPolicy === "requires_upstream_work_item") {
    if (workItems.length > 0) {
      const requiredFieldsReady = profile.requiredForRuns.every((field) => fields[field] === "supported" || fields[field] === "partial");
      return requiredFieldsReady ? "ready_for_runs" : "not_ready";
    }
    return executions.length > 0 ? "execution_only" : "not_ready";
  }

  if (workItems.length === 0) return "not_ready";
  const requiredFieldsReady = profile.requiredForRuns.every((field) => fields[field] === "supported" || fields[field] === "partial");
  return requiredFieldsReady ? "ready_for_runs" : "not_ready";
}

function createGaps(
  profile: RuntimeListeningProfile,
  fields: Record<RuntimeListeningField, RuntimeListeningFieldSupport>,
  readiness: RuntimeListeningReadiness,
): string[] {
  const gaps: string[] = [];

  if (profile.source === "openclaw" && readiness === "execution_only") {
    gaps.push("缺少上游 WorkItem 关联，不能单独进入 Runs 任务泳道");
  }
  if (profile.source === "slock" && readiness === "not_ready") {
    gaps.push("缺少 Slock task board 或 API adapter，不能确认任务卡、群组和发起消息");
  }
  for (const field of profile.requiredForRuns) {
    if (fields[field] === "unsupported" || fields[field] === "unknown") {
      gaps.push(`缺少 ${field} 字段的可靠监听`);
    }
    if ((field === "creator" || field === "assigneeAgent") && fields[field] === "partial") {
      gaps.push(`${field} 字段已监听但缺少可读名称`);
    }
  }

  return gaps;
}

function hasWorkItemValue(workItems: RuntimeWorkItem[], select: (item: RuntimeWorkItem) => string | undefined): boolean {
  return workItems.some((item) => Boolean(select(item)?.trim()));
}

function participantFieldSupport(
  workItems: RuntimeWorkItem[],
  select: (item: RuntimeWorkItem) => string | undefined,
  capability: RuntimeObservationCapability | undefined,
): RuntimeListeningFieldSupport {
  const labels = workItems.map(select).filter((label): label is string => Boolean(label?.trim()));
  if (labels.length === 0) return workItemSupport(capability);
  if (labels.every(isUnsupportedCollectionLabel)) return "partial";
  return labels.some((label) => !isLikelyOpaqueId(label)) ? "supported" : "partial";
}

function isLikelyOpaqueId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

function isUnsupportedCollectionLabel(value: string): boolean {
  return value.trim() === "不支持采集";
}

function workItemSupport(capability: RuntimeObservationCapability | undefined): RuntimeListeningFieldSupport {
  return capabilitySupport(capability?.workItems?.support);
}

function capabilitySupport(support: RuntimeObservationCapability["workItems"]["support"] | undefined): RuntimeListeningFieldSupport {
  if (support === "supported") return "partial";
  if (support === "partial") return "partial";
  if (support === "unsupported") return "unsupported";
  return "unknown";
}
