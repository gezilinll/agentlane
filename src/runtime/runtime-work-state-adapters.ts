import type {
  RuntimeConversation,
  RuntimeExecution,
  RuntimeExecutionStatus,
  RuntimeObservationCapability,
  RuntimeWorkItem,
  RuntimeWorkItemStatus,
  RuntimeWorkStateSnapshot,
} from "./runtime-work-state";

/** Partial work-state payload produced by one platform adapter before snapshot merge. */
export type RuntimeWorkStateAdapterResult = Pick<
  RuntimeWorkStateSnapshot,
  "workItems" | "conversations" | "executions" | "capabilities" | "warnings"
>;

/** Map an OpenClaw task/session report into Agentlane work-state objects. */
export function mapOpenClawWorkState(input: {
  observedAt: string;
  deviceId: string;
  runtimeId: string;
  agentId: string;
  sessions: ReadonlyArray<{ sessionKey: string; updatedAt?: string; status?: string }>;
  tasks: ReadonlyArray<{
    taskId: string;
    runId?: string;
    status: string;
    createdAt?: string;
    startedAt?: string;
    endedAt?: string;
    error?: string;
  }>;
}): RuntimeWorkStateAdapterResult {
  return {
    workItems: [],
    conversations: input.sessions.map((session): RuntimeConversation => ({
      id: `${input.runtimeId}:conversation:${session.sessionKey}`,
      source: "openclaw",
      externalId: session.sessionKey,
      status: session.status === "active" ? "active" : "unknown",
      agentId: input.agentId,
      runtimeId: input.runtimeId,
      lastActivityAt: session.updatedAt,
      lastSeenAt: input.observedAt,
      sourceRefs: [{ source: "openclaw", externalId: session.sessionKey }],
    })),
    executions: input.tasks.map((task): RuntimeExecution => ({
      id: `${input.runtimeId}:execution:${task.runId ?? task.taskId}`,
      source: "openclaw",
      externalId: task.runId ?? task.taskId,
      runtimeId: input.runtimeId,
      agentId: input.agentId,
      conversationId: undefined,
      status: mapOpenClawExecutionStatus(task.status),
      queuedAt: task.createdAt,
      startedAt: task.startedAt,
      endedAt: task.endedAt,
      lastSeenAt: input.observedAt,
      error: task.error,
      sourceRefs: [{ source: "openclaw", externalId: task.taskId }],
    })),
    capabilities: [openClawCapability(input.observedAt)],
  };
}

/** Map a Multica issue/task report into Agentlane work-state objects. */
export function mapMulticaWorkState(input: {
  observedAt: string;
  deviceId: string;
  runtimeId: string;
  agentId: string;
  issues: ReadonlyArray<{
    id: string;
    identifier?: string;
    title: string;
    status: string;
    assignee?: string;
    creator?: string;
    createdAt?: string;
    updatedAt?: string;
  }>;
  runs: ReadonlyArray<{
    id: string;
    issueId?: string;
    status: string;
    chatSessionId?: string;
    createdAt?: string;
    startedAt?: string;
    completedAt?: string;
    error?: string;
  }>;
}): RuntimeWorkStateAdapterResult {
  return {
    workItems: input.issues.map((issue): RuntimeWorkItem => ({
      id: `${input.runtimeId}:work-item:${issue.id}`,
      source: "multica",
      externalId: issue.id,
      title: issue.title,
      status: mapMulticaWorkItemStatus(issue.status),
      assignee: issue.assignee ? { kind: "agent", label: issue.assignee } : undefined,
      creator: issue.creator ? { kind: "human", label: issue.creator } : undefined,
      agentId: input.agentId,
      runtimeId: input.runtimeId,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      lastSeenAt: input.observedAt,
      sourceRefs: [{ source: "multica", externalId: issue.identifier ?? issue.id }],
    })),
    conversations: input.runs
      .filter((run) => run.chatSessionId)
      .map((run): RuntimeConversation => ({
        id: `${input.runtimeId}:conversation:${run.chatSessionId}`,
        source: "multica",
        externalId: run.chatSessionId as string,
        status: run.status === "running" ? "active" : "idle",
        workItemId: run.issueId ? `${input.runtimeId}:work-item:${run.issueId}` : undefined,
        agentId: input.agentId,
        runtimeId: input.runtimeId,
        startedAt: run.startedAt,
        lastSeenAt: input.observedAt,
        sourceRefs: [{ source: "multica", externalId: run.chatSessionId as string }],
      })),
    executions: input.runs.map((run): RuntimeExecution => ({
      id: `${input.runtimeId}:execution:${run.id}`,
      source: "multica",
      externalId: run.id,
      runtimeId: input.runtimeId,
      agentId: input.agentId,
      workItemId: run.issueId ? `${input.runtimeId}:work-item:${run.issueId}` : undefined,
      conversationId: run.chatSessionId ? `${input.runtimeId}:conversation:${run.chatSessionId}` : undefined,
      status: mapMulticaExecutionStatus(run.status),
      queuedAt: run.createdAt,
      startedAt: run.startedAt,
      endedAt: run.completedAt,
      lastSeenAt: input.observedAt,
      error: run.error,
      sourceRefs: [{ source: "multica", externalId: run.id }],
    })),
    capabilities: [multicaCapability(input.observedAt)],
  };
}

