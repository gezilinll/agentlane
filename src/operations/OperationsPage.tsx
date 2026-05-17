import { useEffect, useMemo, useState } from "react";
import { PixelIcon } from "../ui/PixelIcon";

interface OperationsPageProps {
  organizationId?: string;
}

type OperationStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "unsupported"
  | "requires_manual_step"
  | "cancelled";

interface OperationListItem {
  createdAt: string;
  errorSummary?: string | null;
  id: string;
  resourceId?: string | null;
  resourceType?: string | null;
  status: OperationStatus;
  summary: string;
  targetId?: string | null;
  targetType?: string | null;
  type: string;
  updatedAt: string;
}

const operationStatusLabels: Record<OperationStatus, string> = {
  cancelled: "已取消",
  failed: "失败",
  queued: "排队中",
  requires_manual_step: "需人工处理",
  running: "执行中",
  succeeded: "已完成",
  unsupported: "不支持",
};

const activeStatuses = new Set<OperationStatus>(["queued", "running", "requires_manual_step"]);

/** User-visible async operation center for Skill sync, migration, refresh, and notification jobs. */
export function OperationsPage({ organizationId }: OperationsPageProps) {
  const [operations, setOperations] = useState<OperationListItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    const activeOrganizationId = organizationId;
    let cancelled = false;
    async function loadOperations() {
      setIsLoading(true);
      setErrorMessage("");
      try {
        const response = await fetch(`/api/operations?organizationId=${encodeURIComponent(activeOrganizationId)}&limit=100`);
        if (!response.ok) throw new Error(`任务读取失败: HTTP ${response.status}`);
        const payload = (await response.json()) as { operations?: OperationListItem[] };
        if (cancelled) return;
        const nextOperations = payload.operations ?? [];
        setOperations(nextOperations);
        setSelectedId((current) => current || nextOperations[0]?.id || "");
      } catch (error) {
        if (!cancelled) setErrorMessage(error instanceof Error ? error.message : "任务读取失败");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void loadOperations();
    const timer = window.setInterval(() => {
      void loadOperations();
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [organizationId]);

  const selectedOperation = operations.find((operation) => operation.id === selectedId) ?? operations[0] ?? null;
  const summary = useMemo(() => {
    return {
      active: operations.filter((operation) => activeStatuses.has(operation.status)).length,
      failed: operations.filter((operation) => operation.status === "failed").length,
      total: operations.length,
    };
  }, [operations]);

  if (!organizationId) {
    return (
      <section className="workspace">
        <header className="pageHeader">
          <div>
            <p className="eyebrow">Operations</p>
            <h1>任务中心</h1>
            <p className="pageSubtitle">请选择组织后查看任务。</p>
          </div>
        </header>
      </section>
    );
  }

  return (
    <section className="workspace">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Operations</p>
          <h1>任务中心</h1>
          <p className="pageSubtitle">集中查看 Skill 同步、发布审核、迁移和设备刷新等异步任务。</p>
        </div>
      </header>

      <section className="metricGrid" aria-label="任务概览">
        <Metric label="任务总数" value={summary.total} tone="blue" />
        <Metric label="进行中" value={summary.active} tone="green" />
        <Metric label="失败" value={summary.failed} tone="orange" />
      </section>

      <section className="resourceCenterGrid">
        <section className="tablePanel" aria-label="任务列表">
          <div className="runtimePanelHeader">
            <div>
              <h2>任务列表</h2>
              <p>{isLoading ? "读取中" : `${operations.length} 个任务`}</p>
            </div>
            <PixelIcon name="activity" size={18} />
          </div>
          {errorMessage ? <p className="skillErrorMessage">{errorMessage}</p> : null}
          <div className="resourceList">
            {operations.length === 0 ? (
              <p className="emptyAsset">暂无任务。</p>
            ) : (
              operations.map((operation) => (
                <button
                  className={operation.id === selectedOperation?.id ? "resourceListItem resourceListItemActive" : "resourceListItem"}
                  key={operation.id}
                  type="button"
                  onClick={() => setSelectedId(operation.id)}
                >
                  <strong>{operation.summary}</strong>
                  <span>{operation.type} · {operationStatusLabels[operation.status] ?? operation.status}</span>
                  <small>{formatDateTime(operation.updatedAt)}</small>
                </button>
              ))
            )}
          </div>
        </section>
        <OperationDetail operation={selectedOperation} />
      </section>
    </section>
  );
}

function OperationDetail({ operation }: { operation: OperationListItem | null }) {
  if (!operation) {
    return (
      <aside className="detailPanel resourceDetailPanel" aria-label="任务详情">
        <h2>任务详情</h2>
        <p>选择一个任务查看目标、状态和失败原因。</p>
      </aside>
    );
  }

  return (
    <aside className="detailPanel resourceDetailPanel" aria-label="任务详情">
      <div className="detailHeader">
        <div>
          <p className="eyebrow">Operation</p>
          <h2>{operation.summary}</h2>
        </div>
        <span className={`statusBadge status-${operation.status}`}>
          {operationStatusLabels[operation.status] ?? operation.status}
        </span>
      </div>
      <DetailList
        title="任务上下文"
        items={[
          `类型: ${operation.type}`,
          `资源: ${formatOptionalPair(operation.resourceType, operation.resourceId)}`,
          `目标: ${formatOptionalPair(operation.targetType, operation.targetId)}`,
        ]}
      />
      <DetailList
        title="最近状态"
        items={[
          `创建时间: ${formatDateTime(operation.createdAt)}`,
          `更新时间: ${formatDateTime(operation.updatedAt)}`,
          operation.errorSummary ? `错误: ${operation.errorSummary}` : "错误: 无",
        ]}
      />
    </aside>
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

function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="detailBlock">
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function formatOptionalPair(type?: string | null, id?: string | null): string {
  if (!type && !id) return "无";
  return [type, id].filter(Boolean).join(" · ");
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知";
  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    year: "numeric",
  }).format(date);
}
