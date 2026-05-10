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
  dingtalkTargets?: ReadonlyArray<{
    conversationId: string;
    kind?: "group" | "direct";
    label?: string;
    lastSeenAt?: string;
  }>;
  dingtalkMessages?: ReadonlyArray<{
    msgId: string;
    sessionKey?: string;
    conversationId: string;
    direction: "inbound" | "outbound";
    text?: string;
    senderId?: string;
    senderName?: string;
    createdAt?: string;
    updatedAt?: string;
  }>;
  tasks: ReadonlyArray<{
    taskId: string;
    runId?: string;
    task?: string;
    label?: string;
    status: string;
    requesterSessionKey?: string;
    sessionKey?: string;
    messageId?: string;
    requesterOriginJson?: string;
    sourceId?: string;
    createdAt?: string;
    startedAt?: string;
    endedAt?: string;
    error?: string;
  }>;
  trajectoryRuns?: ReadonlyArray<{
    runId: string;
    sessionKey: string;
    prompt?: string;
    messageId?: string;
    senderId?: string;
    senderName?: string;
    conversationId?: string;
    conversationLabel?: string;
    groupSubject?: string;
    finalStatus?: string;
    endedStatus?: string;
    didSendViaMessagingTool?: boolean;
    assistantTexts?: ReadonlyArray<string>;
    aborted?: boolean;
    timedOut?: boolean;
    idleTimedOut?: boolean;
    startedAt?: string;
    endedAt?: string;
    lastEventAt?: string;
    error?: string;
  }>;
}): RuntimeWorkStateAdapterResult {
  const targetByConversationId = new Map<string, NonNullable<Parameters<typeof mapOpenClawWorkState>[0]["dingtalkTargets"]>[number]>();
  for (const target of input.dingtalkTargets ?? []) {
    targetByConversationId.set(target.conversationId, target);
    targetByConversationId.set(target.conversationId.toLowerCase(), target);
  }
  const workItemIdByMessageId = new Map<string, string>();
  const workItemByMessageId = new Map<string, RuntimeWorkItem>();
  const messageLinkCandidates: OpenClawMessageLinkCandidate[] = [];
  const conversationById = new Map<string, RuntimeConversation>();
  const coveredRunIds = new Set<string>();

  for (const session of input.sessions) {
    const conversation = createOpenClawConversation(input, session.sessionKey, {
      status: session.status === "active" ? "active" : "unknown",
      lastActivityAt: session.updatedAt,
    });
    setOpenClawConversation(conversationById, conversation);
  }

  for (const message of input.dingtalkMessages ?? []) {
    if (message.direction !== "inbound") continue;
    const target = targetByConversationId.get(message.conversationId);
    const sessionKey = message.sessionKey ?? createOpenClawDingTalkSessionKey(input.agentId, target?.kind ?? "group", message.conversationId);
    const channel = createOpenClawDingTalkChannel(message.conversationId, input.dingtalkTargets, target?.kind ?? "group");
    const creator = message.senderName || message.senderId
      ? { kind: "human" as const, label: message.senderName ?? message.senderId ?? "未知发起人", externalId: message.senderId }
      : undefined;
    const conversation = createOpenClawConversation(input, sessionKey, {
      status: "active",
      title: channel.label,
      channel,
      participants: creator ? [creator] : undefined,
      lastActivityAt: message.updatedAt ?? message.createdAt ?? target?.lastSeenAt,
    });
    setOpenClawConversation(conversationById, conversation);

    const workItemId = `${input.runtimeId}:work-item:${normalizeObjectKey(message.msgId)}`;
    workItemIdByMessageId.set(message.msgId, workItemId);
    messageLinkCandidates.push({
      messageId: message.msgId,
      sessionKey,
      conversationId: message.conversationId,
      text: message.text,
      senderId: message.senderId,
      senderName: message.senderName,
      occurredAt: message.updatedAt ?? message.createdAt,
    });
    workItemByMessageId.set(message.msgId, {
      id: workItemId,
      source: "openclaw",
      externalId: message.msgId,
      title: createMessageTitle(message.text ?? "DingTalk 消息"),
      description: message.text,
      status: "todo",
      channel,
      creator,
      agentId: input.agentId,
      runtimeId: input.runtimeId,
      conversationId: conversation.id,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      lastSeenAt: input.observedAt,
      sourceRefs: [{ source: "openclaw", externalId: message.msgId }],
    });
  }

  const executions = input.tasks.map((task): RuntimeExecution => {
    const executionStatus = mapOpenClawExecutionStatus(task.status);
    coveredRunIds.add(task.runId ?? task.taskId);
    const sessionKey = task.requesterSessionKey ?? task.sessionKey;
    const sessionChannel = openClawChannelFromDingTalkSession(sessionKey, input.dingtalkTargets);
    const conversation = sessionKey
      ? createOpenClawConversation(input, sessionKey, {
          status: executionStatus === "running" ? "active" : "idle",
          title: sessionChannel?.label,
          channel: sessionChannel,
          lastActivityAt: task.endedAt ?? task.startedAt ?? task.createdAt,
        })
      : undefined;
    if (conversation) setOpenClawConversation(conversationById, conversation);
    const origin = parseJsonMaybe(task.requesterOriginJson);
    let workItemId = task.messageId ? workItemIdByMessageId.get(task.messageId) : undefined;
    let executionConversationId = conversation?.id;
    if (task.messageId && workItemId) {
      const workItem = workItemByMessageId.get(task.messageId);
      if (workItem) {
        workItem.status = openClawMessageStatusFromExecution(executionStatus);
        applyOpenClawLinkedConversationEvidence(workItem, conversation);
        executionConversationId = workItem.conversationId ?? executionConversationId;
      }
    }
    if (!workItemId && shouldCreateOpenClawTaskWorkItem(task, origin)) {
      const workItem = createOpenClawTaskWorkItem(input, task, origin, executionStatus, conversation?.id);
      workItemByMessageId.set(`task:${task.taskId}`, workItem);
      workItemId = workItem.id;
    }
    return {
      id: `${input.runtimeId}:execution:${normalizeObjectKey(task.runId ?? task.taskId)}`,
      source: "openclaw",
      externalId: task.runId ?? task.taskId,
      runtimeId: input.runtimeId,
      agentId: input.agentId,
      workItemId,
      conversationId: executionConversationId,
      status: executionStatus,
      queuedAt: task.createdAt,
      startedAt: task.startedAt,
      endedAt: task.endedAt,
      lastSeenAt: input.observedAt,
      error: task.error,
      sourceRefs: [{ source: "openclaw", externalId: task.taskId }],
    };
  });

  const trajectoryExecutions: RuntimeExecution[] = [];
  for (const run of input.trajectoryRuns ?? []) {
    if (coveredRunIds.has(run.runId)) continue;
    const prompt = cleanOpenClawPrompt(run.prompt);
    if (!shouldCreateOpenClawTrajectoryWorkItem(run, prompt)) continue;
    const executionStatus = mapOpenClawTrajectoryExecutionStatus(run);
    const channel = openClawChannelFromDingTalkSession(run.sessionKey, input.dingtalkTargets);
    const conversation = createOpenClawConversation(input, run.sessionKey, {
      status: executionStatus === "running" ? "active" : "idle",
      title: channel?.label,
      channel,
      lastActivityAt: run.lastEventAt ?? run.endedAt ?? run.startedAt,
    });
    setOpenClawConversation(conversationById, conversation);
    const linkedMessageId = run.messageId ?? findOpenClawMessageLink(messageLinkCandidates, {
      sessionKey: run.sessionKey,
      conversationId: run.conversationId,
      text: prompt,
      senderId: run.senderId,
      senderName: run.senderName,
      occurredAt: run.startedAt ?? run.lastEventAt ?? run.endedAt,
    });
    const linkedWorkItemId = linkedMessageId ? workItemIdByMessageId.get(linkedMessageId) : undefined;
    let workItemId = linkedWorkItemId;
    let conversationId = conversation.id;
    if (linkedMessageId && linkedWorkItemId) {
      const linkedWorkItem = workItemByMessageId.get(linkedMessageId);
      if (linkedWorkItem) {
        linkedWorkItem.status = openClawMessageStatusFromExecution(executionStatus);
        linkedWorkItem.updatedAt = run.endedAt ?? run.lastEventAt ?? linkedWorkItem.updatedAt;
        linkedWorkItem.lastSeenAt = run.lastEventAt ?? run.endedAt ?? input.observedAt;
        applyOpenClawLinkedConversationEvidence(linkedWorkItem, conversation);
        conversationId = linkedWorkItem.conversationId ?? conversationId;
      }
    } else {
      const workItem = createOpenClawTrajectoryWorkItem(input, run, prompt, executionStatus, conversation.id);
      workItemByMessageId.set(`trajectory:${run.runId}`, workItem);
      workItemId = workItem.id;
      conversationId = workItem.conversationId ?? conversationId;
    }
    trajectoryExecutions.push({
      id: `${input.runtimeId}:execution:${normalizeObjectKey(run.runId)}`,
      source: "openclaw",
      externalId: run.runId,
      runtimeId: input.runtimeId,
      agentId: input.agentId,
      workItemId,
      conversationId,
      status: executionStatus,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      lastSeenAt: run.lastEventAt ?? run.endedAt ?? input.observedAt,
      error: run.error,
      sourceRefs: [{ source: "openclaw", externalId: run.runId }],
    });
  }

  return {
    workItems: Array.from(workItemByMessageId.values()),
    conversations: Array.from(conversationById.values()),
    executions: [...executions, ...trajectoryExecutions],
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

/** Map a Slock task board report into Agentlane work-state objects. */
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
  activities?: ReadonlyArray<{
    id?: string;
    activity: string;
    taskId?: string;
    messageId?: string;
    threadId?: string;
    updatedAt?: string;
    error?: string;
  }>;
}): RuntimeWorkStateAdapterResult {
  const taskById = new Map(input.tasks.map((task) => [task.id, task]));
  const taskByThreadId = new Map(input.tasks.filter((task) => task.threadId).map((task) => [task.threadId as string, task]));
  const executions = (input.activities ?? [])
    .map((activity): RuntimeExecution | null => {
      const status = mapSlockActivityStatus(activity.activity);
      if (!status) return null;
      const task = activity.taskId ? taskById.get(activity.taskId) : activity.threadId ? taskByThreadId.get(activity.threadId) : undefined;
      const executionExternalId = activity.id ?? activity.taskId ?? activity.messageId ?? activity.threadId;
      if (!executionExternalId) return null;
      const threadId = task?.threadId ?? activity.threadId;
      return {
        id: `${input.runtimeId}:execution:${executionExternalId}`,
        source: "slock",
        externalId: executionExternalId,
        runtimeId: input.runtimeId,
        agentId: input.agentId,
        workItemId: task ? `${input.runtimeId}:work-item:${task.id}` : undefined,
        conversationId: threadId ? `${input.runtimeId}:conversation:${threadId}` : undefined,
        status,
        startedAt: status === "running" ? activity.updatedAt : undefined,
        endedAt: status === "running" ? undefined : activity.updatedAt,
        lastSeenAt: activity.updatedAt ?? input.observedAt,
        error: activity.error,
        sourceRefs: [{ source: "slock", externalId: executionExternalId }],
      };
    })
    .filter((execution): execution is RuntimeExecution => Boolean(execution));

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
        status: ["done", "cancelled"].includes(mapSlockWorkItemStatus(task.status)) ? "closed" : "open",
        channel: { kind: "slock", label: input.channel.label, externalId: input.channel.externalId },
        title: task.title,
        workItemId: `${input.runtimeId}:work-item:${task.id}`,
        agentId: input.agentId,
        runtimeId: input.runtimeId,
        lastActivityAt: task.updatedAt,
        lastSeenAt: input.observedAt,
        sourceRefs: [{ source: "slock", externalId: task.messageId ?? task.id }],
      })),
    executions,
    capabilities: [slockCapability(input.observedAt, executions.length > 0)],
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

