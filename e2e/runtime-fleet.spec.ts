import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RuntimeInventorySnapshot, RuntimeWorkStateSnapshot } from "../src/runtime";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureSnapshot = JSON.parse(
  readFileSync(path.join(repoRoot, "fixtures", "runtime", "collector-snapshot.sample.json"), "utf8"),
) as RuntimeInventorySnapshot;

const backendSnapshot: RuntimeInventorySnapshot = {
  ...fixtureSnapshot,
  device: {
    ...fixtureSnapshot.device,
    name: "Backend Fixture Mac",
  },
  agents: fixtureSnapshot.agents.map((agent) => {
    if (agent.id !== "fixture-mac:slock:slock-daemon:agent:tester") return agent;
    const { lastSeenAt, ...agentWithoutLastSeenAt } = agent;
    void lastSeenAt;
    return agentWithoutLastSeenAt;
  }),
};

const backendWorkState: RuntimeWorkStateSnapshot = {
  observedAt: "2026-05-09T08:00:00.000Z",
  deviceId: backendSnapshot.device.id,
  workItems: [
    {
      id: "fixture-slock-task-1",
      source: "slock",
      externalId: "fixture-slock-task-1",
      title: "Example in progress card",
      status: "in_progress",
      runtimeId: "fixture-mac:slock:slock-daemon",
      agentId: "fixture-mac:slock:slock-daemon:agent:tester",
    },
  ],
  conversations: [],
  executions: [],
  capabilities: [],
};

test.describe("Runtime Fleet", () => {
  test("filters agents, opens details, and stays responsive", async ({ page, request }) => {
    const seedResponse = await request.post("/api/device-snapshots", { data: backendSnapshot });
    expect(seedResponse.ok()).toBe(true);
    await page.route("**/api/runtime-work-state/latest", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(backendWorkState),
      });
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    await page.getByRole("button", { name: "Runtime Fleet" }).click();
    await expect(page.getByRole("heading", { name: "运行资产" })).toBeVisible();
    await expect(page.getByLabel("设备").getByText("Backend Fixture Mac")).toBeVisible();
    await expect(page.getByRole("table", { name: "Runtime 列表" })).toContainText("OpenClaw Gateway");
    await expect(page.getByRole("table", { name: "Runtime 列表" })).toContainText("运行状态");
    await expect(page.getByRole("table", { name: "Runtime 列表" })).toContainText("工作中");
    await expect(page.getByRole("table", { name: "Agent 列表" })).toContainText("tester");
    await expect(page.getByRole("row", { name: /tester/ })).toContainText("活跃");
    await expect(page.getByRole("table", { name: "Runtime 列表" })).toContainText("所属设备");
    await expect(page.getByRole("table", { name: "Agent 列表" })).toContainText("归属 Runtime");
    await expect(page.getByRole("table", { name: "Agent 列表" })).toContainText("最近同步");
    await expect(page.getByLabel("Channel")).toHaveCount(0);
    await expect(page.getByLabel("Runtime").locator("option")).toHaveText(["全部 Runtime", "OpenClaw", "Slock"]);
    await expect(page.getByLabel("可用性").locator("option")).toHaveText(["全部可用性", "在线"]);

    await page.getByPlaceholder("搜索设备、Runtime、Agent 或渠道").fill("tester");
    await expect(page.getByRole("table", { name: "Agent 列表" })).toContainText("tester");
    await expect(page.getByRole("table", { name: "Agent 列表" })).not.toContainText("main");

    await page.getByRole("row", { name: /tester/ }).click();
    const detail = page.getByRole("complementary", { name: "运行资产详情" });
    await expect(detail).toHaveCSS("position", "sticky");
    await expect(detail).toContainText("归属关系");
    await expect(detail).toContainText("状态: 活跃");
    await expect(detail).toContainText("所属 Runtime: Slock daemon");
    await expect(detail).toContainText("关联渠道");
    await expect(detail).toContainText(`最近同步: ${new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date("2026-05-08T08:00:01.000Z"))}`);
    await expect(detail).not.toContainText("slock: tester");

    await page.getByRole("button", { name: "请求设备刷新" }).click();
    await expect(page.getByRole("status")).toContainText("device is not connected");

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { name: "运行资产" })).toBeVisible();

    const pageOverflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(pageOverflows).toBe(false);
  });

  test("keeps the Runtime Fleet toolbar within the viewport on laptop widths", async ({ page, request }) => {
    const seedResponse = await request.post("/api/device-snapshots", { data: backendSnapshot });
    expect(seedResponse.ok()).toBe(true);

    await page.setViewportSize({ width: 1185, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "Runtime Fleet" }).click();
    await expect(page.getByRole("heading", { name: "运行资产" })).toBeVisible();

    const pageOverflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(pageOverflows).toBe(false);
  });
});
