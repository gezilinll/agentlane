import type { ChannelBinding, ExternalRuntimeRef, RuntimeSource } from "./runtime-normalize";

/** Business lifecycle states for external tasks, issues, board cards, or work requests. */
export const WORK_ITEM_STATUSES = [
  "todo",
  "in_progress",
  "in_review",
  "done",
  "blocked",
  "cancelled",
  "unknown",
] as const;

/** Business lifecycle state for an external task, issue, board card, or work request. */
export type RuntimeWorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];

/** Conversation lifecycle states for channel threads, direct messages, or runtime sessions. */
export const CONVERSATION_STATUSES = ["open", "active", "idle", "closed", "unknown"] as const;

/** Conversation lifecycle state for a channel thread, direct message, or runtime session. */
export type RuntimeConversationStatus = (typeof CONVERSATION_STATUSES)[number];

/** Runtime execution states for concrete attempts, runs, or task invocations. */
export const EXECUTION_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "unknown",
] as const;

/** Runtime execution state for a concrete attempt, run, or task invocation. */
export type RuntimeExecutionStatus = (typeof EXECUTION_STATUSES)[number];

/** Lorume-owned project-management stage for unified work queues. */
export const WORK_STAGE_IDS = ["pending", "processing", "review", "closed", "attention"] as const;

/** Lorume-owned project-management stage for unified work queues. */
export type RuntimeWorkStageId = (typeof WORK_STAGE_IDS)[number];

/** Confidence level for a stage derived from platform-specific evidence. */
export type RuntimeWorkStageConfidence = "direct" | "partial" | "unsupported";

/** Adapter strategy used to observe work items, conversations, or executions. */
export const OBSERVATION_STRATEGIES = [
  "native_api",
  "cli",
  "local_state",
  "process",
  "network_proxy",
  "managed_launcher",
  "manual",
] as const;

/** Adapter strategy used to observe work items, conversations, or executions. */
export type RuntimeObservationStrategy = (typeof OBSERVATION_STRATEGIES)[number];

/** Support level for a platform observation surface. */
export type RuntimeObservationSupport = "supported" | "partial" | "unsupported" | "unknown";

/** Human, agent, runtime, or system participant referenced by a work item or conversation. */
export interface RuntimeWorkParticipant {
  /** Participant kind in Lorume-owned terms. */
  kind: "human" | "agent" | "runtime" | "system" | "unknown";
  /** Human-readable participant label such as @agent-name or OpenClaw Gateway. */
  label: string;
  /** Optional Lorume object id when the participant has already been normalized. */
  objectId?: string;
  /** Optional external id from the source platform. */
  externalId?: string;
}

/** Input used by adapters or view models to derive an Lorume work stage. */
export interface RuntimeWorkStageDerivationInput {
  /** Source adapter that provided the strongest available evidence. */
  source: RuntimeSource;
  /** Normalized business lifecycle status, when the platform exposes one. */
  workItemStatus?: RuntimeWorkItemStatus;
  /** Normalized execution lifecycle status, when the platform exposes one. */
  executionStatus?: RuntimeExecutionStatus;
}

/** Derived Lorume work stage plus an explanation of evidence quality. */
export interface RuntimeWorkStageDerivation {
  /** Lorume-owned stage used by unified work queues. */
  stage: RuntimeWorkStageId;
  /** Whether the stage is directly proven, partially inferred, or unsupported for this source. */
  confidence: RuntimeWorkStageConfidence;
  /** Short adapter-facing explanation of why the stage was selected. */
  reasons: string[];
}

/** Derive the unified Lorume work stage from platform-specific work and execution evidence. */
export function deriveRuntimeWorkStage(input: RuntimeWorkStageDerivationInput): RuntimeWorkStageDerivation {
  if (input.source === "openclaw") return deriveOpenClawStage(input);
  if (input.source === "multica") return deriveMulticaStage(input);
  if (input.source === "slock") return deriveSlockStage(input);
  return deriveGenericStage(input);
}

