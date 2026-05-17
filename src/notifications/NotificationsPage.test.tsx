import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationsPage } from "./NotificationsPage";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("NotificationsPage", () => {
  it("does not query notifications before an organization is selected", () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    render(<NotificationsPage />);

    expect(screen.getByRole("heading", { name: "通知中心" })).toBeInTheDocument();
    expect(screen.getByText("请选择组织后查看通知。")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("loads notification threads and opens details", async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn(async (input) => {
      expect(input.toString()).toContain("/api/notifications?organizationId=org_1");
      return jsonResponse({
        threads: [
          {
            firstOccurredAt: "2026-05-17T08:00:00.000Z",
            id: "thread_1",
            lastOccurredAt: "2026-05-17T09:00:00.000Z",
            latestSummary: "Collector 心跳延迟超过阈值",
            resourceId: "device_1",
            resourceType: "device",
            severity: "warning",
            status: "open",
            title: "采集心跳延迟",
          },
          {
            firstOccurredAt: "2026-05-17T07:00:00.000Z",
            id: "thread_2",
            lastOccurredAt: "2026-05-17T07:10:00.000Z",
            latestSummary: "Skill 同步已经恢复",
            resourceId: "skill_1",
            resourceType: "skill",
            severity: "info",
            status: "recovered",
            title: "Skill 同步恢复",
          },
        ],
      });
    }) as unknown as typeof fetch;

    render(<NotificationsPage organizationId="org_1" />);

    expect(await screen.findByRole("button", { name: /采集心跳延迟/ })).toBeInTheDocument();
    expect(screen.getByText("2 条通知")).toBeInTheDocument();
    expect(screen.getAllByText("未恢复").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /Skill 同步恢复/ }));

    const detail = screen.getByRole("complementary", { name: "通知详情" });
    await waitFor(() => expect(within(detail).getByRole("heading", { name: "Skill 同步恢复" })).toBeInTheDocument());
    expect(within(detail).getByText("Skill 同步已经恢复")).toBeInTheDocument();
    expect(within(detail).getByText(/资源: skill · skill_1/)).toBeInTheDocument();
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}
