/** Concrete runtime or platform kind that Lorume currently recognizes. */
export const RUNTIME_KINDS = [
  "openclaw",
  "codex",
  "claude_code",
  "slock",
  "multica",
  "unknown",
] as const;

/** Concrete runtime or platform kind that Lorume currently recognizes. */
export type RuntimeKind = (typeof RUNTIME_KINDS)[number];

/** Source adapter that reported a runtime or agent. */
export type RuntimeSource = RuntimeKind | "manual";

/** Normalized health state used by devices, runtimes, and agents. */
export type RuntimeHealthStatus = "online" | "degraded" | "offline" | "unknown";

/** Agent activity state after adapter-specific states are mapped into Lorume. */
export type ManagedAgentStatus = "active" | "idle" | "inactive" | "degraded" | "unknown";

/** Channel or platform surface where an Agent is visible or usable. */
export type ChannelKind = "dingtalk" | "telegram" | "slack" | "slock" | "multica" | "openclaw" | "other";

/** Reference back to an external platform/runtime object. */
export interface ExternalRuntimeRef {
  /** Adapter or platform that owns the external object. */
  source: RuntimeSource;
  /** External id from the source system. */
  externalId: string;
  /** Optional human-readable external object label. */
  label?: string;
  /** Optional external object URL if the platform exposes one. */
  url?: string;
}

/** Device-level collector metadata. */
export interface RuntimeCollectorInfo {
  /** Collector version string. */
  version: string;
  /** Collector process health. */
  status: RuntimeHealthStatus;
  /** Optional installed collector path on the device. */
  installPath?: string;
  /** Optional most recent collector error. */
  lastError?: string;
}

/** Registered device viewed by Lorume. */
export interface RuntimeDevice {
  /** Stable Lorume device id. */
  id: string;
  /** Human-readable device name. */
  name: string;
  /** Hostname reported by the device. */
  hostname: string;
  /** Operating system name such as darwin or linux. */
  os: string;
  /** CPU architecture such as arm64 or x64. */
  architecture?: string;
  /** Device health rolled up from collector and runtime reports. */
  status: RuntimeHealthStatus;
  /** Product connection mode; SSH is only a developer transport for testing installs. */
  connectionMode: "collector";
  /** ISO timestamp when the device was last observed. */
  lastSeenAt?: string;
}

/** Runtime view after adapter reports are normalized. */
export interface LorumeRuntime {
  /** Stable Lorume runtime id. */
  id: string;
  /** Device id that owns this runtime. */
  deviceId: string;
  /** Concrete runtime/platform kind. */
  kind: RuntimeKind;
  /** Human-readable runtime name. */
  name: string;
  /** Runtime health state. */
  status: RuntimeHealthStatus;
  /** Optional runtime version. */
  version?: string;
  /** Optional local or remote endpoint label. */
  endpoint?: string;
  /** Capabilities reported by this runtime adapter. */
  capabilities: string[];
  /** ISO timestamp when this runtime was last observed. */
  lastSeenAt?: string;
  /** External platform references that produced this runtime. */
  sourceRefs: ExternalRuntimeRef[];
  /** Optional runtime health detail. */
  health?: {
    /** Optional latest runtime error summary. */
    lastError?: string;
    /** Optional current running task count after adapter normalization. */
    activeTasks?: number;
    /** Optional current queued task count after adapter normalization. */
    queuedTasks?: number;
    /** Optional current active session count after adapter normalization. */
    activeSessions?: number;
    /** Optional historical or cumulative session count after adapter normalization. */
    historicalSessions?: number;
    /** Optional configured concurrency capacity after adapter normalization. */
    maxConcurrency?: number;
  };
}

/** Channel/platform exposure for a managed Agent. */
export interface ChannelBinding {
  /** Channel or platform kind. */
  kind: ChannelKind;
  /** Human-readable channel label. */
  label: string;
  /** Optional external channel id. */
  externalId?: string;
  /** Optional channel binding state. */
  status?: "enabled" | "disabled" | "unknown";
}

