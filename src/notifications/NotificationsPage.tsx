import { useEffect, useMemo, useState } from "react";
import { PixelIcon } from "../ui/PixelIcon";

interface NotificationsPageProps {
  organizationId?: string;
}

type NotificationSeverity = "info" | "warning" | "critical";

type NotificationStatus = "open" | "recovered" | "muted";

interface NotificationThread {
  firstOccurredAt: string;
  id: string;
  lastOccurredAt: string;
  latestSummary: string;
  resourceId?: string | null;
  resourceType?: string | null;
  severity: NotificationSeverity;
  status: NotificationStatus;
  title: string;
}

const severityLabels: Record<NotificationSeverity, string> = {
  critical: "高风险",
  info: "信息",
  warning: "警告",
};

const statusLabels: Record<NotificationStatus, string> = {
  muted: "已静默",
  open: "未恢复",
  recovered: "已恢复",
};

/** User-visible notification center for async jobs, collector health, and review signals. */
export function NotificationsPage({ organizationId }: NotificationsPageProps) {
  const [notifications, setNotifications] = useState<NotificationThread[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    const activeOrganizationId = organizationId;
    let cancelled = false;
    async function loadNotifications() {
      setIsLoading(true);
      setErrorMessage("");
      try {
        const response = await fetch(`/api/notifications?organizationId=${encodeURIComponent(activeOrganizationId)}`);
        if (!response.ok) throw new Error(`通知读取失败: HTTP ${response.status}`);
        const payload = (await response.json()) as { threads?: NotificationThread[] };
        if (cancelled) return;
        const nextNotifications = payload.threads ?? [];
        setNotifications(nextNotifications);
        setSelectedId((current) => current || nextNotifications[0]?.id || "");
      } catch (error) {
        if (!cancelled) setErrorMessage(error instanceof Error ? error.message : "通知读取失败");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void loadNotifications();
    const timer = window.setInterval(() => {
      void loadNotifications();
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [organizationId]);

  const selectedNotification = notifications.find((notification) => notification.id === selectedId) ?? notifications[0] ?? null;
  const summary = useMemo(() => {
    return {
      critical: notifications.filter((notification) => notification.severity === "critical").length,
      open: notifications.filter((notification) => notification.status === "open").length,
      total: notifications.length,
    };
  }, [notifications]);

  if (!organizationId) {
    return (
      <section className="workspace">
        <header className="pageHeader">
          <div>
            <p className="eyebrow">Notifications</p>
            <h1>通知中心</h1>
            <p className="pageSubtitle">请选择组织后查看通知。</p>
          </div>
        </header>
      </section>
    );
  }

  return (
    <section className="workspace">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Notifications</p>
          <h1>通知中心</h1>
          <p className="pageSubtitle">集中查看任务、采集健康、审批和同步异常的通知状态。</p>
        </div>
      </header>

      <section className="metricGrid" aria-label="通知概览">
        <Metric label="通知总数" value={summary.total} tone="blue" />
        <Metric label="未恢复" value={summary.open} tone="orange" />
        <Metric label="高风险" value={summary.critical} tone="purple" />
      </section>

      <section className="resourceCenterGrid">
        <section className="tablePanel" aria-label="通知列表">
          <div className="runtimePanelHeader">
            <div>
              <h2>通知列表</h2>
              <p>{isLoading ? "读取中" : `${notifications.length} 条通知`}</p>
            </div>
            <PixelIcon name="mail" size={18} />
          </div>
          {errorMessage ? <p className="skillErrorMessage">{errorMessage}</p> : null}
          <div className="resourceList">
            {notifications.length === 0 ? (
              <p className="emptyAsset">暂无通知。</p>
            ) : (
              notifications.map((notification) => (
                <button
                  className={
                    notification.id === selectedNotification?.id
                      ? "resourceListItem resourceListItemActive"
                      : "resourceListItem"
                  }
                  key={notification.id}
                  type="button"
                  onClick={() => setSelectedId(notification.id)}
                >
                  <strong>{notification.title}</strong>
                  <span>
                    {severityLabels[notification.severity] ?? notification.severity} ·{" "}
                    {statusLabels[notification.status] ?? notification.status}
                  </span>
                  <small>{formatDateTime(notification.lastOccurredAt)}</small>
                </button>
              ))
            )}
          </div>
        </section>
        <NotificationDetail notification={selectedNotification} />
      </section>
    </section>
  );
}

function NotificationDetail({ notification }: { notification: NotificationThread | null }) {
  if (!notification) {
    return (
      <aside className="detailPanel resourceDetailPanel" aria-label="通知详情">
        <h2>通知详情</h2>
        <p>选择一条通知查看范围、状态和最近摘要。</p>
      </aside>
    );
  }

  return (
    <aside className="detailPanel resourceDetailPanel" aria-label="通知详情">
      <div className="detailHeader">
        <div>
          <p className="eyebrow">Notification</p>
          <h2>{notification.title}</h2>
        </div>
        <span className={`statusBadge status-${notification.status}`}>
          {statusLabels[notification.status] ?? notification.status}
        </span>
      </div>
      <DetailList
        title="通知范围"
        items={[
          `级别: ${severityLabels[notification.severity] ?? notification.severity}`,
          `资源: ${formatOptionalPair(notification.resourceType, notification.resourceId)}`,
        ]}
      />
      <DetailList
        title="最近状态"
        items={[
          `首次出现: ${formatDateTime(notification.firstOccurredAt)}`,
          `最近出现: ${formatDateTime(notification.lastOccurredAt)}`,
          `状态: ${statusLabels[notification.status] ?? notification.status}`,
        ]}
      />
      <DetailBlock title="摘要">{notification.latestSummary}</DetailBlock>
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
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    year: "numeric",
  }).format(date);
}