/** Map a Slock task board report into Agentlane work-state objects without deriving execution state. */
export function mapSlockWorkState(input: {
  observedAt: string;
  deviceId: string;
  runtimeId: string;
  agentId: string;
  channel: { label: string; externalId: string };
  tasks: ReadonlyArray<{
    id: string;
    taskNumber?: number;
    title: string;
    status: string;
    createdByName?: string;
    claimedByName?: string;
    createdAt?: string;
    updatedAt?: string;
    completedAt?: string;
    messageId?: string;
    threadId?: string;
  }>;
}): RuntimeWorkStateAdapterResult {
  return {
    workItems: input.tasks.map((task): RuntimeWorkItem => ({
      id: `${input.runtimeId}:work-item:${task.id}`,
      source: "slock",
      externalId: task.id,
      title: task.title,
      status: mapSlockWorkItemStatus(task.status),
      channel: { kind: "slock", label: input.channel.label, externalId: input.channel.externalId },
      assignee: task.claimedByName ? { kind: "agent", label: task.claimedByName } : undefined,
      creator: task.createdByName ? { kind: "human", label: task.createdByName } : undefined,
      agentId: input.agentId,
      runtimeId: input.runtimeId,
      conversationId: task.threadId ? `${input.runtimeId}:conversation:${task.threadId}` : undefined,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      lastSeenAt: input.observedAt,
      sourceRefs: [{ source: "slock", externalId: String(task.taskNumber ?? task.id) }],
    })),
    conversations: input.tasks
      .filter((task) => task.threadId)
      .map((task): RuntimeConversation => ({
        id: `${input.runtimeId}:conversation:${task.threadId}`,
        source: "slock",
        externalId: task.threadId as string,
        status: task.status === "done" ? "closed" : "open",
        channel: { kind: "slock", label: input.channel.label, externalId: input.channel.externalId },
        title: task.title,
        workItemId: `${input.runtimeId}:work-item:${task.id}`,
        agentId: input.agentId,
        runtimeId: input.runtimeId,
        lastActivityAt: task.updatedAt,
        lastSeenAt: input.observedAt,
        sourceRefs: [{ source: "slock", externalId: task.messageId ?? task.id }],
      })),
    executions: [],
    capabilities: [slockCapability(input.observedAt)],
    warnings: ["Slock server active state is not treated as execution running evidence."],
  };
}

function mapOpenClawExecutionStatus(status: string): RuntimeExecutionStatus {
  if (status === "succeeded") return "succeeded";
  if (status === "cancelled") return "cancelled";
  if (status === "queued") return "queued";
  if (status === "running") return "running";
  if (status === "failed" || status === "lost" || status === "timed_out") return "failed";
  return "unknown";
}

function mapMulticaExecutionStatus(status: string): RuntimeExecutionStatus {
  if (status === "completed" || status === "succeeded") return "succeeded";
  if (status === "failed") return "failed";
  if (status === "cancelled") return "cancelled";
  if (status === "queued") return "queued";
  if (status === "running") return "running";
  return "unknown";
}

function mapMulticaWorkItemStatus(status: string): RuntimeWorkItemStatus {
  if (status === "todo" || status === "backlog") return "todo";
  if (status === "in_progress") return "in_progress";
  if (status === "in_review") return "in_review";
  if (status === "done") return "done";
  if (status === "blocked") return "blocked";
  if (status === "cancelled") return "cancelled";
  return "unknown";
}

function mapSlockWorkItemStatus(status: string): RuntimeWorkItemStatus {
  if (status === "todo") return "todo";
  if (status === "in_progress") return "in_progress";
  if (status === "in_review") return "in_review";
  if (status === "done") return "done";
  if (status === "blocked") return "blocked";
  if (status === "cancelled") return "cancelled";
  return "unknown";
}

function openClawCapability(collectedAt: string): RuntimeObservationCapability {
  return {
    source: "openclaw",
    collectedAt,
    workItems: {
      support: "unsupported",
      strategies: ["cli", "native_api"],
      evidence: ["openclaw tasks list --json exposes executions, not project-management work items."],
      limitations: ["OpenClaw has no pending or review phase without an upstream work item source."],
    },
    conversations: {
      support: "partial",
      strategies: ["cli", "native_api"],
      evidence: ["openclaw health exposes session keys and recent activity."],
      limitations: ["Session count can include historical sessions."],
    },
    executions: {
      support: "supported",
      strategies: ["cli", "native_api"],
      evidence: ["openclaw tasks list exposes task and run status."],
      limitations: ["Lost and timed out statuses are normalized to failed."],
    },
  };
}

function multicaCapability(collectedAt: string): RuntimeObservationCapability {
  return {
    source: "multica",
    collectedAt,
    workItems: {
      support: "supported",
      strategies: ["cli", "native_api"],
      evidence: ["multica issue list exposes issue lifecycle fields."],
      limitations: ["Backlog is normalized to todo until Agentlane adds a separate backlog stage."],
    },
    conversations: {
      support: "partial",
      strategies: ["cli", "native_api"],
      evidence: ["multica task runs can include chat_session_id."],
      limitations: ["Conversation messages require separate issue run-message reads."],
    },
    executions: {
      support: "supported",
      strategies: ["cli", "native_api"],
      evidence: ["multica agent tasks and issue runs expose task status and timestamps."],
      limitations: ["Completed is normalized to succeeded."],
    },
  };
}

function slockCapability(collectedAt: string): RuntimeObservationCapability {
  return {
    source: "slock",
    collectedAt,
    workItems: {
      support: "supported",
      strategies: ["cli", "native_api"],
      evidence: ["slock task board exposes task lifecycle fields."],
      limitations: ["Task board in_progress is a business phase, not execution proof."],
    },
    conversations: {
      support: "partial",
      strategies: ["cli", "native_api"],
      evidence: ["slock history can expose channel and thread messages."],
      limitations: ["DM history depends on agent context."],
    },
    executions: {
      support: "unknown",
      strategies: ["network_proxy", "managed_launcher"],
      evidence: ["daemon source has internal agent activity events, but CLI/server info does not expose running executions."],
      limitations: ["Server active means online or available, not execution running."],
    },
  };
}