/** Normalized runtime or agent activity statistics owned by Lorume. */
export interface RuntimeActivityStats {
  /** Current running task count. */
  activeTasks?: number;
  /** Current queued task count. */
  queuedTasks?: number;
  /** Current active session count. */
  activeSessions?: number;
  /** Historical or cumulative session count. */
  historicalSessions?: number;
  /** Configured concurrency capacity. */
  maxConcurrency?: number;
}

/** Lorume target level that owns a discovered Skill package on a device. */
export type RuntimeSkillDiscoveryTargetType = "device" | "runtime" | "agent";

/** One text file found inside a discovered Skill package. */
export interface RuntimeSkillDiscoveryFile {
  /** Package-relative file path. */
  path: string;
  /** UTF-8 file content used when promoting this Skill into organization storage. */
  content: string;
  /** Optional content hash reported by the collector. */
  contentHash?: string;
  /** Optional file size in bytes reported by the collector. */
  sizeBytes?: number;
}

/** Skill package discovery reported by one adapter before normalization. */
export interface RuntimeSkillDiscoveryReport {
  /** Adapter-local Skill id, usually the local directory name. */
  externalId: string;
  /** Target level that currently owns the Skill package. */
  targetType: RuntimeSkillDiscoveryTargetType;
  /** Adapter-local runtime id when the target is a runtime or agent. */
  runtimeExternalId?: string;
  /** Adapter-local agent id when the target is an agent. */
  agentExternalId?: string;
  /** Human-readable Skill name. */
  name: string;
  /** Human-readable Skill description. */
  description: string;
  /** Stable package hash reported by the collector. */
  packageHash: string;
  /** Local path on the device where the Skill was discovered. */
  path: string;
  /** Text files captured from the package for promotion. */
  files: RuntimeSkillDiscoveryFile[];
  /** ISO timestamp when this Skill was last observed. */
  lastSeenAt?: string;
}

/** Normalized Skill package discovered from a registered device/runtime/agent target. */
export interface RuntimeSkillDiscovery {
  /** Stable Lorume discovery id. */
  id: string;
  /** Device id that owns this local Skill package. */
  deviceId: string;
  /** Adapter or runtime source that found this package. */
  source: RuntimeSource;
  /** Target level that currently owns the Skill package. */
  targetType: RuntimeSkillDiscoveryTargetType;
  /** Stable Lorume target id. */
  targetId: string;
  /** Human-readable target name when available. */
  targetName?: string;
  /** Stable Lorume runtime id when the target is a runtime or agent. */
  runtimeId?: string;
  /** Stable Lorume agent id when the target is an agent. */
  agentId?: string;
  /** Human-readable Skill name. */
  name: string;
  /** Human-readable Skill description. */
  description: string;
  /** Stable package hash reported by the collector. */
  packageHash: string;
  /** Local path on the device where the Skill was discovered. */
  skillPath: string;
  /** Text files captured from the package for promotion. */
  files: RuntimeSkillDiscoveryFile[];
  /** ISO timestamp when this Skill was last observed. */
  lastSeenAt?: string;
}

/** Agent view after adapter reports are normalized. */
export interface ManagedRuntimeAgent {
  /** Stable Lorume agent id. */
  id: string;
  /** Runtime id this agent belongs to. */
  runtimeId: string;
  /** Human-readable agent name. */
  name: string;
  /** Platform or runtime source that defined the agent. */
  origin: RuntimeSource;
  /** Agent activity state. */
  status: ManagedAgentStatus;
  /** Channels or platforms where this agent is visible or usable. */
  channelBindings: ChannelBinding[];
  /** External platform references that produced this agent. */
  sourceRefs: ExternalRuntimeRef[];
  /** ISO timestamp when this agent was last observed by its adapter. */
  lastSeenAt?: string;
  /** Optional normalized load and concurrency summary. */
  load?: RuntimeActivityStats;
}