function mapOpenClawTrajectoryExecutionStatus(
  run: NonNullable<Parameters<typeof mapOpenClawWorkState>[0]["trajectoryRuns"]>[number],
): RuntimeExecutionStatus {
  if (run.finalStatus === "success" || run.endedStatus === "success") return "succeeded";
  if (run.finalStatus === "cancelled" || run.endedStatus === "cancelled") return "cancelled";
  if (run.finalStatus === "error" || run.endedStatus === "error" || run.aborted || run.timedOut || run.idleTimedOut) {
    return "failed";
  }
  if (!run.finalStatus && !run.endedStatus) return "running";
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
  if (status === "cancelled" || status === "closed") return "cancelled";
  return "unknown";
}

function mapSlockWorkItemStatus(status: string): RuntimeWorkItemStatus {
  const normalized = status.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "todo" || normalized === "backlog" || normalized === "open") return "todo";
  if (normalized === "in_progress" || normalized === "working" || normalized === "running") return "in_progress";
  if (normalized === "in_review" || normalized === "review") return "in_review";
  if (normalized === "done" || normalized === "completed" || normalized === "succeeded") return "done";
  if (normalized === "blocked") return "blocked";
  if (normalized === "cancelled" || normalized === "canceled" || normalized === "closed") return "cancelled";
  return "unknown";
}

