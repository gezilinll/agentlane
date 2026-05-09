import { RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  mapMulticaWorkState,
  mapOpenClawWorkState,
  mapSlockWorkState,
} from "./runtime-work-state-adapters";
import {
  multicaWorkStateFixture,
  openClawWorkStateFixture,
  slockWorkStateFixture,
} from "./runtime-work-state-fixtures";
import {
  createRuntimeWorkBoard,
  type RuntimeWorkBoardItem,
  type RuntimeWorkBoardFilters,
} from "./runtime-work-state-query";
import type { RuntimeSource } from "./runtime-normalize";
import type { RuntimeWorkStageId, RuntimeWorkStateSnapshot } from "./runtime-work-state";
import { formatRuntimeTimestamp } from "./runtime-inventory-query";

const autoRefreshIntervalMs = 30_000;

const sourceOptions: Array<RuntimeSource | "all"> = ["all", "openclaw", "multica", "slock"];
const stageOptions: Array<RuntimeWorkStageId | "all"> = ["all", "pending", "processing", "review", "closed", "attention"];

const sourceLabels: Record<RuntimeSource | "all", string> = {
  all: "全部平台",
  openclaw: "OpenClaw",
  multica: "Multica",
  slock: "Slock",
  codex: "Codex",
  claude_code: "Claude Code",
  unknown: "未知",
  manual: "手动",
};

const stageLabels: Record<RuntimeWorkStageId | "all", string> = {
  all: "全部阶段",
  pending: "待处理",
  processing: "处理中",
  review: "待验收",
  closed: "已关闭",
  attention: "需关注",
};

const fixtureWorkStateSnapshot = createFixtureWorkStateSnapshot();

