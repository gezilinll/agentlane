import type { ChannelKind, RuntimeSource } from "./runtime-normalize";
import {
  deriveRuntimeWorkStage,
  WORK_STAGE_IDS,
  type RuntimeExecution,
  type RuntimeObservationSupport,
  type RuntimeWorkItem,
  type RuntimeWorkStageConfidence,
  type RuntimeWorkStageId,
  type RuntimeWorkStateSnapshot,
} from "./runtime-work-state";

/** Filters supported by the read-only Runs / Work Board query model. */
export interface RuntimeWorkBoardFilters {
  /** Runtime source filter. */
  source?: RuntimeSource | "all";
  /** Unified stage filter. */
  stage?: RuntimeWorkStageId | "all";
  /** User-facing channel filter; runtime/platform names are intentionally excluded. */
  channelKind?: RuntimeWorkChannelKind | "all";
  /** Inclusive last-seen time range filter for work cards. */
  timeRange?: RuntimeWorkTimeRangeFilter;
  /** Stage confidence filter. */
  confidence?: RuntimeWorkStageConfidence | "all";
  /** Case-insensitive text search across title, source, runtime, agent, and channel labels. */
  search?: string;
}

/** Frontend-ready Runs / Work Board model. */
export interface RuntimeWorkBoard {
  /** Latest snapshot timestamp. */
  observedAt: string;
  /** Device that produced the snapshot. */
  deviceId: string;
  /** Lanes in stable Agentlane-owned order. */
  lanes: RuntimeWorkBoardLane[];
  /** Flat filtered items for detail lookup and counts. */
  visibleItems: RuntimeWorkBoardItem[];
  /** Summary counts shown above the board. */
  summary: RuntimeWorkBoardSummary;
  /** Capability notes kept for diagnostics and harness assertions, not for task-card rendering. */
  capabilityNotes: RuntimeWorkCapabilityNote[];
}

/** One WorkStage lane on the board. */
export interface RuntimeWorkBoardLane {
  /** Agentlane-owned stage id. */
  stage: RuntimeWorkStageId;
  /** Human-readable stage label. */
  label: string;
  /** Items visible in this lane after filters. */
  items: RuntimeWorkBoardItem[];
}

/** One frontend-ready work board item. */
export interface RuntimeWorkBoardItem {
  /** Stable item id. */
  id: string;
  /** Display title. */
  title: string;
  /** Source platform after adapter normalization. */
  source: RuntimeSource;
  /** Human-readable runtime label used by task cards and details. */
  runtimeLabel: string;
  /** Unified Agentlane-owned stage. */
  stage: RuntimeWorkStageId;
  /** Evidence confidence for the stage. */
  confidence: RuntimeWorkStageConfidence;
  /** Short reasons explaining stage derivation. */
  reasons: string[];
  /** Item category used by details and visual treatment. */
  kind: "work_item";
  /** Linked work item status when present. */
  workItemStatus?: RuntimeWorkItem["status"];
  /** Linked execution status when present. */
  executionStatus?: RuntimeExecution["status"];
  /** Runtime id for grouping and details. */
  runtimeId?: string;
  /** Agent id for grouping and details. */
  agentId?: string;
  /** Channel label when the source exposes one. */
  channelLabel?: string;
  /** User-facing channel kind when the source exposes one. */
  channelKind?: RuntimeWorkChannelKind;
  /** Human-readable channel kind label when the source exposes one. */
  channelKindLabel?: string;
  /** Work item creator label when the source exposes one. */
  creatorLabel: string;
  /** Agent or assignee currently carrying this item. */
  assigneeLabel: string;
  /** Short request/message excerpt suitable for card display and search. */
  requestExcerpt: string;
  /** Latest observed timestamp for this item. */
  lastSeenAt?: string;
  /** Original normalized work item, when this item is work-item backed. */
  workItem?: RuntimeWorkItem;
  /** Original normalized execution, when this item has execution evidence. */
  execution?: RuntimeExecution;
}