function normalizeObjectKey(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type OpenClawMessageLinkCandidate = {
  messageId: string;
  sessionKey?: string;
  conversationId?: string;
  text?: string;
  senderId?: string;
  senderName?: string;
  occurredAt?: string;
};

function findOpenClawMessageLink(
  candidates: ReadonlyArray<OpenClawMessageLinkCandidate>,
  probe: Omit<OpenClawMessageLinkCandidate, "messageId">,
): string | undefined {
  const textKey = normalizeOpenClawLinkText(probe.text);
  if (!textKey) return undefined;

  const probeSession = parseOpenClawDingTalkSession(probe.sessionKey);
  const probeSessionKey = normalizeOpenClawLinkKey(probe.sessionKey);
  const probeConversationKey = normalizeOpenClawLinkKey(probe.conversationId ?? probeSession?.conversationId);
  const probeTime = parseOpenClawLinkTime(probe.occurredAt);

  const matches = candidates
    .map((candidate) => {
      const candidateSession = parseOpenClawDingTalkSession(candidate.sessionKey);
      const candidateSessionKey = normalizeOpenClawLinkKey(candidate.sessionKey);
      const candidateConversationKey = normalizeOpenClawLinkKey(candidate.conversationId ?? candidateSession?.conversationId);
      const senderMatchesDirectSession = openClawLinkSenderMatchesDirectSession(probe, candidate, probeSession);
      const locationMatches = Boolean(
        (probeSessionKey && candidateSessionKey && probeSessionKey === candidateSessionKey) ||
        (probeConversationKey && candidateConversationKey && probeConversationKey === candidateConversationKey) ||
        senderMatchesDirectSession,
      );
      if (!locationMatches) return null;

      const candidateTextKey = normalizeOpenClawLinkText(candidate.text);
      if (!openClawLinkTextMatches(textKey, candidateTextKey)) return null;

      const candidateTime = parseOpenClawLinkTime(candidate.occurredAt);
      const distance = probeTime !== undefined && candidateTime !== undefined ? Math.abs(probeTime - candidateTime) : 0;
      if (distance > 2 * 60 * 60 * 1000) return null;
      return { candidate, distance };
    })
    .filter((match): match is { candidate: OpenClawMessageLinkCandidate; distance: number } => Boolean(match))
    .sort((left, right) => left.distance - right.distance);

  return matches[0]?.candidate.messageId;
}

function openClawLinkSenderMatchesDirectSession(
  probe: Omit<OpenClawMessageLinkCandidate, "messageId">,
  candidate: OpenClawMessageLinkCandidate,
  probeSession: ReturnType<typeof parseOpenClawDingTalkSession>,
): boolean {
  if (probeSession?.kind !== "direct") return false;
  const probeDirectId = normalizeOpenClawLinkKey(probeSession.conversationId);
  const probeSenderId = normalizeOpenClawLinkKey(probe.senderId);
  const candidateSenderId = normalizeOpenClawLinkKey(candidate.senderId);
  if (candidateSenderId && (candidateSenderId === probeDirectId || candidateSenderId === probeSenderId)) return true;

  const probeSenderName = normalizeOpenClawLinkKey(probe.senderName);
  const candidateSenderName = normalizeOpenClawLinkKey(candidate.senderName);
  return Boolean(!probeSenderId && !candidateSenderId && probeSenderName && candidateSenderName && probeSenderName === candidateSenderName);
}

function normalizeOpenClawLinkKey(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizeOpenClawLinkText(value: string | undefined): string {
  return cleanOpenClawPrompt(value)
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function openClawLinkTextMatches(left: string, right: string): boolean {
  if (!left || !right) return false;
  if (left === right) return true;
  const comparableLength = Math.min(left.length, right.length);
  return comparableLength >= 12 && (left.startsWith(right) || right.startsWith(left));
}

function parseOpenClawLinkTime(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : undefined;
}

function createOpenClawDingTalkSessionKey(agentId: string, kind: "group" | "direct", conversationId: string): string {
  const agentExternalId = agentId.split(":agent:").at(-1) ?? "main";
  return `agent:${agentExternalId}:dingtalk:${kind}:${conversationId}`;
}

function parseJsonMaybe(value: string | undefined): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function shouldCreateOpenClawTaskWorkItem(
  task: { task?: string; label?: string; requesterSessionKey?: string; sessionKey?: string; sourceId?: string },
  origin: Record<string, unknown> | null,
): boolean {
  if (!task.task && !task.label) return false;
  if (task.sourceId?.startsWith("exec-approval-followup:")) return false;
  const text = task.task ?? task.label ?? "";
  if (/^\[[^\]]+\]\s+An async command the user already approved has completed/i.test(text)) return false;
  if (/^\[[^\]]+\]\s+\[System\]/i.test(text)) return false;
  return Boolean(origin?.channel || parseOpenClawDingTalkSession(task.requesterSessionKey ?? task.sessionKey));
}

function shouldCreateOpenClawTrajectoryWorkItem(
  run: NonNullable<Parameters<typeof mapOpenClawWorkState>[0]["trajectoryRuns"]>[number],
  prompt: string,
): boolean {
  if (!parseOpenClawDingTalkSession(run.sessionKey)) return false;
  if (!prompt) return false;
  if (prompt === "HEARTBEAT_OK" || /^\[OpenClaw heartbeat poll\]/i.test(prompt)) return false;
  if (/^\[[^\]]+\]\s+An async command the user already approved has completed/i.test(prompt)) return false;
  if (/^\[[^\]]+\]\s+\[System\]/i.test(prompt)) return false;
  return true;
}

