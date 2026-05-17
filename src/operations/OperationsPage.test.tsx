import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OperationsPage } from "./OperationsPage";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("OperationsPage", () => {
  it("does not query operations before an organization is selected", () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    render(<OperationsPage />);

    expect(screen.getByRole("heading", { name: "任务中心" })).toBeInTheDocument();
    expect(screen.getByText("请选择组织后查看任务。")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("loads operation status and opens details", async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn(async (input) => {
      expect(input.toString()).toContain("/api/operations?organizationId=org_1&limit=100");
      return jsonResponse({
        operations: [
          {
            createdAt: "2026-05-17T09:00:00.000Z",
            errorSummary: null,
            id: "op_1",
            resourceId: "skill_1",
            resourceType: "skill",
            status: "running",
            summary: "同步 Skill 到 main",
            targetId: "agent_main",
            targetType: "agent",
            type: "skill_sync",
            updatedAt: "2026-05-17T09:01:00.000Z",
          },
          {
            createdAt: "2026-05-17T08:00:00.000Z",
            errorSummary: "collector timeout",
            id: "op_2",
            resourceId: "device_1",
            resourceType: "device",
            status: "failed",
            summary: "刷新设备清单",
            targetId: "device_1",
            targetType: "device",
            type: "device_refresh",
            updatedAt: "2026-05-17T08:03:00.000Z",
          },
        ],
      });
    }) as unknown as typeof fetch;

    render(<OperationsPage organizationId="org_1" />);

    expect(await screen.findByRole("heading", { name: "任务中心" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /同步 Skill 到 main/ })).toBeInTheDocument();
    expect(screen.getByText("2 个任务")).toBeInTheDocument();
    expect(screen.getByText("任务总数")).toBeInTheDocument();
    expect(screen.getByText("失败")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /刷新设备清单/ }));

    const detail = screen.getByRole("complementary", { name: "任务详情" });
    await waitFor(() => expect(within(detail).getByRole("heading", { name: "刷新设备清单" })).toBeInTheDocument());
    expect(within(detail).getByText(/错误: collector timeout/)).toBeInTheDocument();
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}
