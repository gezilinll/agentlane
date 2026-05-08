import { expect, test } from "@playwright/test";

test.describe("Runtime Fleet", () => {
  test("filters agents, opens details, and stays responsive", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    await page.getByRole("button", { name: "Runtime Fleet" }).click();
    await expect(page.getByRole("heading", { name: "运行资产" })).toBeVisible();
    await expect(page.getByRole("table", { name: "Runtime 列表" })).toContainText("OpenClaw Gateway");
    await expect(page.getByRole("table", { name: "Agent 列表" })).toContainText("tester");

    await page.getByLabel("Channel").selectOption("slock");
    await expect(page.getByRole("table", { name: "Agent 列表" })).toContainText("tester");
    await expect(page.getByRole("table", { name: "Agent 列表" })).not.toContainText("main");

    await page.getByRole("row", { name: /tester/ }).click();
    await expect(page.getByRole("complementary", { name: "运行资产详情" })).toContainText("slock: tester");

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { name: "运行资产" })).toBeVisible();

    const pageOverflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(pageOverflows).toBe(false);
  });
});