/** Summary counts shown above the board. */
export interface RuntimeWorkBoardSummary {
  /** Total visible items. */
  totalItems: number;
  /** Visible item count by stage. */
  byStage: Record<RuntimeWorkStageId, number>;
  /** Visible items with partial stage confidence. */
  partialItems: number;
  /** Visible items whose stage is unsupported by current evidence. */
  unsupportedItems: number;
  /** Unsupported capability surfaces across all source adapters. */
  unsupportedCapabilities: number;
}

/** Capability note used for diagnostics when support is partial, unsupported, or unknown. */
export interface RuntimeWorkCapabilityNote {
  /** Source platform. */
  source: RuntimeSource;
  /** Capability surface. */
  surface: "workItems" | "conversations" | "executions";
  /** Support level reported by adapter. */
  support: RuntimeObservationSupport;
  /** Human-readable limitation text. */
  limitation: string;
}

/** Channel kinds that represent user-facing message surfaces on the Runs board. */
export type RuntimeWorkChannelKind = Extract<ChannelKind, "dingtalk" | "telegram" | "slack" | "other">;

/** Channel option shown by the Runs board filter. */
export interface RuntimeWorkChannelOption {
  /** Filter value. */
  value: RuntimeWorkChannelKind;
  /** Human-readable label. */
  label: string;
}

/** Inclusive time range used by Runs to filter cards by latest observed time. */
export interface RuntimeWorkTimeRangeFilter {
  /** Inclusive start timestamp. */
  start?: string;
  /** Inclusive end timestamp. */
  end?: string;
}

/** User-facing channel labels for Runs. Runtime/platform names are not channel labels here. */
export const runtimeWorkChannelLabels: Record<RuntimeWorkChannelKind, string> = {
  dingtalk: "DingTalk",
  telegram: "Telegram",
  slack: "Slack",
  other: "其他渠道",
};

const runtimeWorkChannelOrder: RuntimeWorkChannelKind[] = ["dingtalk", "telegram", "slack", "other"];

const STAGE_LABELS: Record<RuntimeWorkStageId, string> = {
  pending: "待处理",
  processing: "处理中",
  review: "待验收",
  closed: "已关闭",
  attention: "需关注",
};

/** Create the frontend-ready Runs / Work Board from a normalized snapshot. */
export function createRuntimeWorkBoard(
  snapshot: RuntimeWorkStateSnapshot,
  filters: RuntimeWorkBoardFilters = {},
): RuntimeWorkBoard {
  const allItems = createBoardItems(snapshot);
  const visibleItems = allItems.filter((item) => matchesFilters(item, filters));
  const lanes = WORK_STAGE_IDS.map((stage): RuntimeWorkBoardLane => ({
    stage,
    label: STAGE_LABELS[stage],
    items: visibleItems.filter((item) => item.stage === stage),
  }));

  return {
    observedAt: snapshot.observedAt,
    deviceId: snapshot.deviceId,
    lanes,
    visibleItems,
    summary: createSummary(visibleItems, snapshot),
    capabilityNotes: createCapabilityNotes(snapshot),
  };
}

/** List user-facing channels actually present in a work-state snapshot. */
export function listRuntimeWorkChannelOptions(snapshot: RuntimeWorkStateSnapshot): RuntimeWorkChannelOption[] {
  const kinds = new Set<RuntimeWorkChannelKind>();
  for (const workItem of snapshot.workItems) {
    const kind = normalizeWorkChannelKind(workItem.channel?.kind);
    if (kind) kinds.add(kind);
  }
  return runtimeWorkChannelOrder
    .filter((kind) => kinds.has(kind))
    .map((kind) => ({ value: kind, label: runtimeWorkChannelLabels[kind] }));
}

