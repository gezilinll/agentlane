import { useEffect, useMemo, useState } from "react";
import fixtureSnapshot from "../../fixtures/runtime/collector-snapshot.sample.json";
import {
  channelKindLabels,
  deriveManagedAgentDisplayStatus,
  deriveRuntimeOperatingStatus,
  filterRuntimeFleet,
  formatRuntimeTimestamp,
  getRuntimeFleetDetail,
  listRuntimeFleetHealthOptions,
  listRuntimeFleetRuntimeKindOptions,
  managedAgentStatusLabels,
  runtimeAgentLastSeenAt,
  runtimeHealthLabels,
  runtimeKindLabels,
  runtimeOperatingStatusLabels,
  summarizeRuntimeFleet,
  type RuntimeFleetDetail,
  type RuntimeFleetFilters,
} from "./runtime-inventory-query";
import {
  type LorumeRuntime,
  type ManagedRuntimeAgent,
  type RuntimeHealthStatus,
  type RuntimeInventorySnapshot,
  type RuntimeKind,
} from "./runtime-normalize";
import type { RuntimeWorkStateSnapshot } from "./runtime-work-state";
import { isFixtureFallbackAllowed } from "./runtime-data-source";
import {
  createWorkItemsQueryUrl,
  runtimeWorkItemsQueryPageFromResponse,
} from "./runtime-work-query-api";
import {
  collectionHealthStatusLabels,
  type CollectionHealthCheck,
  type DeviceCollectionHealth,
} from "./runtime-collection-health";
import { PixelIcon } from "../ui/PixelIcon";

const fixtureRuntimeSnapshot = fixtureSnapshot as RuntimeInventorySnapshot;
const autoRefreshIntervalMs = 30_000;
const remoteRefreshPollIntervalMs = 1_000;
const remoteRefreshMaxPolls = 300;

interface RuntimeFleetQueryResponse {
  observedAt: string | null;
  devices: RuntimeInventorySnapshot["device"][];
  runtimes: LorumeRuntime[];
  agents: ManagedRuntimeAgent[];
}

type RuntimeFleetSelection = {
  kind: RuntimeFleetDetail["kind"];
  id: string;
};