function createOpenClawTrajectoryWorkItem(
  input: Parameters<typeof mapOpenClawWorkState>[0],
  run: NonNullable<Parameters<typeof mapOpenClawWorkState>[0]["trajectoryRuns"]>[number],
  prompt: string,
  executionStatus: RuntimeExecutionStatus,
  conversationId: string,
): RuntimeWorkItem {
  const channel = openClawChannelFromTrajectoryRun(run, input.dingtalkTargets);
  return {
    id: `${input.runtimeId}:work-item:${normalizeObjectKey(run.runId)}`,
    source: "openclaw",
    externalId: run.runId,
    title: createMessageTitle(prompt),
    description: prompt,
    status: openClawTrajectoryWorkItemStatus(run, executionStatus),
    channel,
    creator: openClawCreatorFromTrajectoryRun(run) ?? { kind: "unknown", label: "不支持采集" },
    agentId: input.agentId,
    runtimeId: input.runtimeId,
    conversationId,
    createdAt: run.startedAt,
    updatedAt: run.endedAt ?? run.lastEventAt ?? run.startedAt,
    lastSeenAt: run.lastEventAt ?? run.endedAt ?? input.observedAt,
    sourceRefs: [{ source: "openclaw", externalId: run.runId }],
  };
}

function openClawTrajectoryWorkItemStatus(
  run: NonNullable<Parameters<typeof mapOpenClawWorkState>[0]["trajectoryRuns"]>[number],
  executionStatus: RuntimeExecutionStatus,
): RuntimeWorkItemStatus {
  if (executionStatus === "succeeded" && !hasOpenClawDeliveryEvidence(run)) return "blocked";
  return openClawMessageStatusFromExecution(executionStatus);
}

