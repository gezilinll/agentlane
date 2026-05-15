import {
  RUNTIME_KINDS,
  type LorumeRuntime,
  type ChannelKind,
  type RuntimeActivityStats,
  type RuntimeSource,
  type ManagedAgentStatus,
  type ManagedRuntimeAgent,
  type RuntimeDevice,
  type RuntimeHealthStatus,
  type RuntimeInventorySnapshot,
  type RuntimeKind,
} from "./runtime-normalize";
import type {
  RuntimeObservationCapability,
  RuntimeWorkParticipant,
} from "./runtime-work-state";
import {
  deriveRuntimeWorkStage,
  type RuntimeExecution,
  type RuntimeWorkItem,
  type RuntimeWorkStateSnapshot,
} from "./runtime-work-state";

/** Runtime kind labels used by the Runtime Fleet page. */
export const runtimeKindLabels: Record<RuntimeKind, string> = {
  openclaw: "OpenClaw",
  codex: "Codex",
  claude_code: "Claude Code",
  slock: "Slock",
  multica: "Multica",
  unknown: "Unknown",
};

/** Channel labels used when an Agent is exposed through a chat or platform surface. */
export const channelKindLabels: Record<ChannelKind, string> = {
  dingtalk: "DingTalk",
  telegram: "Telegram",
  slack: "Slack",
  slock: "Slock",
  multica: "Multica",
  openclaw: "OpenClaw",
  other: "Other",
};

/** Runtime health labels for filters, badges, and summaries. */
export const runtimeHealthLabels: Record<RuntimeHealthStatus, string> = {
  online: "在线",
  degraded: "降级",
  offline: "离线",
  unknown: "未知",
};

/** Runtime operating state derived by Lorume from linked Agent work evidence. */
export type RuntimeOperatingStatus = "working" | "idle" | "offline" | "unknown";

/** Runtime operating labels for Runtime Fleet. */
export const runtimeOperatingStatusLabels: Record<RuntimeOperatingStatus, string> = {
  working: "工作中",
  idle: "空闲",
  offline: "离线",
  unknown: "未知",
};

/** Agent status labels after source-specific states are normalized. */
export const managedAgentStatusLabels: Record<ManagedAgentStatus, string> = {
  active: "活跃",
  idle: "空闲",
  inactive: "停用",
  degraded: "降级",
  unknown: "未知",
};

const unsupportedStatLabel = "不支持采集";
const runtimeHealthOptionOrder: RuntimeHealthStatus[] = ["online", "degraded", "offline", "unknown"];

/** Runtime kind option shown by Runtime Fleet. */
export interface RuntimeFleetRuntimeKindOption {
  /** Filter value. */
  value: RuntimeKind;
  /** Human-readable label. */
  label: string;
}

/** Runtime availability option shown by Runtime Fleet. */
export interface RuntimeFleetHealthOption {
  /** Filter value. */
  value: RuntimeHealthStatus;
  /** Human-readable label. */
  label: string;
}

/** Format runtime timestamps for Chinese-first UI without leaking raw UTC ISO strings. */
export function formatRuntimeTimestamp(value?: string): string {
  if (!value) return "未知";
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(timestamp);
}

/** Runtime display label used consistently across Runtime and Agent surfaces. */
export function runtimeDisplayName(runtime: LorumeRuntime): string {
  return runtime.name;
}

/** Resolve the best available observation time for an Agent row or detail view. */
export function runtimeAgentLastSeenAt(
  agent: ManagedRuntimeAgent,
  runtime?: LorumeRuntime,
  snapshot?: RuntimeInventorySnapshot,
): string | undefined {
  return agent.lastSeenAt ?? runtime?.lastSeenAt ?? snapshot?.observedAt;
}

/** List runtime kinds actually present in the current Runtime Fleet snapshot. */
export function listRuntimeFleetRuntimeKindOptions(snapshot: RuntimeInventorySnapshot): RuntimeFleetRuntimeKindOption[] {
  const kinds = new Set(snapshot.runtimes.map((runtime) => runtime.kind));
  return RUNTIME_KINDS
    .filter((kind) => kinds.has(kind))
    .map((kind) => ({ value: kind, label: runtimeKindLabels[kind] }));
}

