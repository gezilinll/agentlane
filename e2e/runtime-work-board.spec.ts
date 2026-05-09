import { expect, test } from "@playwright/test";
import {
  mapMulticaWorkState,
  mapOpenClawWorkState,
  mapSlockWorkState,
  multicaWorkStateFixture,
  openClawWorkStateFixture,
  slockWorkStateFixture,
  type RuntimeWorkStateSnapshot,
} from "../src/runtime";

const openclaw = mapOpenClawWorkState(openClawWorkStateFixture);
const multica = mapMulticaWorkState(multicaWorkStateFixture);
const slock = mapSlockWorkState(slockWorkStateFixture);

const backendSnapshot: RuntimeWorkStateSnapshot = {
  observedAt: "2026-05-09T08:00:00.000Z",
  deviceId: "fixture-device",
  workItems: [...openclaw.workItems, ...multica.workItems, ...slock.workItems],
  conversations: [...openclaw.conversations, ...multica.conversations, ...slock.conversations],
  executions: [...openclaw.executions, ...multica.executions, ...slock.executions],
  capabilities: [...openclaw.capabilities, ...multica.capabilities, ...slock.capabilities],
};

test.describe("Runtime Work Board", () => {
  test("filters partial Slock work, opens details, and stays responsive", async ({ page, request }) => {
    const seedResponse = await request.post("/api/runtime-work-state-snapshots", { data: backendSnapshot });
    expect(seedResponse.ok()).toBe(true);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "Runs" }).click();

    await expect(page.getByRole("heading", { name: "工作看板" })).toBeVisible();
    await expect(page.getByText(/当前数据源：Backend/)).toBeVisible();
    for (const lane of ["待处理", "处理中", "待验收", "已关闭", "需关注"]) {
      await expect(page.getByRole("heading", { name: lane })).toBeVisible();
    }

    await page.getByLabel("来源平台").selectOption("slock");
    await page.getByLabel("可信度").selectOption("partial");
    await page.getByPlaceholder("搜索工作项、Agent、Runtime 或渠道").fill("progress");

    await expect(page.getByRole("button", { name: /Example in progress card/ })).toBeVisible();
    await expect(page.getByText("Example review card")).not.toBeVisible();

    await page.getByRole("button", { name: /Example in progress card/ }).click();
    const detail = page.getByRole("complementary", { name: "工作项详情" });
    await expect(detail).toContainText("可信度: 部分可信");
    await expect(detail).toContainText("来源平台: Slock");
    await expect(detail).toContainText("执行态: 未知");

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { name: "工作看板" })).toBeVisible();

    const pageOverflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(pageOverflows).toBe(false);
  });
});