function hasOpenClawDeliveryEvidence(
  run: NonNullable<Parameters<typeof mapOpenClawWorkState>[0]["trajectoryRuns"]>[number],
): boolean {
  if (run.didSendViaMessagingTool) return true;
  return Boolean(run.assistantTexts?.some((text) => {
    const normalized = text.trim();
    return normalized && normalized !== "NO_REPLY" && normalized !== "HEARTBEAT_OK";
  }));
}

function cleanOpenClawPrompt(value: string | undefined): string {
  return (value ?? "")
    .replace(/Conversation metadata:[\s\S]*?(?:\n\n|$)/i, "")
    .replace(/<conversation-metadata>[\s\S]*?<\/conversation-metadata>/gi, "")
    .replace(/\[media attached(?::| )[^\]]+\]/gi, "[media attached]")
    .replace(/\s+/g, " ")
    .trim();
}

function createOpenClawTaskWorkItem(
  input: Parameters<typeof mapOpenClawWorkState>[0],
  task: Parameters<typeof mapOpenClawWorkState>[0]["tasks"][number],
  origin: Record<string, unknown> | null,
  executionStatus: RuntimeExecutionStatus,
  conversationId: string | undefined,
): RuntimeWorkItem {
  const sessionChannel = openClawChannelFromDingTalkSession(task.requesterSessionKey ?? task.sessionKey, input.dingtalkTargets);
  const originChannel = openClawChannelFromOrigin(origin, input.dingtalkTargets);
  const channel = originChannel ?? sessionChannel ?? { kind: "other" as const, label: "OpenClaw" };
  const titleSource = task.label ?? task.task ?? task.taskId;

  return {
    id: `${input.runtimeId}:work-item:${normalizeObjectKey(task.taskId)}`,
    source: "openclaw",
    externalId: task.taskId,
    title: createMessageTitle(titleSource),
    description: task.task ?? titleSource,
    status: openClawMessageStatusFromExecution(executionStatus),
    channel,
    creator: { kind: "unknown", label: "不支持采集", externalId: task.sourceId },
    agentId: input.agentId,
    runtimeId: input.runtimeId,
    conversationId,
    createdAt: task.createdAt,
    updatedAt: task.endedAt ?? task.startedAt ?? task.createdAt,
    lastSeenAt: input.observedAt,
    sourceRefs: [{ source: "openclaw", externalId: task.taskId }],
  };
}

