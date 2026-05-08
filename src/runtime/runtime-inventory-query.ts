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
export type RuntimeFleetDetail =
  | {
      /** Detail object kind. */
      kind: "device";
      /** Stable object id. */
      id: string;
      /** Main detail title. */
      title: string;
      /** Detail subtitle. */
      subtitle: string;
      /** Human-readable status label. */
      statusLabel: string;
      /** Runtime/channel labels related to this device. */
      channelLabels: string[];
      /** Source references related to this object. */
      sourceLabels: string[];
      /** Short detail facts for display. */
      facts: string[];
    }
  | {
      /** Detail object kind. */
      kind: "runtime";
      /** Stable object id. */
      id: string;
      /** Main detail title. */
      title: string;
      /** Detail subtitle. */
      subtitle: string;
      /** Runtime kind label. */
      runtimeKindLabel: string;
      /** Human-readable status label. */
      statusLabel: string;
      /** Channel labels from agents attached to this runtime. */
      channelLabels: string[];
      /** Source references related to this object. */
      sourceLabels: string[];
      /** Runtime capabilities. */
      capabilities: string[];
      /** Short detail facts for display. */
      facts: string[];
    }
  | {
      /** Detail object kind. */
      kind: "agent";
      /** Stable object id. */
      id: string;
      /** Main detail title. */
      title: string;
      /** Detail subtitle. */
      subtitle: string;
      /** Runtime name that owns this agent. */
      runtimeName: string;
      /** Human-readable status label. */
      statusLabel: string;
      /** Channel labels where this agent can be used. */
      channelLabels: string[];
      /** Source references related to this object. */
      sourceLabels: string[];
      /** Short detail facts for display. */
      facts: string[];
    };

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
      subtitle: snapshot.device.hostname,
      statusLabel: runtimeHealthLabels[snapshot.device.status],
      channelLabels: labelsForAgents(snapshot.agents),
      sourceLabels: snapshot.runtimes.flatMap((runtime) => sourceLabels(runtime.sourceRefs)),
      facts: [
        `OS: ${snapshot.device.os}`,
        snapshot.device.architecture ? `Arch: ${snapshot.device.architecture}` : "Arch: unknown",
        `Collector: ${snapshot.collector.version}`,
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
      subtitle: runtime.endpoint ?? runtime.id,
      runtimeKindLabel: runtimeKindLabels[runtime.kind],
      statusLabel: runtimeHealthLabels[runtime.status],
      channelLabels: labelsForAgents(agents),
      sourceLabels: sourceLabels(runtime.sourceRefs),
      capabilities: runtime.capabilities,
      facts: [
        `Kind: ${runtimeKindLabels[runtime.kind]}`,
        runtime.version ? `Version: ${runtime.version}` : "Version: unknown",
        `Agents: ${agents.length}`,
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
      subtitle: `Origin: ${sourceLabel(agent.origin)}`,
      runtimeName: runtime?.name ?? agent.runtimeId,
      statusLabel: managedAgentStatusLabels[agent.status],
      channelLabels: agent.channelBindings.map((binding) => binding.label || channelKindLabels[binding.kind]),
      sourceLabels: sourceLabels(agent.sourceRefs),
      facts: [
        `Runtime: ${runtime?.name ?? agent.runtimeId}`,
        `Origin: ${sourceLabel(agent.origin)}`,
        `Channels: ${agent.channelBindings.length}`,
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

function labelsForAgents(agents: ManagedRuntimeAgent[]): string[] {
  return Array.from(
    new Set(
      agents.flatMap((agent) =>
        agent.channelBindings.map((binding) => binding.label || channelKindLabels[binding.kind]),
      ),
    ),
  ).sort();
}

function sourceLabels(refs: Array<{ source: string; externalId: string; label?: string }>): string[] {
  return refs.map((ref) => `${ref.source}: ${ref.label ?? ref.externalId}`);
}

function sourceLabel(source: RuntimeSource): string {
  return source === "manual" ? "Manual" : runtimeKindLabels[source];
}
