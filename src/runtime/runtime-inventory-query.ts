import type {
  AgentlaneRuntime,
  ChannelKind,
  RuntimeSource,
  ManagedAgentStatus,
  ManagedRuntimeAgent,
  RuntimeDevice,
  RuntimeHealthStatus,
  RuntimeInventorySnapshot,
  RuntimeKind,
} from "./runtime-normalize";

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

/** Agent status labels after source-specific states are normalized. */
export const managedAgentStatusLabels: Record<ManagedAgentStatus, string> = {
  active: "活跃",
  idle: "空闲",
  inactive: "停用",
  degraded: "降级",
  unknown: "未知",
};

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
  /** Channel/platform exposure to keep. */
  channelKind?: ChannelKind | "all";
}

/** Filtered device inventory shown by Runtime Fleet. */
export interface RuntimeFleetResult {
  /** Device that produced the latest snapshot. */
  device: RuntimeDevice;
  /** Runtimes matching the active filters. */
  runtimes: AgentlaneRuntime[];
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
  status: RuntimeHealthStatus | ManagedAgentStatus;
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
export function summarizeRuntimeFleet(snapshot: RuntimeInventorySnapshot): RuntimeFleetSummary {
  const runtimeIssues = snapshot.runtimes.filter((runtime) =>
    ["degraded", "offline", "unknown"].includes(runtime.status),
  ).length;
  const agentIssues = snapshot.agents.filter((agent) =>
    ["inactive", "degraded", "unknown"].includes(agent.status),
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

  if (filters.channelKind && filters.channelKind !== "all") {
    agents = agents.filter((agent) =>
      agent.channelBindings.some((binding) => binding.kind === filters.channelKind),
    );
    const runtimeIds = new Set(agents.map((agent) => agent.runtimeId));
    runtimes = runtimes.filter((runtime) => runtimeIds.has(runtime.id));
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
): RuntimeFleetDetail | null {
  if (kind === "device" && snapshot.device.id === id) {
    return {
      kind: "device",
      id: snapshot.device.id,
      title: snapshot.device.name,
      subtitle: `最近同步 ${snapshot.device.lastSeenAt ?? snapshot.observedAt}`,
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
            `最近同步: ${snapshot.device.lastSeenAt ?? snapshot.observedAt}`,
            `Collector: ${snapshot.collector.version}`,
          ],
        },
        {
          title: "平台注册",
          items: platformRegistrationLabels(snapshot.runtimes),
        },
      ],
    };
  }

  if (kind === "runtime") {
    const runtime = snapshot.runtimes.find((candidate) => candidate.id === id);
    if (!runtime) return null;
    const agents = snapshot.agents.filter((agent) => agent.runtimeId === runtime.id);

    return {
      kind: "runtime",
      id: runtime.id,
      title: runtime.name,
      subtitle: `${runtimeKindLabels[runtime.kind]} · ${runtimeHealthLabels[runtime.status]}`,
      runtimeKindLabel: runtimeKindLabels[runtime.kind],
      status: runtime.status,
      statusLabel: runtimeHealthLabels[runtime.status],
      sections: [
        {
          title: "身份信息",
          items: [
            `Runtime ID: ${runtime.id}`,
            `Kind: ${runtimeKindLabels[runtime.kind]}`,
            `Version: ${runtime.version ?? "unknown"}`,
          ],
        },
        {
          title: "归属关系",
          items: [`所属设备: ${snapshot.device.name}`, `Agent 数量: ${agents.length}`],
        },
        {
          title: "运行入口",
          items: [runtime.endpoint ?? "暂无运行入口"],
        },
        {
          title: "健康状态",
          items: runtimeHealthItems(runtime),
        },
      ],
    };
  }

  if (kind === "agent") {
    const agent = snapshot.agents.find((candidate) => candidate.id === id);
    if (!agent) return null;
    const runtime = snapshot.runtimes.find((candidate) => candidate.id === agent.runtimeId);

    return {
      kind: "agent",
      id: agent.id,
      title: agent.name,
      subtitle: `${sourceLabel(agent.origin)} · ${managedAgentStatusLabels[agent.status]}`,
      runtimeName: runtime?.name ?? agent.runtimeId,
      status: agent.status,
      statusLabel: managedAgentStatusLabels[agent.status],
      sections: [
        {
          title: "身份信息",
          items: [`Agent ID: ${agent.id}`, `来源平台: ${sourceLabel(agent.origin)}`, `状态: ${managedAgentStatusLabels[agent.status]}`],
        },
        {
          title: "归属关系",
          items: [`所属 Runtime: ${runtime?.name ?? agent.runtimeId}`, `所属设备: ${snapshot.device.name}`],
        },
        {
          title: "可用渠道",
          items: labelsForAgent(agent),
        },
        {
          title: "负载状态",
          items: agentLoadItems(agent),
        },
      ],
    };
  }

  return null;
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

function includesQuery(values: Array<string | undefined>, query: string): boolean {
  return values.some((value) => value?.toLowerCase().includes(query));
}

function runtimeMatches(runtime: AgentlaneRuntime, query: string): boolean {
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
  return labels.length ? labels : ["暂无可用渠道"];
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

function platformRegistrationLabels(runtimes: AgentlaneRuntime[]): string[] {
  const labels = runtimes.flatMap((runtime) =>
    runtime.sourceRefs.map((ref) => `${sourceLabel(ref.source)}: ${ref.label ?? ref.externalId}`),
  );
  return labels.length ? Array.from(new Set(labels)).sort() : ["暂无平台注册"];
}

function runtimeHealthItems(runtime: AgentlaneRuntime): string[] {
  return [
    `状态: ${runtimeHealthLabels[runtime.status]}`,
    `最近同步: ${runtime.lastSeenAt ?? "unknown"}`,
    runtime.health?.activeTasks === undefined ? "" : `活跃任务: ${runtime.health.activeTasks}`,
    runtime.health?.queueDepth === undefined ? "" : `队列深度: ${runtime.health.queueDepth}`,
    runtime.health?.activeSessions === undefined ? "" : `活跃会话: ${runtime.health.activeSessions}`,
    runtime.health?.lastError ? `最近错误: ${runtime.health.lastError}` : "",
  ].filter(Boolean);
}

function agentLoadItems(agent: ManagedRuntimeAgent): string[] {
  if (!agent.load) return ["暂无负载数据"];
  return [
    agent.load.activeTasks === undefined ? "" : `活跃任务: ${agent.load.activeTasks}`,
    agent.load.queueDepth === undefined ? "" : `队列深度: ${agent.load.queueDepth}`,
    agent.load.activeSessions === undefined ? "" : `活跃会话: ${agent.load.activeSessions}`,
    agent.load.maxConcurrentTasks === undefined ? "" : `最大并发: ${agent.load.maxConcurrentTasks}`,
  ].filter(Boolean);
}

function sourceLabel(source: RuntimeSource): string {
  return source === "manual" ? "Manual" : runtimeKindLabels[source];
}