/** List runtime availability states actually present in the current Runtime Fleet snapshot. */
export function listRuntimeFleetHealthOptions(snapshot: RuntimeInventorySnapshot): RuntimeFleetHealthOption[] {
  const statuses = new Set(snapshot.runtimes.map((runtime) => runtime.status));
  return runtimeHealthOptionOrder
    .filter((status) => statuses.has(status))
    .map((status) => ({ value: status, label: runtimeHealthLabels[status] }));
}

/** Derive a runtime's coarse operating state without exposing source-platform raw states. */
export function deriveRuntimeOperatingStatus(
  snapshot: RuntimeInventorySnapshot,
  runtime: LorumeRuntime,
  workState?: RuntimeWorkStateSnapshot | null,
): RuntimeOperatingStatus {
  if (snapshot.device.status === "offline" || runtime.status === "offline") return "offline";

  const runtimeAgentIds = new Set(
    snapshot.agents.filter((agent) => agent.runtimeId === runtime.id).map((agent) => agent.id),
  );

  const linkedWorkItems = (workState?.workItems ?? []).filter((workItem) =>
    isWorkItemLinkedToRuntime(workItem, runtime, runtimeAgentIds),
  );
  if (linkedWorkItems.some((workItem) => isProcessingWorkItem(workItem, workState))) return "working";

  const linkedExecutions = selectLatestExecutions(workState?.executions ?? []).filter((execution) =>
    isExecutionLinkedToRuntime(execution, runtime, runtimeAgentIds),
  );
  if (linkedExecutions.some((execution) => execution.status === "queued" || execution.status === "running")) {
    return "working";
  }

  if (linkedWorkItems.length > 0 || linkedExecutions.length > 0) return "idle";

  if (workState && canObserveRuntimeWork(workState.capabilities, runtime)) return "idle";

  return "unknown";
}

/** Derive an Agent's display state from Lorume work evidence before falling back to raw inventory state. */
export function deriveManagedAgentDisplayStatus(
  snapshot: RuntimeInventorySnapshot,
  agent: ManagedRuntimeAgent,
  workState?: RuntimeWorkStateSnapshot | null,
): ManagedAgentStatus {
  if (agent.status === "inactive" || agent.status === "degraded") return agent.status;
  if (!workState) return agent.status;

  const runtime = snapshot.runtimes.find((candidate) => candidate.id === agent.runtimeId);
  if (runtime?.status === "offline" || snapshot.device.status === "offline") return agent.status;

  const linkedWorkItems = workState.workItems.filter((workItem) => isWorkItemLinkedToAgent(workItem, agent));
  if (linkedWorkItems.some((workItem) => isProcessingWorkItem(workItem, workState))) return "active";

  const linkedExecutions = selectLatestExecutions(workState.executions).filter(
    (execution) => execution.agentId === agent.id,
  );
  if (linkedExecutions.some((execution) => execution.status === "queued" || execution.status === "running")) {
    return "active";
  }

  if (linkedWorkItems.length > 0 || linkedExecutions.length > 0) return "idle";
  if (canObserveAgentWork(workState.capabilities, agent)) return "idle";

  return agent.status;
}

/** Filter state supported by the first Runtime Fleet page. */
export interface RuntimeFleetFilters {
  /** Free-text search across device, runtime, agent, channel, and source labels. */
  query?: string;
  /** Runtime or platform kind to keep. */
  runtimeKind?: RuntimeKind | "all";
  /** Runtime health state to keep. */
  runtimeStatus?: RuntimeHealthStatus | "all";
  /** Agent activity state to keep. */
  agentStatus?: ManagedAgentStatus | "all";
}

/** Filtered device inventory shown by Runtime Fleet. */
export interface RuntimeFleetResult {
  /** Device that produced the latest snapshot. */
  device: RuntimeDevice;
  /** Runtimes matching the active filters. */
  runtimes: LorumeRuntime[];
  /** Agents matching the active filters. */
  agents: ManagedRuntimeAgent[];
}

/** Small summary cards for Runtime Fleet. */
export interface RuntimeFleetSummary {
  /** Registered devices represented by the snapshot. */
  devices: number;
  /** Total runtime count represented by the snapshot. */
  runtimes: number;
  /** Online runtime count represented by the snapshot. */
  onlineRuntimes: number;
  /** Total managed agent count represented by the snapshot. */
  agents: number;
  /** Runtime or agent health issues represented by the snapshot. */
  issues: number;
}

/** Detail panel model for device, runtime, or agent selections. */
export interface RuntimeFleetDetailSection {
  /** Section title rendered in the detail panel. */
  title: string;
  /** Human-readable rows in this section. */
  items: string[];
}

