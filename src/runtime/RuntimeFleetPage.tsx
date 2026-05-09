import { Bot, Cpu, Monitor, RefreshCw, Search, Server } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import fixtureSnapshot from "../../fixtures/runtime/collector-snapshot.sample.json";
import {
  channelKindLabels,
  filterRuntimeFleet,
  formatRuntimeTimestamp,
  getRuntimeFleetDetail,
  managedAgentStatusLabels,
  runtimeAgentLastSeenAt,
  runtimeHealthLabels,
  runtimeKindLabels,
  summarizeRuntimeFleet,
  type RuntimeFleetDetail,
  type RuntimeFleetFilters,
} from "./runtime-inventory-query";
import {
  RUNTIME_KINDS,
  type AgentlaneRuntime,
  type ChannelKind,
  type ManagedRuntimeAgent,
  type RuntimeHealthStatus,
  type RuntimeInventorySnapshot,
  type RuntimeKind,
} from "./runtime-normalize";

const fixtureRuntimeSnapshot = fixtureSnapshot as RuntimeInventorySnapshot;
const autoRefreshIntervalMs = 30_000;

const channelOptions: ChannelKind[] = ["dingtalk", "slock", "multica", "openclaw", "other"];
const runtimeStatusOptions: RuntimeHealthStatus[] = ["online", "degraded", "offline", "unknown"];

type RuntimeFleetSelection = {
  kind: RuntimeFleetDetail["kind"];
  id: string;
};