function openClawChannelFromOrigin(
  origin: Record<string, unknown> | null,
  targets: Parameters<typeof mapOpenClawWorkState>[0]["dingtalkTargets"],
): RuntimeWorkItem["channel"] | undefined {
  const originChannel = typeof origin?.channel === "string" ? origin.channel : undefined;
  if (!originChannel) return undefined;
  if (originChannel === "dingtalk") {
    const conversationId = typeof origin?.to === "string" ? origin.to : undefined;
    return createOpenClawDingTalkChannel(conversationId, targets, "group");
  }
  if (originChannel === "webchat") return { kind: "other", label: "OpenClaw Webchat" };
  if (originChannel === "cron") return { kind: "other", label: "OpenClaw Cron" };
  return { kind: "other", label: originChannel };
}

function openClawChannelFromDingTalkSession(
  sessionKey: string | undefined,
  targets: Parameters<typeof mapOpenClawWorkState>[0]["dingtalkTargets"],
): RuntimeWorkItem["channel"] | undefined {
  const session = parseOpenClawDingTalkSession(sessionKey);
  if (!session) return undefined;
  return createOpenClawDingTalkChannel(session.conversationId, targets, session.kind);
}

function openClawChannelFromTrajectoryRun(
  run: NonNullable<Parameters<typeof mapOpenClawWorkState>[0]["trajectoryRuns"]>[number],
  targets: Parameters<typeof mapOpenClawWorkState>[0]["dingtalkTargets"],
): RuntimeWorkItem["channel"] | undefined {
  const session = parseOpenClawDingTalkSession(run.sessionKey);
  if (!session) return undefined;
  const channel = createOpenClawDingTalkChannel(run.conversationId ?? session.conversationId, targets, session.kind);
  const metadataLabel = run.groupSubject ?? run.conversationLabel;
  if (metadataLabel && channel.label.startsWith("DingTalk ")) {
    return {
      ...channel,
      label: metadataLabel,
      externalId: run.conversationId ?? channel.externalId,
    };
  }
  return channel;
}

