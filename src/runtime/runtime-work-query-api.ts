import type { ChannelKind, RuntimeSource } from "./runtime-normalize";
import type {
  RuntimeConversation,
  RuntimeWorkItem,
  RuntimeWorkItemStatus,
  RuntimeWorkParticipant,
  RuntimeWorkStageId,
  RuntimeWorkStateSnapshot,
} from "./runtime-work-state";
import { WORK_STAGE_IDS } from "./runtime-work-state";
import type { RuntimeWorkBoardFilters } from "./runtime-work-state-query";

/** Backend query response for normalized Runtime work items. */
export interface RuntimeWorkItemsQueryResponse {
  /** Work item rows returned after backend filtering. */
  items: RuntimeWorkItemQueryRow[];
  /** Total matching rows before pagination. */
  total: number;
  /** Cursor for the next page when more rows are available. */
  nextCursor?: string;
}

/** Parsed backend query page plus converted shared work-state snapshot. */
export interface RuntimeWorkItemsQueryPage {
  /** Converted snapshot for the current backend page. */
  snapshot: RuntimeWorkStateSnapshot;
  /** Total matching rows before pagination. */
  total: number;
  /** Cursor for the next page when more rows are available. */
  nextCursor?: string;
}

/** One normalized work item row returned by the backend query API. */
export interface RuntimeWorkItemQueryRow {
  /** Stable Lorume work item id. */
  id: string;
  /** External platform work item id. */
  externalId?: string;
  /** Normalized source runtime/platform. */
  source: string;
  /** Normalized work item status. */
  status: string;
  /** Derived Lorume work stage. */
  stage: string;
  /** User-facing work item title. */
  title: string;
  /** Optional user-facing request/message excerpt. */
  description: string | null;
  /** Owning runtime id. */
  runtimeId: string | null;
  /** Owning or assignee agent id. */
  agentId: string | null;
  /** Linked conversation/thread id. */
  conversationId: string | null;
  /** User-facing channel kind, not runtime kind. */
  channelKind: string | null;
  /** User-facing channel/group/thread label. */
  channelLabel: string | null;
  /** Normalized creator participant. */
  creator: unknown;
  /** Normalized assignee participant. */
  assignee: unknown;
  /** Last observed timestamp. */
  lastSeenAt: string | null;
}

/** Create the formal backend query URL for Runtime work items. */
export function createWorkItemsQueryUrl(
  origin: string,
  filters: RuntimeWorkBoardFilters | undefined,
  options: { cursor?: string } = {},
): URL {
  const requestUrl = new URL("/api/runtime-work-items", origin);
  requestUrl.searchParams.set("limit", "500");
  if (options.cursor) requestUrl.searchParams.set("cursor", options.cursor);
  if (filters?.source && filters.source !== "all") requestUrl.searchParams.set("source", filters.source);
  if (filters?.stage && filters.stage !== "all") requestUrl.searchParams.set("stage", filters.stage);
  if (filters?.channelKind && filters.channelKind !== "all") {
    requestUrl.searchParams.set("channelKind", filters.channelKind);
  }
  if (filters?.search?.trim()) requestUrl.searchParams.set("search", filters.search.trim());
  const startAt = isoTimestampFromFilter(filters?.timeRange?.start);
  const endAt = isoTimestampFromFilter(filters?.timeRange?.end);
  if (startAt) requestUrl.searchParams.set("startAt", startAt);
  if (endAt) requestUrl.searchParams.set("endAt", endAt);
  return requestUrl;
}

/** Convert a backend work-item query response into the shared work-state shape. */
export function runtimeWorkStateSnapshotFromQueryResponse(value: unknown): RuntimeWorkStateSnapshot | null {
  return runtimeWorkItemsQueryPageFromResponse(value)?.snapshot ?? null;
}

/** Convert a backend work-item query response into a snapshot and pagination metadata. */
export function runtimeWorkItemsQueryPageFromResponse(value: unknown): RuntimeWorkItemsQueryPage | null {
  if (!isRuntimeWorkItemsQueryResponse(value)) return null;
  const workItems = value.items.map(runtimeWorkItemFromQueryRow);
  return {
    nextCursor: typeof value.nextCursor === "string" ? value.nextCursor : undefined,
    snapshot: {
      observedAt: latestWorkItemTimestamp(workItems) ?? new Date().toISOString(),
      deviceId: inferDeviceId(workItems),
      workItems,
      conversations: conversationsFromWorkItems(workItems),
      executions: [],
      capabilities: [],
    },
    total: typeof value.total === "number" ? value.total : value.items.length,
  };
}

