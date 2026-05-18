import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthMemberRole, AuthSessionContext } from "../auth/auth-store";
import { OrganizationSettingsPage } from "./OrganizationSettingsPage";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("OrganizationSettingsPage", () => {
  it("does not show invitation controls before an organization is selected", () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    render(<OrganizationSettingsPage />);

    expect(screen.getByRole("heading", { name: "组织设置" })).toBeInTheDocument();
    expect(screen.getByText("请选择组织后管理成员与权限。")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("creates an invitation link for organization admins", async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn(async (input, init) => {
      expect(input.toString()).toBe("/api/organizations/org_1/invitations");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({ email: "teammate@lorume.com", role: "member" });
      return jsonResponse({ invitation: { token: "invite_token_1" } });
    }) as unknown as typeof fetch;

    render(<OrganizationSettingsPage session={sessionWithRole("admin")} />);

    await user.type(screen.getByLabelText("邮箱"), "teammate@lorume.com");
    await user.click(screen.getByRole("button", { name: "创建邀请链接" }));

    const inviteLink = await screen.findByLabelText("邀请链接");
    await waitFor(() => {
      expect((inviteLink as HTMLInputElement).value).toMatch(/\/invite\/invite_token_1$/);
    });
    expect(screen.getByRole("button", { name: "复制邀请链接" })).toBeInTheDocument();
  });

  it("hides invitation creation from regular members", () => {
    render(<OrganizationSettingsPage session={sessionWithRole("member")} />);

    expect(screen.getByText("当前角色不能创建邀请链接。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "创建邀请链接" })).not.toBeInTheDocument();
  });
});

function sessionWithRole(role: AuthMemberRole): AuthSessionContext {
  return {
    id: "session_1",
    organizations: [
      {
        id: "membership_1",
        name: "Lorume",
        organizationId: "org_1",
        role,
        slug: "lorume",
      },
    ],
    user: {
      createdAt: new Date("2026-05-17T08:00:00.000Z"),
      email: "owner@lorume.com",
      id: "user_1",
      updatedAt: new Date("2026-05-17T08:00:00.000Z"),
    },
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}
