import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuthLayout } from "./AuthLayout";
import { PixelBadge } from "./PixelBadge";
import { PixelButton } from "./PixelButton";
import { PixelField } from "./PixelField";
import { PixelLogo } from "./PixelLogo";
import { PixelPanel } from "./PixelPanel";

describe("Cream Arcade UI primitives", () => {
  it("renders the pixel logo with an accessible brand label", () => {
    render(<PixelLogo />);

    expect(screen.getByLabelText("Agentlane")).toBeInTheDocument();
    expect(screen.getByText("Agentlane")).toHaveClass("pixel-logo__wordmark");
    expect(screen.getByTestId("pixel-logo-mark").querySelector("svg")).toHaveClass("pixel-logo__svg");
  });

  it("renders buttons, badges, panels, and fields with token classes", () => {
    render(
      <PixelPanel title="登录">
        <PixelField label="邮箱" name="email" placeholder="name@company.com" />
        <PixelButton type="button" icon="paper-plane">
          发送验证码
        </PixelButton>
        <PixelBadge tone="success">在线</PixelBadge>
      </PixelPanel>,
    );

    expect(screen.getByRole("group", { name: "登录" })).toHaveClass("pixel-panel");
    expect(screen.getByLabelText("邮箱")).toHaveAttribute("name", "email");
    expect(screen.getByRole("button", { name: "发送验证码" })).toHaveClass("pixel-button");
    expect(screen.getByTestId("pixel-button-icon").querySelector("svg")).toHaveClass("pixel-button__svg");
    expect(screen.getByText("在线")).toHaveClass("pixel-badge--success");
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
    expect(screen.getByRole("heading", { name: "登录 Agentlane" })).toBeInTheDocument();
    expect(screen.getByText("Runtime Fleet")).toBeInTheDocument();
    expect(screen.getByText(/Device、Runtime、Agent/)).toBeInTheDocument();
  });
});