function createBoardItems(snapshot: RuntimeWorkStateSnapshot): RuntimeWorkBoardItem[] {
  const executionsByWorkItemId = new Map<string, RuntimeExecution>();
  for (const execution of snapshot.executions) {
    if (!execution.workItemId) continue;
    const current = executionsByWorkItemId.get(execution.workItemId);
    if (!current || isExecutionMoreRecent(execution, current)) {
      executionsByWorkItemId.set(execution.workItemId, execution);
    }
  }

  return snapshot.workItems.map((workItem) => {
    const execution = executionsByWorkItemId.get(workItem.id);
    return createWorkItemBoardItem(workItem, execution);
  }).sort(compareBoardItems);
}

function createWorkItemBoardItem(workItem: RuntimeWorkItem, execution?: RuntimeExecution): RuntimeWorkBoardItem {
  const derivation = deriveRuntimeWorkStage({
    source: workItem.source,
    workItemStatus: workItem.status,
    executionStatus: execution?.status,
  });
  const stage = normalizeMaterializedStage(workItem.stage) ?? derivation.stage;
  const channelKind = normalizeWorkChannelKind(workItem.channel?.kind);

  return {
    id: workItem.id,
    title: workItem.title,
    source: workItem.source,
    runtimeLabel: sourceLabel(workItem.source),
    stage,
    confidence: workItem.stage ? "direct" : derivation.confidence,
    reasons: workItem.stage ? ["Backend query returned the materialized Agentlane work stage."] : derivation.reasons,
    kind: "work_item",
    workItemStatus: workItem.status,
    executionStatus: execution?.status,
    runtimeId: workItem.runtimeId,
    agentId: workItem.agentId,
    channelLabel: displayChannelLabel(workItem.channel),
    channelKind,
    channelKindLabel: channelKind ? runtimeWorkChannelLabels[channelKind] : undefined,
    creatorLabel: participantLabel(workItem.creator, "不支持采集"),
    assigneeLabel: participantLabel(workItem.assignee, compactObjectId(workItem.agentId)),
    requestExcerpt: createRequestExcerpt(workItem.description ?? workItem.title),
    lastSeenAt: workItem.lastSeenAt ?? workItem.updatedAt ?? execution?.lastSeenAt,
    workItem,
    execution,
  };
}

function normalizeMaterializedStage(stage: RuntimeWorkItem["stage"]): RuntimeWorkStageId | undefined {
  return stage && WORK_STAGE_IDS.includes(stage) ? stage : undefined;
}

function createSummary(
  visibleItems: RuntimeWorkBoardItem[],
  snapshot: RuntimeWorkStateSnapshot,
): RuntimeWorkBoardSummary {
  const byStage = Object.fromEntries(WORK_STAGE_IDS.map((stage) => [stage, 0])) as Record<RuntimeWorkStageId, number>;
  for (const item of visibleItems) byStage[item.stage] += 1;

  return {
    totalItems: visibleItems.length,
    byStage,
    partialItems: visibleItems.filter((item) => item.confidence === "partial").length,
    unsupportedItems: visibleItems.filter((item) => item.confidence === "unsupported").length,
    unsupportedCapabilities: createCapabilityNotes(snapshot).filter((note) => note.support === "unsupported" || note.support === "unknown").length,
  };
}

function createCapabilityNotes(snapshot: RuntimeWorkStateSnapshot): RuntimeWorkCapabilityNote[] {
  return snapshot.capabilities.flatMap((capability) =>
    (["workItems", "conversations", "executions"] as const).flatMap((surface) => {
      const detail = capability[surface];
      if (detail.support === "supported") return [];
      return [{
        source: capability.source,
        surface,
        support: detail.support,
        limitation: detail.limitations[0] ?? `${sourceLabel(capability.source)} ${surface} is ${detail.support}.`,
      }];
    }),
  );
}