interface RuntimeFleetDetailBase {
  /** Stable object id. */
  id: string;
  /** Main detail title. */
  title: string;
  /** Detail subtitle. */
  subtitle: string;
  /** Normalized status used for badge styling and automation. */
  status: RuntimeHealthStatus | ManagedAgentStatus | RuntimeOperatingStatus;
  /** Human-readable status label. */
  statusLabel: string;
  /** Sectioned details for display. */
  sections: RuntimeFleetDetailSection[];
}

export type RuntimeFleetDetail =
  | (RuntimeFleetDetailBase & {
      /** Detail object kind. */
      kind: "device";
    })
  | (RuntimeFleetDetailBase & {
      /** Detail object kind. */
      kind: "runtime";
      /** Runtime kind label. */
      runtimeKindLabel: string;
    })
  | (RuntimeFleetDetailBase & {
      /** Detail object kind. */
      kind: "agent";
      /** Runtime name that owns this agent. */
      runtimeName: string;
    });

/** Summarize one device snapshot for Runtime Fleet cards. */
export function summarizeRuntimeFleet(
  snapshot: RuntimeInventorySnapshot,
  workState?: RuntimeWorkStateSnapshot | null,
): RuntimeFleetSummary {
  const runtimeIssues = snapshot.runtimes.filter((runtime) =>
    ["degraded", "offline", "unknown"].includes(runtime.status),
  ).length;
  const agentIssues = snapshot.agents.filter((agent) =>
    ["inactive", "degraded", "unknown"].includes(deriveManagedAgentDisplayStatus(snapshot, agent, workState)),
  ).length;

  return {
    devices: snapshot.device ? 1 : 0,
    runtimes: snapshot.runtimes.length,
    onlineRuntimes: snapshot.runtimes.filter((runtime) => runtime.status === "online").length,
    agents: snapshot.agents.length,
    issues: runtimeIssues + agentIssues,
  };
}

/** Filter a runtime snapshot while preserving the current device context. */
export function filterRuntimeFleet(
  snapshot: RuntimeInventorySnapshot,
  filters: RuntimeFleetFilters = {},
): RuntimeFleetResult {
  const query = normalizeSearch(filters.query ?? "");

  let runtimes = snapshot.runtimes;
  let agents = snapshot.agents;

  if (filters.runtimeKind && filters.runtimeKind !== "all") {
    runtimes = runtimes.filter((runtime) => runtime.kind === filters.runtimeKind);
    const runtimeIds = new Set(runtimes.map((runtime) => runtime.id));
    agents = agents.filter((agent) => runtimeIds.has(agent.runtimeId));
  }

  if (filters.runtimeStatus && filters.runtimeStatus !== "all") {
    runtimes = runtimes.filter((runtime) => runtime.status === filters.runtimeStatus);
    const runtimeIds = new Set(runtimes.map((runtime) => runtime.id));
    agents = agents.filter((agent) => runtimeIds.has(agent.runtimeId));
  }

  if (filters.agentStatus && filters.agentStatus !== "all") {
    agents = agents.filter((agent) => agent.status === filters.agentStatus);
  }

  if (query) {
    const matchingRuntimes = runtimes.filter((runtime) => runtimeMatches(runtime, query));
    const matchingRuntimeIds = new Set(matchingRuntimes.map((runtime) => runtime.id));
    const matchingAgents = agents.filter(
      (agent) => matchingRuntimeIds.has(agent.runtimeId) || agentMatches(agent, query),
    );
    const agentRuntimeIds = new Set(matchingAgents.map((agent) => agent.runtimeId));

    runtimes = matchingRuntimes.filter((runtime) => agentRuntimeIds.has(runtime.id));
    agents = matchingAgents;
  }

  return {
    device: snapshot.device,
    runtimes,
    agents,
  };
}