/** Read-only board for normalized Agent work state across runtimes and platforms. */
export function RuntimeWorkBoardPage() {
  const [snapshot, setSnapshot] = useState<RuntimeWorkStateSnapshot>(fixtureWorkStateSnapshot);
  const [dataSource, setDataSource] = useState<"fixture" | "backend">("fixture");
  const [refreshState, setRefreshState] = useState<{
    status: "idle" | "running" | "success" | "error";
    message: string;
  }>({ status: "idle", message: "" });
  const [lastLoadedAt, setLastLoadedAt] = useState("");
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<RuntimeSource | "all">("all");
  const [stage, setStage] = useState<RuntimeWorkStageId | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function fetchLatestSnapshot(): Promise<RuntimeWorkStateSnapshot | null> {
    const response = await fetch(new URL("/api/runtime-work-state/latest", window.location.origin));
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`runtime work state request failed: ${response.status}`);
    return (await response.json()) as RuntimeWorkStateSnapshot;
  }

  function applySnapshot(latestSnapshot: RuntimeWorkStateSnapshot) {
    setSnapshot(latestSnapshot);
    setDataSource("backend");
    setLastLoadedAt(new Date().toISOString());
  }

  async function loadLatestSnapshot(options: { silent?: boolean } = {}) {
    try {
      const latestSnapshot = await fetchLatestSnapshot();
      if (latestSnapshot) {
        applySnapshot(latestSnapshot);
        if (!options.silent) setRefreshState({ status: "success", message: "已读取最新工作态" });
        return;
      }
      if (!options.silent) setRefreshState({ status: "success", message: "暂无后端快照，继续使用 Fixture" });
    } catch (error) {
      if (!options.silent) {
        setRefreshState({
          status: "error",
          message: error instanceof Error ? error.message : "读取工作态失败",
        });
      }
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadInitialSnapshot() {
      try {
        const latestSnapshot = await fetchLatestSnapshot();
        if (!cancelled && latestSnapshot) applySnapshot(latestSnapshot);
      } catch {
        // Keep the read-only board usable with fixture data while local backend is unavailable.
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

  const filters: RuntimeWorkBoardFilters = useMemo(
    () => ({ search, source, stage }),
    [search, source, stage],
  );
  const board = useMemo(() => createRuntimeWorkBoard(snapshot, filters), [filters, snapshot]);
  const selectedItem = selectedId ? board.visibleItems.find((item) => item.id === selectedId) ?? null : board.visibleItems[0] ?? null;

  return (
    <section className="workspace">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Runtime / Work State</p>
          <h1>工作看板</h1>
          <p className="pageSubtitle">
            统一查看 Agent 承接的工作项、发起人、群组/渠道、消息摘要和当前阶段。当前数据源：
            {dataSource === "backend" ? "后端快照" : "Fixture 样例"}
          </p>
          <p className="pageRefreshMeta">
            快照时间 {formatRuntimeTimestamp(snapshot.observedAt)}
            {lastLoadedAt ? ` · 上次刷新 ${formatRuntimeTimestamp(lastLoadedAt)}` : ""}
          </p>
        </div>
        <div className="refreshControl">
          <button
            className="primaryButton"
            type="button"
            disabled={refreshState.status === "running"}
            onClick={() => {
              setRefreshState({ status: "running", message: "正在读取最新工作态" });
              void loadLatestSnapshot();
            }}
          >
            <RefreshCw size={16} aria-hidden="true" />
            {refreshState.status === "running" ? "刷新中" : "刷新看板"}
          </button>
          {refreshState.message ? (
            <p className={`refreshMessage refresh-${refreshState.status}`} role="status">
              {refreshState.message}
            </p>
          ) : null}
        </div>
      </header>

      <section className="toolbar workBoardToolbar" aria-label="工作看板筛选">
        <label className="toolbarField toolbarSearch">
          <span className="controlLabel">搜索</span>
          <span className="searchBox">
            <Search size={16} aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索任务、消息、发起人、Agent 或群组"
            />
          </span>
        </label>

        <label className="toolbarField">
          <span className="controlLabel">来源平台</span>
          <select value={source} onChange={(event) => setSource(event.target.value as RuntimeSource | "all")}>
            {sourceOptions.map((option) => (
              <option key={option} value={option}>
                {sourceLabels[option]}
              </option>
            ))}
          </select>
        </label>

        <label className="toolbarField">
          <span className="controlLabel">阶段</span>
          <select value={stage} onChange={(event) => setStage(event.target.value as RuntimeWorkStageId | "all")}>
            {stageOptions.map((option) => (
              <option key={option} value={option}>
                {stageLabels[option]}
              </option>
            ))}
          </select>
        </label>

      </section>

      <section className="metricGrid" aria-label="工作态概览">
        <Metric label="工作项" value={board.summary.totalItems} tone="blue" />
        <Metric label="处理中" value={board.summary.byStage.processing} tone="green" />
        <Metric label="需关注" value={board.summary.byStage.attention} tone="orange" />
        <Metric label="能力缺口" value={board.summary.unsupportedCapabilities} tone="purple" />
      </section>

      <section className="workBoardGrid">
        <div className="workBoardLanes" aria-label="工作态泳道">
          {board.lanes.map((lane) => (
            <section className="workLane" key={lane.stage} aria-label={`${lane.label}泳道`}>
              <div className="workLaneHeader">
                <h2>{lane.label}</h2>
                <span>{lane.items.length}</span>
              </div>
              <div className="workLaneItems">
                {lane.items.length ? (
                  lane.items.map((item) => (
                    <button
                      className={item.id === selectedItem?.id ? "workCard workCardActive" : "workCard"}
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                    >
                      <span className="workCardTopline">
                        <Badge>{sourceLabels[item.source]}</Badge>
                        <Badge>{stageLabels[item.stage]}</Badge>
                      </span>
                      <strong>{item.title}</strong>
                      <small>{item.requestExcerpt}</small>
                      <span className="workCardMeta">
                        发起人 {item.creatorLabel}
                      </span>
                      <span className="workCardMeta">
                        承接 Agent {item.assigneeLabel}
                      </span>
                      <span className="workCardMeta">
                        群组/渠道 {item.channelLabel ?? "不支持采集"}
                        {item.lastSeenAt ? ` · ${formatRuntimeTimestamp(item.lastSeenAt)}` : ""}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="emptyLane">无匹配项</p>
                )}
              </div>
            </section>
          ))}
        </div>
        <WorkItemDetail item={selectedItem} />
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

function WorkItemDetail({
  item,
}: {
  item: RuntimeWorkBoardItem | null;
}) {
  if (!item) {
    return (
      <aside className="detailPanel" aria-label="工作项详情">
        <h2>工作项详情</h2>
        <p>选择一个工作项或执行记录查看详情。</p>
      </aside>
    );
  }

  return (
    <aside className="detailPanel" aria-label="工作项详情">
      <div className="detailHeader">
        <div>
          <p className="eyebrow">工作项</p>
          <h2>{item.title}</h2>
        </div>
        <StatusPill>{stageLabels[item.stage]}</StatusPill>
      </div>
      <DetailBlock title="概览">
        {`${stageLabels[item.stage]} · ${workItemStatusLabel(item.workItemStatus)}`}
      </DetailBlock>
      <DetailList
        title="任务上下文"
        items={[
          `来源平台: ${sourceLabels[item.source]}`,
          `发起人: ${item.creatorLabel}`,
          `承接 Agent: ${item.assigneeLabel}`,
          `群组/渠道: ${item.channelLabel ?? "不支持采集"}`,
        ]}
      />
      <DetailList
        title="最近状态"
        items={[
          `最近同步: ${formatRuntimeTimestamp(item.lastSeenAt)}`,
          `工作项状态: ${workItemStatusLabel(item.workItemStatus)}`,
          `执行状态: ${executionStatusLabel(item.executionStatus)}`,
        ]}
      />
      <DetailBlock title="消息摘要">{item.requestExcerpt}</DetailBlock>
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

function DetailList({ title, items }: { title: string; items: string[] }) {
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
        <p className="mutedText">暂无</p>
      )}
    </section>
  );
}

function Badge({ children }: { children: string }) {
  return <span className="badge">{children}</span>;
}

function StatusPill({ children }: { children: string }) {
  return <span className="statusBadge">{children}</span>;
}

function createFixtureWorkStateSnapshot(): RuntimeWorkStateSnapshot {
  const openclaw = mapOpenClawWorkState(openClawWorkStateFixture);
  const multica = mapMulticaWorkState(multicaWorkStateFixture);
  const slock = mapSlockWorkState(slockWorkStateFixture);
  return {
    observedAt: "2026-05-09T08:00:00.000Z",
    deviceId: "fixture-device",
    workItems: [...openclaw.workItems, ...multica.workItems, ...slock.workItems],
    conversations: [...openclaw.conversations, ...multica.conversations, ...slock.conversations],
    executions: [...openclaw.executions, ...multica.executions, ...slock.executions],
    capabilities: [...openclaw.capabilities, ...multica.capabilities, ...slock.capabilities],
    warnings: [...(openclaw.warnings ?? []), ...(multica.warnings ?? []), ...(slock.warnings ?? [])],
  };
}

function workItemStatusLabel(status: RuntimeWorkBoardItem["workItemStatus"]): string {
  if (status === "todo") return "待处理";
  if (status === "in_progress") return "处理中";
  if (status === "in_review") return "待验收";
  if (status === "done") return "已完成";
  if (status === "blocked") return "阻塞";
  if (status === "cancelled") return "已取消";
  return "未知";
}

function executionStatusLabel(status: RuntimeWorkBoardItem["executionStatus"]): string {
  if (status === "queued") return "排队中";
  if (status === "running") return "运行中";
  if (status === "succeeded") return "已成功";
  if (status === "failed") return "失败";
  if (status === "cancelled") return "已取消";
  if (status === "unknown") return "未知";
  return "不支持采集";
}