/** Runtime discovery reported by one adapter before normalization. */
export interface RuntimeDiscovery {
  /** Adapter-local runtime id. */
  externalId: string;
  /** Concrete runtime/platform kind. */
  kind: RuntimeKind;
  /** Human-readable runtime name. */
  name: string;
  /** Runtime health state. */
  status: RuntimeHealthStatus;
  /** Optional runtime version. */
  version?: string;
  /** Optional endpoint label. */
  endpoint?: string;
  /** Runtime capabilities reported by the adapter. */
  capabilities: string[];
  /** ISO timestamp when this runtime was last observed by its adapter. */
  lastSeenAt?: string;
  /** Optional external references in addition to the adapter-local id. */
  sourceRefs?: ExternalRuntimeRef[];
  /** Optional runtime health detail using Lorume-owned statistic semantics. */
  health?: LorumeRuntime["health"];
}

/** Agent discovery reported by one adapter before normalization. */
export interface AgentDiscovery {
  /** Adapter-local agent id. */
  externalId: string;
  /** Adapter-local runtime id this agent belongs to. */
  runtimeExternalId: string;
  /** Human-readable agent name. */
  name: string;
  /** Platform or runtime source that defined the agent. */
  origin: RuntimeSource;
  /** Agent activity state. */
  status: ManagedAgentStatus;
  /** Channels or platforms where this agent is visible or usable. */
  channelBindings: ChannelBinding[];
  /** Optional external references in addition to the adapter-local id. */
  sourceRefs?: ExternalRuntimeRef[];
  /** ISO timestamp when this agent was last observed by its adapter. */
  lastSeenAt?: string;
  /** Optional normalized load and concurrency summary. */
  load?: ManagedRuntimeAgent["load"];
}

/** Read-only discovery report returned by a runtime adapter. */
export interface RuntimeAdapterReport {
  /** Adapter source. */
  source: RuntimeSource;
  /** ISO timestamp when this adapter collected its data. */
  collectedAt: string;
  /** Runtimes discovered by this adapter. */
  runtimes: RuntimeDiscovery[];
  /** Agents discovered by this adapter. */
  agents: AgentDiscovery[];
  /** Optional Skill packages discovered from this adapter's device/runtime/agent targets. */
  skillDiscoveries?: RuntimeSkillDiscoveryReport[];
  /** Optional adapter warnings that should not fail the whole snapshot. */
  warnings?: string[];
}

/** Normalized collector snapshot consumed by Lorume. */
export interface RuntimeInventorySnapshot {
  /** ISO timestamp when the full snapshot was observed. */
  observedAt: string;
  /** Collector metadata. */
  collector: RuntimeCollectorInfo;
  /** Device metadata and rolled-up status. */
  device: RuntimeDevice;
  /** Normalized runtimes on the device. */
  runtimes: LorumeRuntime[];
  /** Normalized agents on the device. */
  agents: ManagedRuntimeAgent[];
  /** Normalized local Skill packages discovered on the device. */
  skillDiscoveries: RuntimeSkillDiscovery[];
  /** Adapter reports that contributed to this snapshot. */
  reports: RuntimeAdapterReport[];
}

/** Input for creating a normalized runtime inventory snapshot. */
export interface CreateRuntimeInventorySnapshotInput {
  /** Device metadata before status rollup. */
  device: RuntimeDevice;
  /** ISO timestamp when the full snapshot was observed. */
  observedAt: string;
  /** Collector metadata. */
  collector: RuntimeCollectorInfo;
  /** Adapter reports to normalize. */
  reports: RuntimeAdapterReport[];
}

/** Counts for runtime health states in a snapshot. */
export interface RuntimeStatusCounts {
  /** Total runtime count. */
  total: number;
  /** Online runtime count. */
  online: number;
  /** Degraded runtime count. */
  degraded: number;
  /** Offline runtime count. */
  offline: number;
  /** Unknown runtime count. */
  unknown: number;
}

/** Counts for managed agent activity states in a snapshot. */
export interface ManagedAgentStatusCounts {
  /** Total managed agent count. */
  total: number;
  /** Active agent count. */
  active: number;
  /** Idle agent count. */
  idle: number;
  /** Inactive agent count. */
  inactive: number;
  /** Degraded agent count. */
  degraded: number;
  /** Unknown agent count. */
  unknown: number;
}

