import { Bot, Cpu, Monitor, RefreshCw, Search, Server } from "lucide-react";
import { useMemo, useState } from "react";
import fixtureSnapshot from "../../fixtures/runtime/collector-snapshot.sample.json";
import {
  channelKindLabels,
  filterRuntimeFleet,
  getRuntimeFleetDetail,
  managedAgentStatusLabels,
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

const runtimeSnapshot = fixtureSnapshot as RuntimeInventorySnapshot;

const channelOptions: ChannelKind[] = ["dingtalk", "slock", "multica", "openclaw", "other"];
const runtimeStatusOptions: RuntimeHealthStatus[] = ["online", "degraded", "offline", "unknown"];

type RuntimeFleetSelection = {
  kind: RuntimeFleetDetail["kind"];
  id: string;
};

/** First Runtime Fleet surface: inspect registered device, runtimes, agents, and channel exposure. */
export function RuntimeFleetPage() {
  const [query, setQuery] = useState("");
  const [runtimeKind, setRuntimeKind] = useState<RuntimeKind | "all">("all");
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeHealthStatus | "all">("all");
  const [channelKind, setChannelKind] = useState<ChannelKind | "all">("all");
  const [selection, setSelection] = useState<RuntimeFleetSelection | null>(null);

  const filters: RuntimeFleetFilters = useMemo(
    () => ({ query, runtimeKind, runtimeStatus, channelKind }),
    [channelKind, query, runtimeKind, runtimeStatus],
  );
  const result = useMemo(() => filterRuntimeFleet(runtimeSnapshot, filters), [filters]);
  const summary = useMemo(() => summarizeRuntimeFleet(runtimeSnapshot), []);
  const detail = selection ? getRuntimeFleetDetail(runtimeSnapshot, selection.kind, selection.id) : null;

  return (
    <section className="workspace">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Runtime / Device / Agent</p>
          <h1>运行资产</h1>
          <p className="pageSubtitle">统一识别设备、Runtime、Agent 与它们暴露到的渠道。</p>
        </div>
        <button className="primaryButton" type="button" aria-label="刷新快照">
          <RefreshCw size={16} aria-hidden="true" />
          刷新快照
        </button>
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
          <DevicePanel onSelect={() => setSelection({ kind: "device", id: result.device.id })} />
          <RuntimeTable
            runtimes={result.runtimes}
            selectedId={selection?.kind === "runtime" ? selection.id : undefined}
            onSelect={(runtime) => setSelection({ kind: "runtime", id: runtime.id })}
          />
          <AgentTable
            agents={result.agents}
            runtimes={runtimeSnapshot.runtimes}
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

function DevicePanel({ onSelect }: { onSelect: () => void }) {
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
          <strong>{runtimeSnapshot.device.name}</strong>
          <small>{runtimeSnapshot.device.hostname}</small>
        </span>
        <StatusBadge label={runtimeHealthLabels[runtimeSnapshot.device.status]} status={runtimeSnapshot.device.status} />
      </button>
    </section>
  );
}

function RuntimeTable({
  runtimes,
  selectedId,
  onSelect,
}: {
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
            <span role="columnheader">状态</span>
            <span role="columnheader">能力</span>
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
              <span role="cell">
                <StatusBadge label={runtimeHealthLabels[runtime.status]} status={runtime.status} />
              </span>
              <span className="mutedAssetText" role="cell">
                {runtime.capabilities.length ? runtime.capabilities.join(", ") : "暂无"}
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
  selectedId,
  onSelect,
}: {
  agents: ManagedRuntimeAgent[];
  runtimes: AgentlaneRuntime[];
  selectedId?: string;
  onSelect: (agent: ManagedRuntimeAgent) => void;
}) {
  const runtimeNameById = new Map(runtimes.map((runtime) => [runtime.id, runtimeCompactLabel(runtime)]));

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
            <span role="columnheader">来源</span>
            <span role="columnheader">Runtime</span>
            <span role="columnheader">Channel</span>
            <span role="columnheader">状态</span>
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
              <span role="cell">
                <Badge>{sourceLabel(agent.origin)}</Badge>
              </span>
              <span className="mutedAssetText" role="cell">
                {runtimeNameById.get(agent.runtimeId) ?? agent.runtimeId}
              </span>
              <span className="channelList" role="cell">
                {agent.channelBindings.map((binding) => (
                  <Badge key={`${agent.id}-${binding.kind}`}>{binding.label || channelKindLabels[binding.kind]}</Badge>
                ))}
              </span>
              <span role="cell">
                <StatusBadge label={managedAgentStatusLabels[agent.status]} status={agent.status} />
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
        <StatusBadge label={detail.statusLabel} status={detail.statusLabel} />
      </div>
      <DetailBlock title="说明">{detail.subtitle}</DetailBlock>
      {detail.kind === "agent" ? <DetailBlock title="Runtime">{detail.runtimeName}</DetailBlock> : null}
      {detail.kind === "runtime" ? <DetailList title="能力" items={detail.capabilities} /> : null}
      <DetailList title="Channel" items={detail.channelLabels} emptyLabel="暂无 Channel" />
      <DetailList title="来源" items={detail.sourceLabels} emptyLabel="暂无来源" />
      <DetailList title="事实" items={detail.facts} />
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

function sourceLabel(source: ManagedRuntimeAgent["origin"]): string {
  return source === "manual" ? "Manual" : runtimeKindLabels[source];
}

function runtimeCompactLabel(runtime: AgentlaneRuntime): string {
  return `${runtimeKindLabels[runtime.kind]} · ${runtime.id.split(":").at(-1) ?? runtime.name}`;
}
