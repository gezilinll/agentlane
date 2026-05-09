import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RuntimeInventorySnapshot } from "../src/runtime";

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

test.describe("Runtime Fleet", () => {
  test("filters agents, opens details, and stays responsive", async ({ page, request }) => {
    const seedResponse = await request.post("/api/device-snapshots", { data: backendSnapshot });
    expect(seedResponse.ok()).toBe(true);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    await page.getByRole("button", { name: "Runtime Fleet" }).click();
    await expect(page.getByRole("heading", { name: "运行资产" })).toBeVisible();
    await expect(page.getByLabel("设备").getByText("Backend Fixture Mac")).toBeVisible();
    await expect(page.getByRole("table", { name: "Runtime 列表" })).toContainText("OpenClaw Gateway");
    await expect(page.getByRole("table", { name: "Agent 列表" })).toContainText("tester");
    await expect(page.getByRole("table", { name: "Runtime 列表" })).toContainText("所属设备");
    await expect(page.getByRole("table", { name: "Agent 列表" })).toContainText("归属 Runtime");
    await expect(page.getByRole("table", { name: "Agent 列表" })).toContainText("最近同步");

    await page.getByLabel("Channel").selectOption("slock");
    await expect(page.getByRole("table", { name: "Agent 列表" })).toContainText("tester");
    await expect(page.getByRole("table", { name: "Agent 列表" })).not.toContainText("main");

    await page.getByRole("row", { name: /tester/ }).click();
    const detail = page.getByRole("complementary", { name: "运行资产详情" });
    await expect(detail).toHaveCSS("position", "sticky");
    await expect(detail).toContainText("归属关系");
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
});