/** Small inventory summary for cards, tests, and health checks. */
export interface RuntimeInventorySummary {
  /** Device health state. */
  deviceStatus: RuntimeHealthStatus;
  /** Runtime status counts. */
  runtimes: RuntimeStatusCounts;
  /** Managed agent status counts. */
  agents: ManagedAgentStatusCounts;
  /** Sorted unique channel kinds used by managed agents. */
  channelKinds: ChannelKind[];
}

function slugPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function runtimeId(deviceId: string, source: RuntimeSource, externalId: string): string {
  return `${slugPart(deviceId)}:${slugPart(source)}:${slugPart(externalId)}`;
}

function agentId(resolvedRuntimeId: string, externalId: string): string {
  return `${resolvedRuntimeId}:agent:${slugPart(externalId)}`;
}

function rollupDeviceStatus(
  collector: RuntimeCollectorInfo,
  runtimes: LorumeRuntime[],
): RuntimeHealthStatus {
  if (collector.status === "offline") return "offline";
  if (collector.status === "degraded") return "degraded";
  if (runtimes.some((runtime) => runtime.status === "degraded")) return "degraded";
  if (runtimes.some((runtime) => runtime.status === "online")) return "online";
  if (runtimes.some((runtime) => runtime.status === "offline")) return "offline";
  return "unknown";
}

function sourceRefsForRuntime(source: RuntimeSource, runtime: RuntimeDiscovery): ExternalRuntimeRef[] {
  return [
    { source, externalId: runtime.externalId, label: runtime.name },
    ...(runtime.sourceRefs ?? []),
  ];
}

function sourceRefsForAgent(source: RuntimeSource, agent: AgentDiscovery): ExternalRuntimeRef[] {
  return [
    { source, externalId: agent.externalId, label: agent.name },
    ...(agent.sourceRefs ?? []),
  ];
}

/** Normalize adapter reports into stable Lorume device, runtime, and agent objects. */
export function createRuntimeInventorySnapshot(
  input: CreateRuntimeInventorySnapshotInput,
): RuntimeInventorySnapshot {
  const runtimeIdBySourceAndExternalId = new Map<string, string>();
  const runtimeNameById = new Map<string, string>();
  const runtimes = input.reports.flatMap((report) =>
    report.runtimes.map((runtime) => {
      const id = runtimeId(input.device.id, report.source, runtime.externalId);
      runtimeIdBySourceAndExternalId.set(`${report.source}:${runtime.externalId}`, id);
      runtimeNameById.set(id, runtime.name);
      return {
        id,
        deviceId: input.device.id,
        kind: runtime.kind,
        name: runtime.name,
        status: runtime.status,
        version: runtime.version,
        endpoint: runtime.endpoint,
        capabilities: runtime.capabilities,
        lastSeenAt: runtime.lastSeenAt ?? report.collectedAt,
        sourceRefs: sourceRefsForRuntime(report.source, runtime),
        health: runtime.health,
      };
    }),
  );

  const agentIdBySourceRuntimeAndExternalId = new Map<string, string>();
  const agentNameById = new Map<string, string>();
  const agents = input.reports.flatMap((report) =>
    report.agents.map((agent) => {
      const resolvedRuntimeId =
        runtimeIdBySourceAndExternalId.get(`${report.source}:${agent.runtimeExternalId}`) ??
        runtimeId(input.device.id, report.source, agent.runtimeExternalId);
      const id = agentId(resolvedRuntimeId, agent.externalId);
      agentIdBySourceRuntimeAndExternalId.set(`${report.source}:${agent.runtimeExternalId}:${agent.externalId}`, id);
      agentNameById.set(id, agent.name);
      return {
        id,
        runtimeId: resolvedRuntimeId,
        name: agent.name,
        origin: agent.origin,
        status: agent.status,
        channelBindings: agent.channelBindings,
        sourceRefs: sourceRefsForAgent(report.source, agent),
        lastSeenAt: agent.lastSeenAt ?? report.collectedAt,
        load: agent.load,
      };
    }),
  );

  const skillDiscoveries = input.reports.flatMap((report) =>
    (report.skillDiscoveries ?? []).flatMap((discovery) =>
      normalizeSkillDiscovery({
        device: input.device,
        discovery,
        report,
        runtimeIdBySourceAndExternalId,
        runtimeNameById,
        agentIdBySourceRuntimeAndExternalId,
        agentNameById,
      }),
    ),
  );

  const deviceStatus = rollupDeviceStatus(input.collector, runtimes);

  return {
    observedAt: input.observedAt,
    collector: input.collector,
    device: {
      ...input.device,
      status: deviceStatus,
      lastSeenAt: input.observedAt,
    },
    runtimes,
    agents,
    skillDiscoveries,
    reports: input.reports,
  };
}