function runtimeWorkItemFromQueryRow(row: RuntimeWorkItemQueryRow): RuntimeWorkItem {
  return {
    id: row.id,
    source: normalizeRuntimeSource(row.source),
    externalId: row.externalId || row.id,
    title: row.title,
    description: row.description ?? undefined,
    status: normalizeWorkItemStatus(row.status),
    stage: normalizeWorkStage(row.stage),
    channel: row.channelKind || row.channelLabel
      ? {
          kind: normalizeChannelKind(row.channelKind),
          label: row.channelLabel ?? channelLabelFromKind(row.channelKind),
        }
      : undefined,
    assignee: normalizeParticipant(row.assignee),
    creator: normalizeParticipant(row.creator),
    agentId: row.agentId ?? undefined,
    runtimeId: row.runtimeId ?? undefined,
    conversationId: row.conversationId ?? undefined,
    lastSeenAt: row.lastSeenAt ?? undefined,
  };
}

function conversationsFromWorkItems(workItems: RuntimeWorkItem[]): RuntimeConversation[] {
  const conversations = new Map<string, RuntimeConversation>();
  for (const workItem of workItems) {
    if (!workItem.conversationId || conversations.has(workItem.conversationId)) continue;
    conversations.set(workItem.conversationId, {
      id: workItem.conversationId,
      source: workItem.source,
      externalId: workItem.conversationId.split(":").at(-1) || workItem.conversationId,
      status: workItem.status === "in_progress" ? "active" : "closed",
      channel: workItem.channel,
      title: workItem.channel?.label,
      workItemId: workItem.id,
      agentId: workItem.agentId,
      runtimeId: workItem.runtimeId,
      participants: [workItem.creator, workItem.assignee].filter(
        (participant): participant is RuntimeWorkParticipant => Boolean(participant),
      ),
      lastActivityAt: workItem.lastSeenAt ?? workItem.updatedAt,
      lastSeenAt: workItem.lastSeenAt,
    });
  }
  return Array.from(conversations.values());
}

function isRuntimeWorkItemsQueryResponse(value: unknown): value is RuntimeWorkItemsQueryResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RuntimeWorkItemsQueryResponse>;
  return Array.isArray(candidate.items);
}

function normalizeRuntimeSource(value: string): RuntimeSource {
  if (
    value === "openclaw" ||
    value === "multica" ||
    value === "slock" ||
    value === "codex" ||
    value === "claude_code" ||
    value === "manual"
  ) {
    return value;
  }
  return "unknown";
}

function normalizeWorkItemStatus(value: string): RuntimeWorkItemStatus {
  if (
    value === "todo" ||
    value === "in_progress" ||
    value === "in_review" ||
    value === "done" ||
    value === "blocked" ||
    value === "cancelled" ||
    value === "unknown"
  ) {
    return value;
  }
  return "unknown";
}

function normalizeWorkStage(value: string): RuntimeWorkStageId | undefined {
  return WORK_STAGE_IDS.includes(value as RuntimeWorkStageId) ? value as RuntimeWorkStageId : undefined;
}

function normalizeChannelKind(value: string | null): ChannelKind {
  if (
    value === "dingtalk" ||
    value === "telegram" ||
    value === "slack" ||
    value === "slock" ||
    value === "multica" ||
    value === "openclaw" ||
    value === "other"
  ) {
    return value;
  }
  return "other";
}

function channelLabelFromKind(value: string | null): string {
  if (value === "dingtalk") return "DingTalk";
  if (value === "telegram") return "Telegram";
  if (value === "slack") return "Slack";
  return "默认渠道";
}

function normalizeParticipant(value: unknown): RuntimeWorkParticipant | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<RuntimeWorkParticipant>;
  if (typeof candidate.kind !== "string" || typeof candidate.label !== "string") return undefined;
  const kind = candidate.kind === "human" ||
    candidate.kind === "agent" ||
    candidate.kind === "runtime" ||
    candidate.kind === "system"
    ? candidate.kind
    : "unknown";
  return {
    kind,
    label: candidate.label,
    objectId: typeof candidate.objectId === "string" ? candidate.objectId : undefined,
    externalId: typeof candidate.externalId === "string" ? candidate.externalId : undefined,
  };
}

function latestWorkItemTimestamp(workItems: RuntimeWorkItem[]): string | undefined {
  return workItems
    .map((item) => item.lastSeenAt ?? item.updatedAt ?? item.createdAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
}

function inferDeviceId(workItems: RuntimeWorkItem[]): string {
  const firstId = workItems[0]?.id;
  if (!firstId) return "backend";
  return firstId.split(":")[0] || "backend";
}

function isoTimestampFromFilter(value: string | undefined): string | undefined {
  const date = parseDateTimeLocal(value ?? "");
  return date ? date.toISOString() : undefined;
}

function parseDateTimeLocal(value: string): Date | undefined {
  if (!value.trim()) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}