/** First Runtime Fleet surface: inspect registered device, runtimes, agents, and channel exposure. */
export function RuntimeFleetPage() {
  const [snapshot, setSnapshot] = useState<RuntimeInventorySnapshot>(fixtureRuntimeSnapshot);
  const [dataSource, setDataSource] = useState<"fixture" | "backend">("fixture");
  const [refreshState, setRefreshState] = useState<{
    status: "idle" | "running" | "success" | "error";
    message: string;
  }>({ status: "idle", message: "" });
  const [lastLoadedAt, setLastLoadedAt] = useState("");
  const [query, setQuery] = useState("");
  const [runtimeKind, setRuntimeKind] = useState<RuntimeKind | "all">("all");
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeHealthStatus | "all">("all");
  const [channelKind, setChannelKind] = useState<ChannelKind | "all">("all");
  const [selection, setSelection] = useState<RuntimeFleetSelection | null>(null);

  async function fetchLatestSnapshot(): Promise<RuntimeInventorySnapshot | null> {
    const requestUrl = new URL("/api/runtime-inventory/latest", window.location.origin);
    const response = await fetch(requestUrl);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`runtime inventory request failed: ${response.status}`);
    return (await response.json()) as RuntimeInventorySnapshot;
  }

  function applySnapshot(latestSnapshot: RuntimeInventorySnapshot) {
    setSnapshot(latestSnapshot);
    setDataSource("backend");
    setLastLoadedAt(new Date().toISOString());
  }

  async function loadLatestSnapshot(options: { silent?: boolean } = {}): Promise<RuntimeInventorySnapshot | null> {
    try {
      const latestSnapshot = await fetchLatestSnapshot();
      if (latestSnapshot) applySnapshot(latestSnapshot);
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
        if (!cancelled && latestSnapshot) applySnapshot(latestSnapshot);
      } catch {
        // The page remains useful with the bundled fixture when no local backend is running.
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
  }, []);

  const filters: RuntimeFleetFilters = useMemo(
    () => ({ query, runtimeKind, runtimeStatus, channelKind }),
    [channelKind, query, runtimeKind, runtimeStatus],
  );
  const result = useMemo(() => filterRuntimeFleet(snapshot, filters), [filters, snapshot]);
  const summary = useMemo(() => summarizeRuntimeFleet(snapshot), [snapshot]);
  const detail = selection ? getRuntimeFleetDetail(snapshot, selection.kind, selection.id) : null;
  const isRefreshRunning = refreshState.status === "running";
  const refreshButtonLabel = dataSource === "backend" ? "请求设备刷新" : "读取最新快照";

  async function handleRefresh() {
    if (dataSource !== "backend") {
      setRefreshState({ status: "running", message: "正在读取后端快照" });
      const latestSnapshot = await loadLatestSnapshot();
      setRefreshState(
        latestSnapshot
          ? { status: "success", message: "已读取最新快照" }
          : { status: "error", message: "当前没有后端快照，继续使用 Fixture" },
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
      const commandResponse = await fetch(
        `/api/devices/${encodeURIComponent(snapshot.device.id)}/commands/${encodeURIComponent(refreshBody.commandId)}`,
      );
      const commandBody = (await commandResponse.json()) as { status?: string; error?: string };
      if (commandResponse.ok && commandBody.status === "succeeded") {
        await loadLatestSnapshot({ silent: true });
        setRefreshState({ status: "success", message: "刷新完成" });
        return;
      }
      if (commandResponse.ok && commandBody.status === "failed") {
        throw new Error(commandBody.error || "设备刷新失败");
      }
      setRefreshState({ status: "success", message: "刷新命令已下发" });
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
            {dataSource === "backend" ? "Backend" : "Fixture"}
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
            <RefreshCw size={16} aria-hidden="true" />
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
            <Search size={16} aria-hidden="true" />
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
            <option value="all">全部 Runtime</option>
            {RUNTIME_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {runtimeKindLabels[kind]}
              </option>
            ))}
          </select>
        </label>

        <label className="toolbarField">
          <span className="controlLabel">状态</span>
          <select
            value={runtimeStatus}
            onChange={(event) => setRuntimeStatus(event.target.value as RuntimeHealthStatus | "all")}
          >
            <option value="all">全部状态</option>
            {runtimeStatusOptions.map((status) => (
              <option key={status} value={status}>
                {runtimeHealthLabels[status]}
              </option>
            ))}
          </select>
        </label>

        <label className="toolbarField">
          <span className="controlLabel">Channel</span>
          <select
            value={channelKind}
            onChange={(event) => setChannelKind(event.target.value as ChannelKind | "all")}
          >
            <option value="all">全部 Channel</option>
            {channelOptions.map((channel) => (
              <option key={channel} value={channel}>
                {channelKindLabels[channel]}
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

      <section className="runtimeFleetGrid">
        <div className="runtimeStack">
          <DevicePanel snapshot={snapshot} onSelect={() => setSelection({ kind: "device", id: result.device.id })} />
          <RuntimeTable
            deviceName={snapshot.device.name}
            runtimes={result.runtimes}
            selectedId={selection?.kind === "runtime" ? selection.id : undefined}
            onSelect={(runtime) => setSelection({ kind: "runtime", id: runtime.id })}
          />
          <AgentTable
            agents={result.agents}
            runtimes={snapshot.runtimes}
            snapshot={snapshot}
            selectedId={selection?.kind === "agent" ? selection.id : undefined}
            onSelect={(agent) => setSelection({ kind: "agent", id: agent.id })}
          />
        </div>
        <RuntimeDetail detail={detail} />
      </section>
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`metricCard metric${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
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
        <Server size={18} aria-hidden="true" />
      </div>
      <button className="deviceSummary" type="button" onClick={onSelect}>
        <span className="iconSquare">
          <Monitor size={18} aria-hidden="true" />
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
  runtimes,
  selectedId,
  onSelect,
}: {
  deviceName: string;
  runtimes: AgentlaneRuntime[];
  selectedId?: string;
  onSelect: (runtime: AgentlaneRuntime) => void;
}) {
  return (
    <section className="tablePanel runtimeAssetPanel" aria-label="Runtime 列表">
      <div className="runtimePanelHeader">
        <div>
          <h2>Runtime</h2>
          <p>{runtimes.length} 个 Runtime 匹配当前筛选</p>
        </div>
        <Cpu size={18} aria-hidden="true" />
      </div>
      {runtimes.length === 0 ? (
        <EmptyAsset message="没有匹配的 Runtime" />
      ) : (
        <div className="assetTable runtimeTable" role="table" aria-label="Runtime 列表">
          <div className="assetRow assetHeader runtimeTableRow" role="row">
            <span role="columnheader">名称</span>
            <span role="columnheader">Kind</span>
            <span role="columnheader">所属设备</span>
            <span role="columnheader">状态</span>
            <span role="columnheader">最近同步</span>
          </div>
          {runtimes.map((runtime) => (
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
              <span className="mutedAssetText" role="cell">
                {formatRuntimeTimestamp(runtime.lastSeenAt)}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function AgentTable({
  agents,
  runtimes,
  snapshot,
  selectedId,
  onSelect,
}: {
  agents: ManagedRuntimeAgent[];
  runtimes: AgentlaneRuntime[];
  snapshot: RuntimeInventorySnapshot;
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
        <Bot size={18} aria-hidden="true" />
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
          {agents.map((agent) => (
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
                {agent.channelBindings.map((binding) => (
                  <Badge key={`${agent.id}-${binding.kind}`}>{binding.label || channelKindLabels[binding.kind]}</Badge>
                ))}
              </span>
              <span role="cell">
                <StatusBadge label={managedAgentStatusLabels[agent.status]} status={agent.status} />
              </span>
              <span className="mutedAssetText" role="cell">
                {formatRuntimeTimestamp(runtimeAgentLastSeenAt(agent, runtimeById.get(agent.runtimeId), snapshot))}
              </span>
            </button>
          ))}
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