/** Normalized business work item such as a Slock board card, Multica issue, or external task. */
export interface RuntimeWorkItem {
  /** Stable Lorume work item id. */
  id: string;
  /** Source adapter that discovered this work item. */
  source: RuntimeSource;
  /** External work item id from the source platform. */
  externalId: string;
  /** Human-readable work item title or summary. */
  title: string;
  /** Optional longer work item description. */
  description?: string;
  /** Business lifecycle status after adapter normalization. */
  status: RuntimeWorkItemStatus;
  /** Optional materialized Lorume stage when a trusted backend query has already derived it. */
  stage?: RuntimeWorkStageId;
  /** Channel, board, project, or platform surface where this work item is visible. */
  channel?: ChannelBinding;
  /** Current assignee when the source platform exposes one. */
  assignee?: RuntimeWorkParticipant;
  /** Work item creator when the source platform exposes one. */
  creator?: RuntimeWorkParticipant;
  /** Lorume agent id currently associated with the work item, if known. */
  agentId?: string;
  /** Lorume runtime id currently associated with the work item, if known. */
  runtimeId?: string;
  /** Optional conversation or thread id attached to this work item. */
  conversationId?: string;
  /** ISO timestamp when the work item was created, if the source exposes it. */
  createdAt?: string;
  /** ISO timestamp when the work item was last updated, if the source exposes it. */
  updatedAt?: string;
  /** ISO timestamp when Lorume last observed this work item. */
  lastSeenAt?: string;
  /** External platform references that produced this work item. */
  sourceRefs?: ExternalRuntimeRef[];
}

/** Normalized conversation or session object such as a Slock DM, channel thread, or OpenClaw session. */
export interface RuntimeConversation {
  /** Stable Lorume conversation id. */
  id: string;
  /** Source adapter that discovered this conversation. */
  source: RuntimeSource;
  /** External conversation, thread, or session id from the source platform. */
  externalId: string;
  /** Conversation lifecycle state after adapter normalization. */
  status: RuntimeConversationStatus;
  /** Channel or platform surface where this conversation is visible. */
  channel?: ChannelBinding;
  /** Optional human-readable conversation title. */
  title?: string;
  /** Lorume work item id linked to this conversation, if known. */
  workItemId?: string;
  /** Lorume agent id linked to this conversation, if known. */
  agentId?: string;
  /** Lorume runtime id linked to this conversation, if known. */
  runtimeId?: string;
  /** Participants known to be part of this conversation. */
  participants?: RuntimeWorkParticipant[];
  /** ISO timestamp for the first known message or session activity. */
  startedAt?: string;
  /** ISO timestamp for the latest known message or session activity. */
  lastActivityAt?: string;
  /** ISO timestamp when Lorume last observed this conversation. */
  lastSeenAt?: string;
  /** External platform references that produced this conversation. */
  sourceRefs?: ExternalRuntimeRef[];
}

/** Concrete runtime execution attempt such as an OpenClaw run, Multica task, or observed Slock activity. */
export interface RuntimeExecution {
  /** Stable Lorume execution id. */
  id: string;
  /** Source adapter that discovered this execution. */
  source: RuntimeSource;
  /** External execution id from the source platform. */
  externalId: string;
  /** Lorume runtime id responsible for the execution. */
  runtimeId: string;
  /** Lorume agent id responsible for the execution, if known. */
  agentId?: string;
  /** Lorume work item id linked to this execution, if known. */
  workItemId?: string;
  /** Lorume conversation id linked to this execution, if known. */
  conversationId?: string;
  /** Runtime execution state after adapter normalization. */
  status: RuntimeExecutionStatus;
  /** ISO timestamp when the execution was queued, if known. */
  queuedAt?: string;
  /** ISO timestamp when the execution started, if known. */
  startedAt?: string;
  /** ISO timestamp when the execution ended, if known. */
  endedAt?: string;
  /** ISO timestamp when Lorume last observed this execution. */
  lastSeenAt?: string;
  /** Optional short failure or degradation summary. */
  error?: string;
  /** External platform references that produced this execution. */
  sourceRefs?: ExternalRuntimeRef[];
}

/** Capability details for one observation surface such as work items or executions. */
export interface RuntimeObservationSurfaceCapability {
  /** Whether this surface can satisfy Lorume's target data needs. */
  support: RuntimeObservationSupport;
  /** Strategies that can collect this surface for the platform. */
  strategies: RuntimeObservationStrategy[];
  /** Concrete evidence, command, endpoint, or event used to justify the support level. */
  evidence: string[];
  /** Known limitations that must stay visible during product and adapter design. */
  limitations: string[];
}

/** Platform capability report for work item, conversation, and execution observation. */
export interface RuntimeObservationCapability {
  /** Source adapter being assessed. */
  source: RuntimeSource;
  /** ISO timestamp when the capability evidence was collected or reviewed. */
  collectedAt: string;
  /** Capability to observe business work items such as board cards or issues. */
  workItems: RuntimeObservationSurfaceCapability;
  /** Capability to observe channel conversations, DMs, threads, or sessions. */
  conversations: RuntimeObservationSurfaceCapability;
  /** Capability to observe concrete runtime executions, runs, or active work. */
  executions: RuntimeObservationSurfaceCapability;
}

