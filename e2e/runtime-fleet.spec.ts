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

    await page.getByLabel("Channel").selectOption("slock");
    await expect(page.getByRole("table", { name: "Agent 列表" })).toContainText("tester");
    await expect(page.getByRole("table", { name: "Agent 列表" })).not.toContainText("main");

    await page.getByRole("row", { name: /tester/ }).click();
    const detail = page.getByRole("complementary", { name: "运行资产详情" });
    await expect(detail).toContainText("归属关系");
    await expect(detail).toContainText("所属 Runtime: Slock daemon");
    await expect(detail).toContainText("可用渠道");
    await expect(detail).not.toContainText("slock: tester");

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { name: "运行资产" })).toBeVisible();

    const pageOverflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(pageOverflows).toBe(false);
  });
});