function openClawCreatorFromTrajectoryRun(
  run: NonNullable<Parameters<typeof mapOpenClawWorkState>[0]["trajectoryRuns"]>[number],
): RuntimeWorkItem["creator"] | undefined {
  if (!run.senderName && !run.senderId) return undefined;
  return {
    kind: "human",
    label: run.senderName ?? run.senderId ?? "未知发起人",
    externalId: run.senderId,
  };
}

function applyOpenClawLinkedConversationEvidence(
  workItem: RuntimeWorkItem,
  conversation: RuntimeConversation | undefined,
): void {
  if (!conversation?.channel) return;
  if (!shouldPreferOpenClawConversationEvidence(workItem.channel, conversation.channel)) return;
  workItem.channel = conversation.channel;
  workItem.conversationId = conversation.id;
}

function shouldPreferOpenClawConversationEvidence(
  current: RuntimeWorkItem["channel"],
  candidate: RuntimeWorkItem["channel"],
): boolean {
  if (!candidate) return false;
  if (!current) return true;
  if (current.kind !== "dingtalk" || candidate.kind !== "dingtalk") return false;

  const currentGenerated = isGeneratedOpenClawDingTalkFallback(current.label);
  const candidateGenerated = isGeneratedOpenClawDingTalkFallback(candidate.label);
  if (!currentGenerated) return false;

  if (isGeneratedOpenClawDingTalkDirect(candidate.label)) return true;
  return !candidateGenerated;
}

function isGeneratedOpenClawDingTalkFallback(label: string | undefined): boolean {
  return /^DingTalk\s+(群聊|私聊)\s+.+$/i.test(label?.trim() ?? "");
}

function isGeneratedOpenClawDingTalkDirect(label: string | undefined): boolean {
  return /^DingTalk\s+私聊\s+.+$/i.test(label?.trim() ?? "");
}

function findOpenClawTarget(
  targets: Parameters<typeof mapOpenClawWorkState>[0]["dingtalkTargets"],
  conversationId: string | undefined,
) {
  if (!conversationId) return undefined;
  return targets?.find((candidate) => candidate.conversationId === conversationId || candidate.conversationId.toLowerCase() === conversationId.toLowerCase());
}

function createOpenClawDingTalkChannel(
  conversationId: string | undefined,
  targets: Parameters<typeof mapOpenClawWorkState>[0]["dingtalkTargets"],
  fallbackKind: "group" | "direct",
): NonNullable<RuntimeWorkItem["channel"]> {
  const target = findOpenClawTarget(targets, conversationId);
  return {
    kind: "dingtalk",
    label: formatOpenClawDingTalkLabel(conversationId, target, fallbackKind),
    externalId: conversationId,
  };
}

function formatOpenClawDingTalkLabel(
  conversationId: string | undefined,
  target: ReturnType<typeof findOpenClawTarget>,
  fallbackKind: "group" | "direct",
): string {
  const rawLabel = target?.label?.trim();
  if (rawLabel && rawLabel.toLowerCase() !== conversationId?.toLowerCase()) return rawLabel;
  if (!conversationId) return "DingTalk";
  const prefix = (target?.kind ?? fallbackKind) === "direct" ? "DingTalk 私聊" : "DingTalk 群聊";
  return `${prefix} ${compactExternalId(conversationId)}`;
}

function compactExternalId(value: string): string {
  const normalized = value.trim();
  if (normalized.length <= 12) return normalized;
  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
}

function parseOpenClawDingTalkSession(sessionKey: string | undefined): { kind: "group" | "direct"; conversationId: string } | null {
  const match = /^agent:[^:]+:dingtalk:(group|direct):(.+)$/.exec(sessionKey ?? "");
  return match?.[2] ? { kind: match[1] as "group" | "direct", conversationId: match[2] } : null;
}