/** Resolve a detail panel object from the latest snapshot. */
export function getRuntimeFleetDetail(
  snapshot: RuntimeInventorySnapshot,
  kind: RuntimeFleetDetail["kind"],
  id: string,
  workState?: RuntimeWorkStateSnapshot | null,
): RuntimeFleetDetail | null {
  if (kind === "device" && snapshot.device.id === id) {
    return {
      kind: "device",
      id: snapshot.device.id,
      title: snapshot.device.name,
      subtitle: `最近同步 ${formatRuntimeTimestamp(snapshot.device.lastSeenAt ?? snapshot.observedAt)}`,
      status: snapshot.device.status,
      statusLabel: runtimeHealthLabels[snapshot.device.status],
      sections: [
        {
          title: "身份信息",
          items: [
            `Device ID: ${snapshot.device.id}`,
            `Hostname: ${snapshot.device.hostname}`,
            `OS: ${snapshot.device.os}`,
            `Arch: ${snapshot.device.architecture ?? "unknown"}`,
          ],
        },
        {
          title: "连接状态",
          items: [
            "连接方式: Collector",
            `设备状态: ${runtimeHealthLabels[snapshot.device.status]}`,
            `Collector: ${snapshot.collector.version}`,
          ],
        },
        {
          title: "已注册 Runtime",
          items: registeredRuntimeLabels(snapshot.runtimes),
        },
      ],
    };
  }

  if (kind === "runtime") {
    const runtime = snapshot.runtimes.find((candidate) => candidate.id === id);
    if (!runtime) return null;
    const agents = snapshot.agents.filter((agent) => agent.runtimeId === runtime.id);
    const operatingStatus = deriveRuntimeOperatingStatus(snapshot, runtime, workState);

    return {
      kind: "runtime",
      id: runtime.id,
      title: runtime.name,
      subtitle: `${runtimeKindLabels[runtime.kind]} · ${runtimeOperatingStatusLabels[operatingStatus]}`,
      runtimeKindLabel: runtimeKindLabels[runtime.kind],
      status: operatingStatus,
      statusLabel: runtimeOperatingStatusLabels[operatingStatus],
      sections: [
        {
          title: "身份信息",
          items: [
            `Runtime ID: ${runtime.id}`,
            `Runtime: ${runtimeKindLabels[runtime.kind]}`,
            `Version: ${runtime.version ?? "unknown"}`,
            `可用性: ${runtimeHealthLabels[runtime.status]}`,
            `运行状态: ${runtimeOperatingStatusLabels[operatingStatus]}`,
            `最近同步: ${formatRuntimeTimestamp(runtime.lastSeenAt)}`,
          ],
        },
        {
          title: "归属关系",
          items: [`所属设备: ${snapshot.device.name}`, `Agent 数量: ${agents.length}`],
        },
      ],
    };
  }

  if (kind === "agent") {
    const agent = snapshot.agents.find((candidate) => candidate.id === id);
    if (!agent) return null;
    const runtime = snapshot.runtimes.find((candidate) => candidate.id === agent.runtimeId);
    const displayStatus = deriveManagedAgentDisplayStatus(snapshot, agent, workState);

    return {
      kind: "agent",
      id: agent.id,
      title: agent.name,
      subtitle: `${sourceLabel(agent.origin)} · ${managedAgentStatusLabels[displayStatus]}`,
      runtimeName: runtime?.name ?? agent.runtimeId,
      status: displayStatus,
      statusLabel: managedAgentStatusLabels[displayStatus],
      sections: [
        {
          title: "身份信息",
          items: [
            `Agent ID: ${agent.id}`,
            `Runtime: ${sourceLabel(agent.origin)}`,
            `状态: ${managedAgentStatusLabels[displayStatus]}`,
            `最近同步: ${formatRuntimeTimestamp(runtimeAgentLastSeenAt(agent, runtime, snapshot))}`,
          ],
        },
        {
          title: "归属关系",
          items: [`所属 Runtime: ${runtime?.name ?? agent.runtimeId}`, `所属设备: ${snapshot.device.name}`],
        },
        {
          title: "关联渠道",
          items: labelsForAgent(agent),
        },
        {
          title: "运行统计",
          items: runtimeStatisticsItems(deriveAgentRuntimeStats(agent, workState)),
        },
      ],
    };
  }

  return null;
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

function isWorkItemLinkedToRuntime(
  workItem: RuntimeWorkItem,
  runtime: LorumeRuntime,
  runtimeAgentIds: Set<string>,
): boolean {
  return workItem.runtimeId === runtime.id || Boolean(workItem.agentId && runtimeAgentIds.has(workItem.agentId));
}

function isExecutionLinkedToRuntime(
  execution: RuntimeExecution,
  runtime: LorumeRuntime,
  runtimeAgentIds: Set<string>,
): boolean {
  return execution.runtimeId === runtime.id || Boolean(execution.agentId && runtimeAgentIds.has(execution.agentId));
}

function isConversationLinkedToAgent(
  conversation: NonNullable<RuntimeWorkStateSnapshot["conversations"]>[number],
  agent: ManagedRuntimeAgent,
  linkedWorkItemIds: Set<string>,
): boolean {
  return conversation.agentId === agent.id || Boolean(conversation.workItemId && linkedWorkItemIds.has(conversation.workItemId));
}

function isWorkItemLinkedToAgent(workItem: RuntimeWorkItem, agent: ManagedRuntimeAgent): boolean {
  if (workItem.source === "slock" && workItem.assignee?.label) {
    return participantMatchesAgent(workItem.assignee, agent);
  }
  if (participantMatchesAgent(workItem.assignee, agent)) return true;
  return workItem.agentId === agent.id;
}

function participantMatchesAgent(
  participant: RuntimeWorkParticipant | undefined,
  agent: ManagedRuntimeAgent,
): boolean {
  if (!participant) return false;
  if (participant.objectId === agent.id) return true;
  return normalizeParticipantLabel(participant.label) === normalizeParticipantLabel(agent.name);
}

function normalizeParticipantLabel(value: string | undefined): string {
  return (value ?? "").trim().replace(/^@+/, "").toLowerCase();
}

function deriveAgentRuntimeStats(
  agent: ManagedRuntimeAgent,
  workState?: RuntimeWorkStateSnapshot | null,
): RuntimeActivityStats & { lastError?: string } | undefined {
  if (!workState) return agent.load;

  const linkedWorkItems = workState.workItems.filter((workItem) => isWorkItemLinkedToAgent(workItem, agent));
  const linkedWorkItemIds = new Set(linkedWorkItems.map((workItem) => workItem.id));
  const linkedExecutions = selectLatestExecutions(workState.executions).filter((execution) =>
    execution.agentId === agent.id || Boolean(execution.workItemId && linkedWorkItemIds.has(execution.workItemId)),
  );
  const linkedConversations = workState.conversations.filter((conversation) =>
    isConversationLinkedToAgent(conversation, agent, linkedWorkItemIds),
  );
  const hasObservableAgentWork = linkedWorkItems.length > 0 ||
    linkedExecutions.length > 0 ||
    linkedConversations.length > 0 ||
    canObserveAgentWork(workState.capabilities, agent);

  if (!hasObservableAgentWork) return agent.load;

  const activeWorkItems = linkedWorkItems.filter((workItem) =>
    deriveRuntimeWorkStage({
      source: workItem.source,
      workItemStatus: workItem.status,
      executionStatus: linkedExecutions.find((execution) => execution.workItemId === workItem.id)?.status,
    }).stage === "processing",
  ).length;
  const queuedWorkItems = linkedWorkItems.filter((workItem) =>
    deriveRuntimeWorkStage({
      source: workItem.source,
      workItemStatus: workItem.status,
      executionStatus: linkedExecutions.find((execution) => execution.workItemId === workItem.id)?.status,
    }).stage === "pending",
  ).length;
  const standaloneRunningExecutions = linkedExecutions.filter((execution) =>
    !execution.workItemId && (execution.status === "queued" || execution.status === "running"),
  );

  return {
    ...agent.load,
    activeTasks: activeWorkItems + standaloneRunningExecutions.filter((execution) => execution.status === "running").length,
    queuedTasks: queuedWorkItems + standaloneRunningExecutions.filter((execution) => execution.status === "queued").length,
    activeSessions: linkedConversations.filter((conversation) => conversation.status === "active" || conversation.status === "open").length,
    historicalSessions: linkedConversations.length,
  };
}

function isProcessingWorkItem(workItem: RuntimeWorkItem, workState?: RuntimeWorkStateSnapshot | null): boolean {
  const execution = selectLatestExecutions(workState?.executions ?? []).find(
    (candidate) => candidate.workItemId === workItem.id,
  );
  return deriveRuntimeWorkStage({
    source: workItem.source,
    workItemStatus: workItem.status,
    executionStatus: execution?.status,
  }).stage === "processing";
}

function selectLatestExecutions(executions: RuntimeExecution[]): RuntimeExecution[] {
  const latestByWork = new Map<string, RuntimeExecution>();
  for (const execution of executions) {
    const key = execution.workItemId ?? execution.id;
    const current = latestByWork.get(key);
    if (!current || isExecutionMoreRecent(execution, current)) latestByWork.set(key, execution);
  }
  return Array.from(latestByWork.values());
}

function isExecutionMoreRecent(candidate: RuntimeExecution, current: RuntimeExecution): boolean {
  const candidateTime = executionObservedTime(candidate);
  const currentTime = executionObservedTime(current);
  if (Number.isFinite(candidateTime) && Number.isFinite(currentTime) && candidateTime !== currentTime) {
    return candidateTime > currentTime;
  }
  if (Number.isFinite(candidateTime) && !Number.isFinite(currentTime)) return true;
  return false;
}

function executionObservedTime(execution: RuntimeExecution): number {
  return Date.parse(execution.lastSeenAt ?? execution.endedAt ?? execution.startedAt ?? execution.queuedAt ?? "");
}

function canObserveRuntimeWork(
  capabilities: RuntimeObservationCapability[],
  runtime: LorumeRuntime,
): boolean {
  const runtimeSources = new Set([runtime.kind, ...runtime.sourceRefs.map((ref) => ref.source)]);
  return capabilities.some((capability) =>
    runtimeSources.has(capability.source) &&
    [capability.workItems.support, capability.executions.support].some((support) =>
      support === "supported" || support === "partial",
    ),
  );
}

function canObserveAgentWork(
  capabilities: RuntimeObservationCapability[],
  agent: ManagedRuntimeAgent,
): boolean {
  const agentSources = new Set([agent.origin, ...agent.sourceRefs.map((ref) => ref.source)]);
  return capabilities.some((capability) =>
    agentSources.has(capability.source) &&
    [capability.workItems.support, capability.executions.support].some((support) =>
      support === "supported" || support === "partial",
    ),
  );
}

function includesQuery(values: Array<string | undefined>, query: string): boolean {
  return values.some((value) => value?.toLowerCase().includes(query));
}

function runtimeMatches(runtime: LorumeRuntime, query: string): boolean {
  return includesQuery(
    [
      runtime.name,
      runtime.kind,
      runtimeKindLabels[runtime.kind],
      runtime.version,
      runtime.endpoint,
      ...runtime.capabilities,
      ...runtime.sourceRefs.flatMap((ref) => [ref.source, ref.externalId, ref.label, ref.url]),
    ],
    query,
  );
}

function agentMatches(agent: ManagedRuntimeAgent, query: string): boolean {
  return includesQuery(
    [
      agent.name,
      agent.origin,
      sourceLabel(agent.origin),
      agent.status,
      ...agent.channelBindings.flatMap((binding) => [
        binding.kind,
        channelKindLabels[binding.kind],
        binding.label,
        binding.externalId,
        binding.status,
      ]),
      ...agent.sourceRefs.flatMap((ref) => [ref.source, ref.externalId, ref.label, ref.url]),
    ],
    query,
  );
}

function labelsForAgent(agent: ManagedRuntimeAgent): string[] {
  const labels = agent.channelBindings.map((binding) => binding.label || channelKindLabels[binding.kind]);
  return labels.length ? labels : ["暂无关联渠道"];
}

function labelsForAgents(agents: ManagedRuntimeAgent[]): string[] {
  return Array.from(
    new Set(
      agents.flatMap((agent) =>
        agent.channelBindings.map((binding) => binding.label || channelKindLabels[binding.kind]),
      ),
    ),
  ).sort();
}

function registeredRuntimeLabels(runtimes: LorumeRuntime[]): string[] {
  const labels = runtimes.map(runtimeDisplayName);
  return labels.length ? Array.from(new Set(labels)).sort() : ["暂无已注册 Runtime"];
}

function runtimeStatisticsItems(stats?: RuntimeActivityStats & { lastError?: string }): string[] {
  return [
    `活跃任务: ${statValue(stats?.activeTasks)}`,
    `队列深度: ${statValue(stats?.queuedTasks)}`,
    `活跃会话: ${statValue(stats?.activeSessions)}`,
    `历史会话: ${statValue(stats?.historicalSessions)}`,
    `最大并发: ${statValue(stats?.maxConcurrency)}`,
    stats?.lastError ? `最近错误: ${stats.lastError}` : "",
  ].filter(Boolean);
}

function statValue(value?: number): string {
  return value === undefined ? unsupportedStatLabel : String(value);
}

function sourceLabel(source: RuntimeSource): string {
  return source === "manual" ? "Manual" : runtimeKindLabels[source];
}