function normalizeSkillDiscovery({
  agentIdBySourceRuntimeAndExternalId,
  agentNameById,
  device,
  discovery,
  report,
  runtimeIdBySourceAndExternalId,
  runtimeNameById,
}: {
  agentIdBySourceRuntimeAndExternalId: Map<string, string>;
  agentNameById: Map<string, string>;
  device: RuntimeDevice;
  discovery: RuntimeSkillDiscoveryReport;
  report: RuntimeAdapterReport;
  runtimeIdBySourceAndExternalId: Map<string, string>;
  runtimeNameById: Map<string, string>;
}): RuntimeSkillDiscovery[] {
  const runtimeIdForDiscovery = discovery.runtimeExternalId
    ? runtimeIdBySourceAndExternalId.get(`${report.source}:${discovery.runtimeExternalId}`) ??
      runtimeId(device.id, report.source, discovery.runtimeExternalId)
    : undefined;
  const agentIdForDiscovery = discovery.targetType === "agent" && discovery.runtimeExternalId && discovery.agentExternalId
    ? agentIdBySourceRuntimeAndExternalId.get(`${report.source}:${discovery.runtimeExternalId}:${discovery.agentExternalId}`) ??
      agentId(runtimeIdForDiscovery ?? runtimeId(device.id, report.source, discovery.runtimeExternalId), discovery.agentExternalId)
    : undefined;

  const targetId = discovery.targetType === "device"
    ? device.id
    : discovery.targetType === "runtime"
      ? runtimeIdForDiscovery
      : agentIdForDiscovery;
  if (!targetId) return [];

  const targetName = discovery.targetType === "device"
    ? device.name
    : discovery.targetType === "runtime"
      ? runtimeIdForDiscovery ? runtimeNameById.get(runtimeIdForDiscovery) : undefined
      : agentIdForDiscovery ? agentNameById.get(agentIdForDiscovery) : undefined;

  return [{
    agentId: agentIdForDiscovery,
    description: discovery.description,
    deviceId: device.id,
    files: discovery.files,
    id: `${targetId}:skill:${slugPart(discovery.externalId || discovery.name || discovery.path)}`,
    lastSeenAt: discovery.lastSeenAt ?? report.collectedAt,
    name: discovery.name,
    packageHash: discovery.packageHash,
    runtimeId: runtimeIdForDiscovery,
    skillPath: discovery.path,
    source: report.source,
    targetId,
    targetName,
    targetType: discovery.targetType,
  }];
}

/** Summarize a normalized runtime inventory snapshot. */
export function summarizeRuntimeInventory(snapshot: RuntimeInventorySnapshot): RuntimeInventorySummary {
  const runtimes: RuntimeStatusCounts = {
    total: snapshot.runtimes.length,
    online: 0,
    degraded: 0,
    offline: 0,
    unknown: 0,
  };
  for (const runtime of snapshot.runtimes) {
    runtimes[runtime.status] += 1;
  }

  const agents: ManagedAgentStatusCounts = {
    total: snapshot.agents.length,
    active: 0,
    idle: 0,
    inactive: 0,
    degraded: 0,
    unknown: 0,
  };
  for (const agent of snapshot.agents) {
    agents[agent.status] += 1;
  }

  const channelKinds = Array.from(
    new Set(snapshot.agents.flatMap((agent) => agent.channelBindings.map((binding) => binding.kind))),
  ).sort();

  return {
    deviceStatus: snapshot.device.status,
    runtimes,
    agents,
    channelKinds,
  };
}