/** Normalized work state snapshot consumed by future task/session management surfaces. */
export interface RuntimeWorkStateSnapshot {
  /** ISO timestamp when the full work state snapshot was observed. */
  observedAt: string;
  /** Lorume device id that produced the snapshot. */
  deviceId: string;
  /** Normalized business work items observed from all participating adapters. */
  workItems: RuntimeWorkItem[];
  /** Normalized conversations or sessions observed from all participating adapters. */
  conversations: RuntimeConversation[];
  /** Normalized runtime executions observed from all participating adapters. */
  executions: RuntimeExecution[];
  /** Capability reports that explain how each platform can satisfy the target data needs. */
  capabilities: RuntimeObservationCapability[];
  /** Optional warnings that should not fail the whole snapshot. */
  warnings?: string[];
}

function deriveOpenClawStage(input: RuntimeWorkStageDerivationInput): RuntimeWorkStageDerivation {
  if (input.executionStatus === "queued" || input.executionStatus === "running") {
    return stage("processing", "direct", "OpenClaw execution is queued or running.");
  }
  if (input.executionStatus === "succeeded") {
    return stage("closed", "direct", "OpenClaw has no review phase; succeeded executions are closed.");
  }
  if (input.executionStatus === "failed" || input.executionStatus === "cancelled" || input.executionStatus === "unknown") {
    return stage("attention", "direct", "OpenClaw execution is terminal failure, cancelled, or unknown.");
  }
  if (input.workItemStatus === "todo") {
    return stage("pending", "partial", "OpenClaw DingTalk message is waiting for execution evidence.");
  }
  if (input.workItemStatus === "in_progress") {
    return stage("processing", "partial", "OpenClaw message-backed work item is marked in progress.");
  }
  if (input.workItemStatus === "done" || input.workItemStatus === "cancelled") {
    return stage("closed", "partial", "OpenClaw message-backed work item reached a terminal state.");
  }
  if (input.workItemStatus === "blocked" || input.workItemStatus === "unknown") {
    return stage("attention", "partial", "OpenClaw message-backed work item needs attention.");
  }
  if (input.workItemStatus === "in_review") {
    return stage("attention", "unsupported", "OpenClaw has no review phase.");
  }
  return stage("attention", "unsupported", "OpenClaw stage requires execution evidence.");
}

function deriveMulticaStage(input: RuntimeWorkStageDerivationInput): RuntimeWorkStageDerivation {
  if (input.executionStatus === "failed" || input.executionStatus === "cancelled") {
    return stage("attention", "direct", "Multica execution failed or was cancelled.");
  }
  if (input.executionStatus === "queued" || input.executionStatus === "running") {
    return stage("processing", "direct", "Multica execution is queued or running.");
  }
  return deriveGenericStage(input, "Multica issue status");
}

function deriveSlockStage(input: RuntimeWorkStageDerivationInput): RuntimeWorkStageDerivation {
  if (input.executionStatus === "failed" || input.executionStatus === "cancelled") {
    return stage("attention", "direct", "Slock execution evidence indicates failure or cancellation.");
  }
  if (input.executionStatus === "queued" || input.executionStatus === "running") {
    return stage("processing", "direct", "Slock execution evidence indicates queued or running activity.");
  }
  return deriveGenericStage(input, "Slock task-board status");
}

function deriveGenericStage(
  input: RuntimeWorkStageDerivationInput,
  evidenceLabel = "Work item status",
): RuntimeWorkStageDerivation {
  if (input.workItemStatus === "todo") return stage("pending", "direct", `${evidenceLabel} is todo.`);
  if (input.workItemStatus === "in_progress") return stage("processing", "direct", `${evidenceLabel} is in_progress.`);
  if (input.workItemStatus === "in_review") return stage("review", "direct", `${evidenceLabel} is in_review.`);
  if (input.workItemStatus === "done" || input.workItemStatus === "cancelled") {
    return stage("closed", "direct", `${evidenceLabel} is terminal.`);
  }
  if (input.workItemStatus === "blocked" || input.workItemStatus === "unknown") {
    return stage("attention", "direct", `${evidenceLabel} is blocked or unknown.`);
  }
  if (input.executionStatus === "queued" || input.executionStatus === "running") {
    return stage("processing", "direct", "Execution is queued or running.");
  }
  if (input.executionStatus === "succeeded") return stage("closed", "direct", "Execution succeeded.");
  if (input.executionStatus === "failed" || input.executionStatus === "cancelled" || input.executionStatus === "unknown") {
    return stage("attention", "direct", "Execution is failure, cancelled, or unknown.");
  }
  return stage("attention", "unsupported", "No work item or execution evidence is available.");
}

function stage(
  stageId: RuntimeWorkStageId,
  confidence: RuntimeWorkStageConfidence,
  reason: string,
): RuntimeWorkStageDerivation {
  return { stage: stageId, confidence, reasons: [reason] };
}
