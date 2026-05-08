import { expect, test } from "@playwright/test";

test.describe("Catalog user workflow", () => {
  test("searches, filters, opens details, and reaches the empty state", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "对象目录" })).toBeVisible();
    await expect(page.getByRole("table", { name: "Catalog 对象" })).toContainText("业务指标 Agent");

    await page.getByPlaceholder("搜索名称、用途或标签").fill("成本");
    await expect(page.getByRole("table", { name: "Catalog 对象" })).toContainText("成本守护策略");
    await expect(page.getByRole("table", { name: "Catalog 对象" })).not.toContainText(
      "OpenClaw M1 Worker",
    );

    await page.getByTestId("type-filter").selectOption("policy");
    await page.getByRole("button", { name: "待定" }).click();
    await expect(page.getByRole("table", { name: "Catalog 对象" })).toContainText("成本守护策略");
    await expect(page.getByRole("table", { name: "Catalog 对象" })).not.toContainText(
      "BI 指标数据源",
    );

    await page.getByRole("row", { name: /成本守护策略/ }).click();
    await expect(page.getByRole("complementary", { name: "对象详情" })).toContainText(
      "成本守护策略",
    );
    await expect(page.getByRole("complementary", { name: "对象详情" })).toContainText(
      "可读取成本数据，可触发审批，不自动中断生产任务。",
    );

    await page.getByPlaceholder("搜索名称、用途或标签").fill("不存在对象");
    await expect(page.getByRole("heading", { name: "没有匹配的对象" })).toBeVisible();
  });
});
