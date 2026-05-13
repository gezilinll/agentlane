import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AuthLayout } from "./AuthLayout";
import { PixelBadge } from "./PixelBadge";
import { PixelButton } from "./PixelButton";
import { PixelField } from "./PixelField";
import { PixelLogo } from "./PixelLogo";
import { PixelPanel } from "./PixelPanel";
import { AuthOperationsPreview } from "../auth/auth-preview";

describe("Cream Arcade UI primitives", () => {
  it("renders the pixel logo with an accessible brand label", () => {
    render(<PixelLogo />);

    expect(screen.getByLabelText("Agentlane")).toBeInTheDocument();
    expect(screen.getByText("Agentlane")).toHaveClass("pixel-logo__wordmark");
    const mark = screen.getByTestId("pixel-logo-mark").querySelector("svg");
    expect(mark).toHaveClass("pixel-logo__svg");
    expect(mark).toHaveAttribute("data-logo-mark", "agentlane-brain-circuit");
    expect(mark).toHaveAttribute("data-logo-version", "streamline-brain");
  });

  it("keeps the browser tab metadata aligned with the shared brand mark", () => {
    const favicon = readFileSync("public/favicon.svg", "utf8");
    const indexHtml = readFileSync("index.html", "utf8");

    expect(favicon).toContain('data-logo-mark="agentlane-brain-circuit"');
    expect(favicon).toContain('data-logo-version="streamline-brain"');
    expect(indexHtml).toContain("<title>Agentlane</title>");
  });

  it("defines the current Pixel, Sans, and Mono font roles in shared tokens", () => {
    const tokens = readFileSync("src/ui/tokens.css", "utf8");

    expect(tokens).toContain("--font-pixel:");
    expect(tokens).toContain("--font-sans:");
    expect(tokens).toContain("--font-mono:");
    expect(tokens).toContain("JetBrains Mono");
    expect(tokens).toMatch(/\.pixel-button\s*{[^}]*font-family:\s*var\(--font-sans\)/s);
    expect(tokens).toMatch(/\.pixel-logo__wordmark\s*{[^}]*font-family:\s*var\(--font-pixel\)/s);
    expect(tokens).toMatch(/\.auth-layout\s*{[^}]*font-family:\s*var\(--font-sans\)/s);
    expect(tokens).toMatch(/\.auth-layout__title\s*{[^}]*font-family:\s*var\(--font-pixel\)/s);
    expect(tokens).toMatch(/\.auth-copy\s*{[^}]*font-family:\s*var\(--font-sans\)/s);
    expect(tokens).toMatch(/\.auth-preview__metric\s*{[^}]*font-family:\s*var\(--font-mono\)/s);
  });

  it("renders buttons, badges, panels, and fields with token classes", () => {
    render(
      <PixelPanel title="登录">
        <PixelField icon="mail" label="邮箱" name="email" placeholder="name@company.com" />
        <PixelButton type="button" icon="paper-plane">
          发送验证码
        </PixelButton>
        <PixelBadge tone="success">在线</PixelBadge>
      </PixelPanel>,
    );

    expect(screen.getByRole("group", { name: "登录" })).toHaveClass("pixel-panel");
    expect(screen.getByRole("group", { name: "登录" })).toHaveAttribute("data-panel-style", "cut-corner");
    expect(screen.getByLabelText("邮箱")).toHaveAttribute("name", "email");
    expect(screen.getByLabelText("邮箱").parentElement?.querySelector('[data-pixel-icon="mail"]')).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送验证码" })).toHaveClass("pixel-button");
    expect(screen.getByTestId("pixel-button-icon").querySelector("svg")).toHaveAttribute("data-pixel-icon", "paper-plane");
    expect(screen.getByText("在线")).toHaveClass("pixel-badge--success");
  });

  it("renders operational preview icons from the shared pixel icon system", () => {
    render(<AuthOperationsPreview />);

    expect(screen.getByLabelText("运营概览").querySelector('[data-pixel-icon="server"]')).toBeInTheDocument();
    expect(screen.getByLabelText("运营概览").querySelector('[data-pixel-icon="chart"]')).toBeInTheDocument();
    expect(screen.getByLabelText("运营概览").querySelector('[data-pixel-icon="shield"]')).toBeInTheDocument();
  });

  it("composes an auth layout with brand, content, preview, and notice regions", () => {
    render(
      <AuthLayout
        title="登录 Agentlane"
        subtitle="使用团队邮箱接收验证码"
        preview={<div>Runtime Fleet</div>}
        notice="登录后可统一管理组织内 Device、Runtime、Agent 与工作看板。"
      >
        <PixelButton>继续</PixelButton>
      </AuthLayout>,
    );

    expect(screen.getByRole("banner")).toContainElement(screen.getByLabelText("Agentlane"));
    expect(screen.getByTestId("auth-pixel-decorations")).toBeInTheDocument();
    expect(screen.getByTestId("auth-pixel-decorations").querySelector('[data-pixel-sprite="pink"]')).toBeInTheDocument();
    expect(screen.getByTestId("auth-pixel-decorations").querySelector('[data-pixel-sprite="blue"]')).toBeInTheDocument();
    expect(screen.getByTestId("auth-pixel-decorations").querySelector('[data-pixel-icon="heart"]')).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "登录 Agentlane" })).toBeInTheDocument();
    expect(screen.getByText("Runtime Fleet")).toBeInTheDocument();
    expect(screen.getByText(/Device、Runtime、Agent/)).toBeInTheDocument();
  });
});