function matchesFilters(item: RuntimeWorkBoardItem, filters: RuntimeWorkBoardFilters): boolean {
  if (filters.source && filters.source !== "all" && item.source !== filters.source) return false;
  if (filters.stage && filters.stage !== "all" && item.stage !== filters.stage) return false;
  if (filters.channelKind && filters.channelKind !== "all" && item.channelKind !== filters.channelKind) return false;
  if (!matchesTimeRange(item.lastSeenAt, filters.timeRange)) return false;
  if (filters.confidence && filters.confidence !== "all" && item.confidence !== filters.confidence) return false;
  const search = filters.search?.trim().toLowerCase();
  if (!search) return true;
  return [
    item.title,
    item.source,
    item.runtimeLabel,
    item.runtimeId,
    item.agentId,
    item.channelLabel,
    item.channelKindLabel,
    item.creatorLabel,
    item.assigneeLabel,
    item.requestExcerpt,
    item.workItemStatus,
    item.executionStatus,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(search));
}

function matchesTimeRange(value: string | undefined, timeRange: RuntimeWorkTimeRangeFilter | undefined): boolean {
  const start = parseTimeFilterValue(timeRange?.start);
  const end = parseTimeFilterValue(timeRange?.end);
  if (start === undefined && end === undefined) return true;

  const timestamp = Date.parse(value ?? "");
  if (!Number.isFinite(timestamp)) return false;
  if (start !== undefined && timestamp < start) return false;
  if (end !== undefined && timestamp > end) return false;
  return true;
}

function parseTimeFilterValue(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function compareBoardItems(left: RuntimeWorkBoardItem, right: RuntimeWorkBoardItem): number {
  const leftTime = Date.parse(left.lastSeenAt ?? "");
  const rightTime = Date.parse(right.lastSeenAt ?? "");
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return rightTime - leftTime;
  }
  return left.title.localeCompare(right.title);
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

function sourceLabel(source: RuntimeSource): string {
  if (source === "openclaw") return "OpenClaw";
  if (source === "multica") return "Multica";
  if (source === "slock") return "Slock";
  if (source === "codex") return "Codex";
  if (source === "claude_code") return "Claude Code";
  if (source === "unknown") return "未知";
  return "Manual";
}

function normalizeWorkChannelKind(kind: ChannelKind | undefined): RuntimeWorkChannelKind | undefined {
  if (!kind) return undefined;
  if (kind === "dingtalk" || kind === "telegram" || kind === "slack" || kind === "other") return kind;
  return undefined;
}

function displayChannelLabel(channel: RuntimeWorkItem["channel"]): string | undefined {
  const label = channel?.label?.trim();
  if (!label) return undefined;
  if (channel?.kind === "dingtalk") {
    const generatedDingTalkId = label.match(/^DingTalk\s+(群聊|私聊)\s+(.+)$/i);
    if (generatedDingTalkId && isOpaqueDingTalkTargetId(generatedDingTalkId[2])) {
      if (generatedDingTalkId[1] === "私聊") return "DingTalk 私聊";
      return `DingTalk ${generatedDingTalkId[1]}`;
    }
  }
  return label;
}

function isOpaqueDingTalkTargetId(value: string | undefined): boolean {
  const normalized = value?.trim() ?? "";
  return (
    /^cid/i.test(normalized) ||
    /^[A-Za-z0-9+/=_-]{2,}\.\.\.[A-Za-z0-9+/=_-]{2,}$/.test(normalized) ||
    /^[0-9A-Za-z+/=_-]{8,}$/.test(normalized)
  );
}

function participantLabel(participant: RuntimeWorkItem["creator"], fallback: string): string {
  return participant?.label?.trim() || fallback;
}

function compactObjectId(value: string | undefined): string {
  if (!value) return "不支持采集";
  const lastPart = value.split(":").at(-1);
  return lastPart || value;
}

function createRequestExcerpt(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 80) return normalized;
  return `${normalized.slice(0, 80)}...`;
}