function createOpenClawConversation(
  input: Pick<Parameters<typeof mapOpenClawWorkState>[0], "observedAt" | "runtimeId" | "agentId">,
  sessionKey: string,
  fields: Partial<RuntimeConversation>,
): RuntimeConversation {
  return {
    id: `${input.runtimeId}:conversation:${normalizeObjectKey(sessionKey)}`,
    source: "openclaw",
    externalId: sessionKey,
    status: fields.status ?? "unknown",
    agentId: input.agentId,
    runtimeId: input.runtimeId,
    title: fields.title,
    channel: fields.channel,
    participants: fields.participants,
    lastActivityAt: fields.lastActivityAt,
    lastSeenAt: input.observedAt,
    sourceRefs: [{ source: "openclaw", externalId: sessionKey }],
  };
}

function setOpenClawConversation(map: Map<string, RuntimeConversation>, conversation: RuntimeConversation): void {
  const existing = map.get(conversation.id);
  if (!existing) {
    map.set(conversation.id, conversation);
    return;
  }

  map.set(conversation.id, {
    ...existing,
    ...conversation,
    status: existing.status === "active" || conversation.status === "active" ? "active" : conversation.status,
    title: existing.title ?? conversation.title,
    channel: existing.channel ?? conversation.channel,
    participants: existing.participants ?? conversation.participants,
    lastActivityAt: latestIso(existing.lastActivityAt, conversation.lastActivityAt),
    sourceRefs: existing.sourceRefs ?? conversation.sourceRefs,
  });
}

function latestIso(left: string | undefined, right: string | undefined): string | undefined {
  if (!left) return right;
  if (!right) return left;
  return Date.parse(left) >= Date.parse(right) ? left : right;
}

function createMessageTitle(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  const firstSentence = normalized.split(/[，。！？,.!?]/)[0]?.trim();
  const title = firstSentence || normalized || "DingTalk 消息";
  return title.length > 32 ? `${title.slice(0, 32)}...` : title;
}

function openClawMessageStatusFromExecution(status: RuntimeExecutionStatus): RuntimeWorkItemStatus {
  if (status === "queued" || status === "running") return "in_progress";
  if (status === "succeeded") return "done";
  if (status === "cancelled") return "cancelled";
  if (status === "failed" || status === "unknown") return "blocked";
  return "unknown";
}

function mapSlockActivityStatus(activity: string): RuntimeExecutionStatus | null {
  if (activity === "working" || activity === "thinking" || activity === "running") return "running";
  if (activity === "failed" || activity === "error") return "failed";
  if (activity === "cancelled" || activity === "canceled") return "cancelled";
  if (activity === "completed" || activity === "succeeded" || activity === "done") return "succeeded";
  return null;
}

function openClawCapability(collectedAt: string): RuntimeObservationCapability {
  return {
    source: "openclaw",
    collectedAt,
    workItems: {
      support: "partial",
      strategies: ["local_state", "cli", "native_api"],
      evidence: ["OpenClaw DingTalk message context, task origin, session runtime-context, or trajectory prompt.submitted can produce message-backed work items."],
      limitations: ["OpenClaw itself has no review phase; creator identity depends on channel message context or runtime-context metadata."],
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
      evidence: ["openclaw tasks list and trajectory trace.artifacts expose task and run status."],
      limitations: ["Lost, timed out, and trajectory error states are normalized to failed."],
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

function slockCapability(collectedAt: string, hasExecutionEvidence = false): RuntimeObservationCapability {
  return {
    source: "slock",
    collectedAt,
    workItems: {
      support: "supported",
      strategies: ["cli", "native_api"],
      evidence: ["slock task board exposes task lifecycle fields."],
      limitations: ["Task board lifecycle is the v1 source for Runs stages; it does not create RuntimeExecution records by itself."],
    },
    conversations: {
      support: "partial",
      strategies: ["cli", "native_api"],
      evidence: ["slock history can expose channel and thread messages."],
      limitations: ["DM history depends on agent context."],
    },
    executions: {
      support: hasExecutionEvidence ? "partial" : "unknown",
      strategies: ["native_api", "network_proxy", "managed_launcher"],
      evidence: hasExecutionEvidence
        ? ["Slock activity evidence was linked to task-board work items."]
        : ["Slock task board is available; realtime activity is not collected in the v1 adapter path."],
      limitations: ["Server active means online or available, not execution running."],
    },
  };
}