/** First Runtime Fleet surface: inspect registered device, runtimes, agents, and channel exposure. */
export function RuntimeFleetPage() {
  const allowFixtureFallback = isFixtureFallbackAllowed();
  const [snapshot, setSnapshot] = useState<RuntimeInventorySnapshot>(
    allowFixtureFallback ? fixtureRuntimeSnapshot : createEmptyRuntimeInventorySnapshot(),
  );
  const [workStateSnapshot, setWorkStateSnapshot] = useState<RuntimeWorkStateSnapshot | null>(null);
  const [collectionHealth, setCollectionHealth] = useState<DeviceCollectionHealth | null>(null);
  const [dataSource, setDataSource] = useState<"fixture" | "backend">(
    allowFixtureFallback ? "fixture" : "backend",
  );
  const [refreshState, setRefreshState] = useState<{
    status: "idle" | "running" | "success" | "error";
    message: string;
  }>({ status: "idle", message: "" });
  const [lastLoadedAt, setLastLoadedAt] = useState("");
  const [query, setQuery] = useState("");
  const [runtimeKind, setRuntimeKind] = useState<RuntimeKind | "all">("all");
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeHealthStatus | "all">("all");
  const [selection, setSelection] = useState<RuntimeFleetSelection | null>(null);

  async function fetchLatestSnapshot(): Promise<RuntimeInventorySnapshot | null> {
    const queryResponse = await fetch(new URL("/api/runtime-fleet", window.location.origin));
    if (!queryResponse.ok) {
      throw new Error(`runtime fleet query failed: ${queryResponse.status}`);
    }
    const querySnapshot = runtimeFleetSnapshotFromQueryResponse(await queryResponse.json());
    if (!querySnapshot) throw new Error("runtime fleet query returned an invalid payload");
    return querySnapshot;
  }

  async function fetchCollectionHealth(deviceId: string): Promise<DeviceCollectionHealth | null> {
    const response = await fetch(`/api/devices/${encodeURIComponent(deviceId)}/collection-health`);
    if (!response.ok) return null;
    return deviceCollectionHealthFromResponse(await response.json());
  }

  async function fetchLatestWorkStateSnapshot(): Promise<RuntimeWorkStateSnapshot | null> {
    let cursor: string | undefined;
    let snapshot: RuntimeWorkStateSnapshot | null = null;
    for (let page = 0; page < 20; page += 1) {
      const response = await fetch(createWorkItemsQueryUrl(window.location.origin, undefined, { cursor }));
      if (!response.ok) throw new Error(`runtime work item query failed: ${response.status}`);
      const queryPage = runtimeWorkItemsQueryPageFromResponse(await response.json());
      if (!queryPage) throw new Error("runtime work item query returned an invalid payload");
      snapshot = snapshot ? mergeWorkStateSnapshots(snapshot, queryPage.snapshot) : queryPage.snapshot;
      cursor = queryPage.nextCursor;
      if (!cursor) return snapshot;
    }
    throw new Error("runtime work item query returned too many pages");
  }

  function applySnapshot(
    latestSnapshot: RuntimeInventorySnapshot,
    latestWorkState: RuntimeWorkStateSnapshot | null,
    latestCollectionHealth: DeviceCollectionHealth | null,
  ) {
    setSnapshot(latestSnapshot);
    setWorkStateSnapshot(latestWorkState);
    setCollectionHealth(latestCollectionHealth);
    setDataSource("backend");
    setLastLoadedAt(new Date().toISOString());
  }

  async function loadLatestSnapshot(options: { silent?: boolean } = {}): Promise<RuntimeInventorySnapshot | null> {
    try {
      const latestSnapshot = await fetchLatestSnapshot();
      if (!latestSnapshot) return null;
      const [latestWorkState, latestCollectionHealth] = await Promise.all([
        fetchLatestWorkStateSnapshot(),
        fetchCollectionHealth(latestSnapshot.device.id).catch(() => null),
      ]);
      applySnapshot(latestSnapshot, latestWorkState, latestCollectionHealth);
      return latestSnapshot;
    } catch (error) {
      if (!options.silent) {
        setRefreshState({
          status: "error",
          message: error instanceof Error ? error.message : "读取最新快照失败",
        });
      }
      return null;
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadInitialSnapshot() {
      try {
        const latestSnapshot = await fetchLatestSnapshot();
        if (!latestSnapshot) return;
        const [latestWorkState, latestCollectionHealth] = await Promise.all([
          fetchLatestWorkStateSnapshot(),
          fetchCollectionHealth(latestSnapshot.device.id).catch(() => null),
        ]);
        if (!cancelled) applySnapshot(latestSnapshot, latestWorkState, latestCollectionHealth);
      } catch {
        if (!allowFixtureFallback && !cancelled) {
          setRefreshState({ status: "error", message: "后端查询失败，无法读取正式运行资产" });
        }
      }
    }

    void loadInitialSnapshot();
    const refreshTimer = window.setInterval(() => {
      void loadInitialSnapshot();
    }, autoRefreshIntervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, [allowFixtureFallback]);

  const runtimeKindOptions = useMemo(() => listRuntimeFleetRuntimeKindOptions(snapshot), [snapshot]);
  const runtimeStatusOptions = useMemo(() => listRuntimeFleetHealthOptions(snapshot), [snapshot]);
  useEffect(() => {
    if (runtimeKind !== "all" && !runtimeKindOptions.some((option) => option.value === runtimeKind)) {
      setRuntimeKind("all");
    }
  }, [runtimeKind, runtimeKindOptions]);
  useEffect(() => {
    if (runtimeStatus !== "all" && !runtimeStatusOptions.some((option) => option.value === runtimeStatus)) {
      setRuntimeStatus("all");
    }
  }, [runtimeStatus, runtimeStatusOptions]);

  const filters: RuntimeFleetFilters = useMemo(
    () => ({ query, runtimeKind, runtimeStatus }),
    [query, runtimeKind, runtimeStatus],
  );
  const result = useMemo(() => filterRuntimeFleet(snapshot, filters), [filters, snapshot]);
  const summary = useMemo(() => summarizeRuntimeFleet(snapshot, workStateSnapshot), [snapshot, workStateSnapshot]);
  const detail = selection ? getRuntimeFleetDetail(snapshot, selection.kind, selection.id, workStateSnapshot) : null;
  const isRefreshRunning = refreshState.status === "running";
  const refreshButtonLabel = dataSource === "backend" ? "请求设备刷新" : "读取后端数据";

  async function handleRefresh() {
    if (dataSource !== "backend") {
      setRefreshState({ status: "running", message: "正在读取后端数据" });
      const latestSnapshot = await loadLatestSnapshot();
      setRefreshState(
        latestSnapshot
          ? { status: "success", message: "已读取后端数据" }
          : { status: "error", message: "读取后端数据失败" },
      );
      return;
    }

    setRefreshState({ status: "running", message: "正在请求设备刷新" });
    try {
      const refreshResponse = await fetch(`/api/devices/${encodeURIComponent(snapshot.device.id)}/refresh`, {
        method: "POST",
      });
      const refreshBody = (await refreshResponse.json()) as {
        commandId?: string;
        message?: string;
        status?: string;
      };
      if (!refreshResponse.ok || !refreshBody.commandId) {
        throw new Error(refreshBody.message || `刷新请求失败: HTTP ${refreshResponse.status}`);
      }

      setRefreshState({ status: "running", message: "刷新命令已下发" });
      await waitForRemoteRefreshCommand(snapshot.device.id, refreshBody.commandId);
      await loadLatestSnapshot({ silent: true });
      setRefreshState({ status: "success", message: "刷新完成" });
    } catch (error) {
      setRefreshState({
        status: "error",
        message: error instanceof Error ? error.message : "设备刷新失败",
      });
    }
  }

  return (
    <section className="workspace">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Runtime / Device / Agent</p>
          <h1>运行资产</h1>
          <p className="pageSubtitle">
            统一识别设备、Runtime、Agent 与它们暴露到的渠道。当前数据源：
            {dataSource === "backend" ? "后端查询" : "Fixture 样例"}
          </p>
          {lastLoadedAt ? (
            <p className="pageRefreshMeta">上次刷新 {formatRuntimeTimestamp(lastLoadedAt)}</p>
          ) : null}
        </div>
        <div className="refreshControl">
          <button
            className="primaryButton"
            type="button"
            aria-label={refreshButtonLabel}
            disabled={isRefreshRunning}
            onClick={() => {
              void handleRefresh();
            }}
          >
            <PixelIcon name="reload" size={16} />
            {isRefreshRunning ? "刷新中" : refreshButtonLabel}
          </button>
          {refreshState.message ? (
            <p className={`refreshMessage refresh-${refreshState.status}`} role="status">
              {refreshState.message}
            </p>
          ) : null}
        </div>
      </header>

      <section className="toolbar runtimeToolbar" aria-label="运行资产筛选">
        <label className="toolbarField toolbarSearch">
          <span className="controlLabel">搜索</span>
          <span className="searchBox">
            <PixelIcon name="search" size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索设备、Runtime、Agent 或渠道"
            />
          </span>
        </label>

        <label className="toolbarField">
          <span className="controlLabel">Runtime</span>
          <select
            value={runtimeKind}
            onChange={(event) => setRuntimeKind(event.target.value as RuntimeKind | "all")}
          >
            <option value="all">全部</option>
            {runtimeKindOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="toolbarField">
          <span className="controlLabel">可用性</span>
          <select
            value={runtimeStatus}
            onChange={(event) => setRuntimeStatus(event.target.value as RuntimeHealthStatus | "all")}
          >
            <option value="all">全部</option>
            {runtimeStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

      </section>

      <section className="metricGrid" aria-label="运行资产概览">
        <Metric label="设备" value={summary.devices} tone="blue" />
        <Metric label="在线 Runtime" value={summary.onlineRuntimes} tone="green" />
        <Metric label="Agent" value={summary.agents} tone="purple" />
        <Metric label="异常" value={summary.issues} tone="orange" />
      </section>

      <CollectionHealthPanel health={collectionHealth} />

      <section className="runtimeFleetGrid">
        <div className="runtimeStack">
          <DevicePanel snapshot={snapshot} onSelect={() => setSelection({ kind: "device", id: result.device.id })} />
          <RuntimeTable
            deviceName={snapshot.device.name}
            snapshot={snapshot}
            workStateSnapshot={workStateSnapshot}
            runtimes={result.runtimes}
            selectedId={selection?.kind === "runtime" ? selection.id : undefined}
            onSelect={(runtime) => setSelection({ kind: "runtime", id: runtime.id })}
          />
          <AgentTable
            agents={result.agents}
            runtimes={snapshot.runtimes}
            snapshot={snapshot}
            workStateSnapshot={workStateSnapshot}
            selectedId={selection?.kind === "agent" ? selection.id : undefined}
            onSelect={(agent) => setSelection({ kind: "agent", id: agent.id })}
          />
        </div>
        <RuntimeDetail detail={detail} />
      </section>
    </section>
  );
}

async function waitForRemoteRefreshCommand(deviceId: string, commandId: string): Promise<void> {
  for (let attempt = 0; attempt < remoteRefreshMaxPolls; attempt += 1) {
    const commandResponse = await fetch(
      `/api/devices/${encodeURIComponent(deviceId)}/commands/${encodeURIComponent(commandId)}`,
    );
    const commandBody = (await commandResponse.json()) as { status?: string; error?: string };
    if (!commandResponse.ok) {
      throw new Error(commandBody.error || `刷新命令查询失败: HTTP ${commandResponse.status}`);
    }
    if (commandBody.status === "succeeded") return;
    if (commandBody.status === "failed" || commandBody.status === "timed_out") {
      throw new Error(commandBody.error || "设备刷新失败");
    }
    await sleep(remoteRefreshPollIntervalMs);
  }
  throw new Error("设备刷新超时");
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function runtimeFleetSnapshotFromQueryResponse(value: unknown): RuntimeInventorySnapshot | null {
  if (!isRuntimeFleetQueryResponse(value) || value.devices.length === 0) return null;
  return {
    observedAt: value.observedAt ?? value.devices[0].lastSeenAt ?? new Date().toISOString(),
    collector: fixtureRuntimeSnapshot.collector,
    device: value.devices[0],
    runtimes: value.runtimes,
    agents: value.agents,
    reports: [],
  };
}

function createEmptyRuntimeInventorySnapshot(): RuntimeInventorySnapshot {
  return {
    observedAt: new Date(0).toISOString(),
    collector: { version: "unknown", status: "unknown" },
    device: {
      id: "backend",
      name: "暂无设备数据",
      hostname: "backend",
      os: "unknown",
      status: "unknown",
      connectionMode: "collector",
    },
    runtimes: [],
    agents: [],
    reports: [],
  };
}

function isRuntimeFleetQueryResponse(value: unknown): value is RuntimeFleetQueryResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RuntimeFleetQueryResponse>;
  return Array.isArray(candidate.devices) && Array.isArray(candidate.runtimes) && Array.isArray(candidate.agents);
}

function deviceCollectionHealthFromResponse(value: unknown): DeviceCollectionHealth | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<DeviceCollectionHealth>;
  if (
    typeof candidate.deviceId !== "string"
    || !isCollectionHealthStatus(candidate.status)
    || typeof candidate.summary !== "string"
    || !Array.isArray(candidate.checks)
  ) {
    return null;
  }
  const checks = candidate.checks.filter(isCollectionHealthCheck);
  if (checks.length === 0) return null;
  return {
    checks,
    deviceId: candidate.deviceId,
    lastObservedAt: typeof candidate.lastObservedAt === "string" ? candidate.lastObservedAt : undefined,
    lastReceivedAt: typeof candidate.lastReceivedAt === "string" ? candidate.lastReceivedAt : undefined,
    status: candidate.status,
    summary: candidate.summary,
  };
}

function isCollectionHealthCheck(value: unknown): value is CollectionHealthCheck {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CollectionHealthCheck>;
  return (
    (candidate.id === "inventory" || candidate.id === "work_state")
    && typeof candidate.label === "string"
    && isCollectionHealthStatus(candidate.status)
    && typeof candidate.message === "string"
    && Array.isArray(candidate.warnings)
    && typeof candidate.counts === "object"
    && Boolean(candidate.counts)
  );
}

function isCollectionHealthStatus(value: unknown): value is DeviceCollectionHealth["status"] {
  return value === "healthy" || value === "warning" || value === "stale" || value === "failed" || value === "unknown";
}

function mergeWorkStateSnapshots(
  current: RuntimeWorkStateSnapshot,
  next: RuntimeWorkStateSnapshot,
): RuntimeWorkStateSnapshot {
  return {
    observedAt: next.observedAt > current.observedAt ? next.observedAt : current.observedAt,
    deviceId: next.deviceId || current.deviceId,
    workItems: mergeById(current.workItems, next.workItems),
    conversations: mergeById(current.conversations, next.conversations),
    executions: mergeById(current.executions, next.executions),
    capabilities: mergeBySource(current.capabilities, next.capabilities),
    warnings: [...(current.warnings ?? []), ...(next.warnings ?? [])],
  };
}

function mergeById<T extends { id: string }>(current: T[], next: T[]): T[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of next) byId.set(item.id, item);
  return Array.from(byId.values());
}

function mergeBySource<T extends { source: string }>(current: T[], next: T[]): T[] {
  const bySource = new Map(current.map((item) => [item.source, item]));
  for (const item of next) bySource.set(item.source, item);
  return Array.from(bySource.values());
}

function formatCollectionCounts(check: CollectionHealthCheck): string {
  if (check.id === "inventory") {
    return `设备 ${check.counts.devices ?? 0} · Runtime ${check.counts.runtimes ?? 0} · Agent ${check.counts.agents ?? 0}`;
  }
  return `工作项 ${check.counts.workItems ?? 0} · 会话 ${check.counts.conversations ?? 0} · 执行 ${check.counts.executions ?? 0}`;
}

function Metric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`metricCard metric${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CollectionHealthPanel({ health }: { health: DeviceCollectionHealth | null }) {
  if (!health) return null;
  return (
    <section className="collectionHealthPanel" aria-label="采集健康">
      <div className="collectionHealthSummary">
        <div>
          <h2>采集健康</h2>
          <p>{health.summary}</p>
        </div>
        <StatusBadge label={collectionHealthStatusLabels[health.status]} status={health.status} />
      </div>
      <div className="collectionHealthChecks">
        {health.checks.map((check) => (
          <article className="collectionHealthCheck" key={check.id}>
            <div className="collectionHealthCheckHeader">
              <strong>{check.label}</strong>
              <StatusBadge label={collectionHealthStatusLabels[check.status]} status={check.status} />
            </div>
            <p>{check.message}</p>
            <small>最近收到 {formatRuntimeTimestamp(check.lastReceivedAt)}</small>
            <small>{formatCollectionCounts(check)}</small>
            {check.error ? <small className="healthIssueText">错误：{check.error}</small> : null}
            {check.warnings.length > 0 ? (
              <small className="healthIssueText">最近警告：{check.warnings[0]}</small>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function DevicePanel({
  snapshot,
  onSelect,
}: {
  snapshot: RuntimeInventorySnapshot;
  onSelect: () => void;
}) {
  return (
    <section className="tablePanel devicePanel" aria-label="设备">
      <div className="runtimePanelHeader">
        <div>
          <h2>设备</h2>
          <p>最新采集快照来源</p>
        </div>
        <PixelIcon name="server" size={18} />
      </div>
      <button className="deviceSummary" type="button" onClick={onSelect}>
        <span className="iconSquare">
          <PixelIcon name="monitor" size={18} />
        </span>
        <span>
          <strong>{snapshot.device.name}</strong>
          <small>{snapshot.device.hostname}</small>
          <small>最近同步 {formatRuntimeTimestamp(snapshot.device.lastSeenAt ?? snapshot.observedAt)}</small>
        </span>
        <StatusBadge label={runtimeHealthLabels[snapshot.device.status]} status={snapshot.device.status} />
      </button>
    </section>
  );
}

function RuntimeTable({
  deviceName,
  snapshot,
  workStateSnapshot,
  runtimes,
  selectedId,
  onSelect,
}: {
  deviceName: string;
  snapshot: RuntimeInventorySnapshot;
  workStateSnapshot: RuntimeWorkStateSnapshot | null;
  runtimes: LorumeRuntime[];
  selectedId?: string;
  onSelect: (runtime: LorumeRuntime) => void;
}) {
  return (
    <section className="tablePanel runtimeAssetPanel" aria-label="Runtime 列表">
      <div className="runtimePanelHeader">
        <div>
          <h2>Runtime</h2>
          <p>{runtimes.length} 个 Runtime 匹配当前筛选</p>
        </div>
        <PixelIcon name="cpu" size={18} />
      </div>
      {runtimes.length === 0 ? (
        <EmptyAsset message="没有匹配的 Runtime" />
      ) : (
        <div className="assetTable runtimeTable" role="table" aria-label="Runtime 列表">
          <div className="assetRow assetHeader runtimeTableRow" role="row">
            <span role="columnheader">名称</span>
            <span role="columnheader">Runtime</span>
            <span role="columnheader">所属设备</span>
            <span role="columnheader">可用性</span>
            <span role="columnheader">运行状态</span>
            <span role="columnheader">最近同步</span>
          </div>
          {runtimes.map((runtime) => {
            const operatingStatus = deriveRuntimeOperatingStatus(snapshot, runtime, workStateSnapshot);
            return (
              <button
                className={
                  runtime.id === selectedId
                    ? "assetRow assetDataRow runtimeTableRow tableRowActive"
                    : "assetRow assetDataRow runtimeTableRow"
                }
                key={runtime.id}
                type="button"
                role="row"
                onClick={() => onSelect(runtime)}
              >
                <span className="nameCell" role="cell">
                  <strong>{runtime.name}</strong>
                  <small>{runtime.id}</small>
                </span>
                <span role="cell">
                  <Badge>{runtimeKindLabels[runtime.kind]}</Badge>
                </span>
                <span className="mutedAssetText" role="cell">
                  {deviceName}
                </span>
                <span role="cell">
                  <StatusBadge label={runtimeHealthLabels[runtime.status]} status={runtime.status} />
                </span>
                <span role="cell">
                  <StatusBadge
                    label={runtimeOperatingStatusLabels[operatingStatus]}
                    status={operatingStatus}
                  />
                </span>
                <span className="mutedAssetText" role="cell">
                  {formatRuntimeTimestamp(runtime.lastSeenAt)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function AgentTable({
  agents,
  runtimes,
  snapshot,
  workStateSnapshot,
  selectedId,
  onSelect,
}: {
  agents: ManagedRuntimeAgent[];
  runtimes: LorumeRuntime[];
  snapshot: RuntimeInventorySnapshot;
  workStateSnapshot: RuntimeWorkStateSnapshot | null;
  selectedId?: string;
  onSelect: (agent: ManagedRuntimeAgent) => void;
}) {
  const runtimeById = new Map(runtimes.map((runtime) => [runtime.id, runtime]));

  return (
    <section className="tablePanel runtimeAssetPanel" aria-label="Agent 列表">
      <div className="runtimePanelHeader">
        <div>
          <h2>Agent</h2>
          <p>{agents.length} 个 Agent 匹配当前筛选</p>
        </div>
        <PixelIcon name="bot" size={18} />
      </div>
      {agents.length === 0 ? (
        <EmptyAsset message="没有匹配的 Agent" />
      ) : (
        <div className="assetTable agentTable" role="table" aria-label="Agent 列表">
          <div className="assetRow assetHeader agentTableRow" role="row">
            <span role="columnheader">名称</span>
            <span role="columnheader">归属 Runtime</span>
            <span role="columnheader">关联渠道</span>
            <span role="columnheader">状态</span>
            <span role="columnheader">最近同步</span>
          </div>
          {agents.map((agent) => {
            const displayStatus = deriveManagedAgentDisplayStatus(snapshot, agent, workStateSnapshot);
            return (
              <button
                className={
                  agent.id === selectedId
                    ? "assetRow assetDataRow agentTableRow tableRowActive"
                    : "assetRow assetDataRow agentTableRow"
                }
                key={agent.id}
                type="button"
                role="row"
                onClick={() => onSelect(agent)}
              >
                <span className="nameCell" role="cell">
                  <strong>{agent.name}</strong>
                  <small>{agent.id}</small>
                </span>
                <span className="mutedAssetText" role="cell">
                  {runtimeById.get(agent.runtimeId)?.name ?? agent.runtimeId}
                </span>
                <span className="channelList" role="cell">
                {agent.channelBindings.map((binding, index) => (
                  <Badge key={`${agent.id}-${binding.kind}-${binding.externalId ?? index}`}>
                    {binding.label || channelKindLabels[binding.kind]}
                  </Badge>
                ))}
                </span>
                <span role="cell">
                  <StatusBadge label={managedAgentStatusLabels[displayStatus]} status={displayStatus} />
                </span>
                <span className="mutedAssetText" role="cell">
                  {formatRuntimeTimestamp(runtimeAgentLastSeenAt(agent, runtimeById.get(agent.runtimeId), snapshot))}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function RuntimeDetail({ detail }: { detail: RuntimeFleetDetail | null }) {
  if (!detail) {
    return (
      <aside className="detailPanel" aria-label="运行资产详情">
        <h2>资产详情</h2>
        <p>选择设备、Runtime 或 Agent 查看完整信息。</p>
      </aside>
    );
  }

  return (
    <aside className="detailPanel" aria-label="运行资产详情">
      <div className="detailHeader">
        <div>
          <p className="eyebrow">{detail.kind}</p>
          <h2>{detail.title}</h2>
        </div>
        <StatusBadge label={detail.statusLabel} status={detail.status} />
      </div>
      <DetailBlock title="概览">{detail.subtitle}</DetailBlock>
      {detail.sections.map((section) => (
        <DetailList key={section.title} title={section.title} items={section.items} />
      ))}
    </aside>
  );
}

function DetailBlock({ title, children }: { title: string; children: string }) {
  return (
    <section className="detailBlock">
      <h3>{title}</h3>
      <p>{children}</p>
    </section>
  );
}

function DetailList({
  title,
  items,
  emptyLabel = "暂无",
}: {
  title: string;
  items: string[];
  emptyLabel?: string;
}) {
  return (
    <section className="detailBlock">
      <h3>{title}</h3>
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mutedText">{emptyLabel}</p>
      )}
    </section>
  );
}

function EmptyAsset({ message }: { message: string }) {
  return (
    <div className="emptyAsset">
      <p>{message}</p>
    </div>
  );
}

function Badge({ children }: { children: string }) {
  return <span className="badge">{children}</span>;
}

function StatusBadge({ label, status }: { label: string; status: string }) {
  return <span className={`statusBadge status-${status}`}>{label}</span>;
}
