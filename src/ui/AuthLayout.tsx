import type { ReactNode } from "react";
import { PixelLogo } from "./PixelLogo";
import { PixelPanel } from "./PixelPanel";

interface AuthLayoutProps {
  children: ReactNode;
  notice?: ReactNode;
  preview?: ReactNode;
  subtitle: string;
  title: string;
}

export function AuthLayout({ children, notice, preview, subtitle, title }: AuthLayoutProps) {
  return (
    <div className="auth-layout">
      <header className="auth-layout__header">
        <PixelLogo />
        <div className="auth-layout__language">简体中文 UTC+8</div>
      </header>
      <main className="auth-layout__main">
        <PixelPanel>
          <h1 className="auth-layout__title">{title}</h1>
          <p className="auth-layout__subtitle">{subtitle}</p>
          <div className="auth-layout__content">{children}</div>
        </PixelPanel>
        {preview ? <PixelPanel className="auth-layout__preview">{preview}</PixelPanel> : null}
      </main>
      {notice ? <div className="auth-layout__notice">{notice}</div> : null}
    </div>
  );
}
