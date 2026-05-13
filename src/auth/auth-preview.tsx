import type { ReactNode } from "react";
import { PixelBadge } from "../ui/PixelBadge";

/** Static operational preview for the auth entry screen. */
export function AuthOperationsPreview() {
  return (
    <section className="auth-preview" aria-label="运营概览">
      <div className="auth-preview__header">
        <span className="auth-preview__prompt">&gt;_ 运营概览</span>
        <span>UTC+8</span>
      </div>
      <AuthPreviewRow
        command="$ runtimes list --all"
        icon="fleet"
        label="Runtime Fleet"
        metric={<><span className="metricTextSuccess">在线 5</span><span>离线 0</span><span>异常 0</span></>}
        status={<PixelBadge tone="success">在线</PixelBadge>}
      />
      <AuthPreviewRow
        command="$ runs stats --window=24h"
        icon="runs"
        label="Runs"
        metric={<><span>总数 1,248</span><span className="metricTextSuccess">成功 96.3%</span><span className="metricTextDanger">失败 3.7%</span></>}
        status={<PixelBadge tone="warning">工作中</PixelBadge>}
      />
      <AuthPreviewRow
        command="$ collectors health"
        icon="health"
        label="采集健康"
        metric={<><span className="metricTextSuccess">健康 23</span><span>警告 1</span><span>异常 0</span></>}
        status={<PixelBadge tone="success">健康</PixelBadge>}
      />
    </section>
  );
}

function AuthPreviewRow({
  command,
  icon,
  label,
  metric,
  status,
}: {
  command: string;
  icon: "fleet" | "health" | "runs";
  label: string;
  metric: ReactNode;
  status: ReactNode;
}) {
  return (
    <div className="auth-preview__row">
      <PixelPreviewIcon icon={icon} />
      <div className="auth-preview__copy">
        <h2>{label}</h2>
        <p className="auth-preview__command">{command}</p>
        <p className="auth-preview__metric">{metric}</p>
      </div>
      {status}
    </div>
  );
}

function PixelPreviewIcon({ icon }: { icon: "fleet" | "health" | "runs" }) {
  return (
    <span className={`auth-preview__icon auth-preview__icon--${icon}`} aria-hidden="true">
      {icon === "runs" ? (
        <svg className="auth-preview__iconSvg" viewBox="0 0 32 32" focusable="false" shapeRendering="crispEdges">
          <rect x="4" y="5" width="4" height="22" />
          <rect x="4" y="23" width="24" height="4" />
          <rect x="8" y="18" width="4" height="4" />
          <rect x="12" y="14" width="4" height="4" />
          <rect x="16" y="10" width="4" height="4" />
          <rect x="20" y="14" width="4" height="4" />
          <rect x="24" y="8" width="4" height="4" />
        </svg>
      ) : (
        <span />
      )}
    </span>
  );
}
