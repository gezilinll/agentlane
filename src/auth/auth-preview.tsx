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
        label="Runtime Fleet"
        metric="在线 5 · 离线 0 · 异常 0"
        status={<PixelBadge tone="success">在线</PixelBadge>}
      />
      <AuthPreviewRow
        command="$ runs stats --window=24h"
        label="Runs"
        metric="总数 1,248 · 成功 96.3% · 失败 3.7%"
        status={<PixelBadge tone="warning">工作中</PixelBadge>}
      />
      <AuthPreviewRow
        command="$ collectors health"
        label="采集健康"
        metric="健康 23 · 警告 1 · 异常 0"
        status={<PixelBadge tone="success">健康</PixelBadge>}
      />
    </section>
  );
}

function AuthPreviewRow({
  command,
  label,
  metric,
  status,
}: {
  command: string;
  label: string;
  metric: string;
  status: ReactNode;
}) {
  return (
    <div className="auth-preview__row">
      <div>
        <h2>{label}</h2>
        <p className="auth-preview__command">{command}</p>
        <p>{metric}</p>
      </div>
      {status}
    </div>
  );
}
