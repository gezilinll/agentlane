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
  test("filters Slock work by task context, opens details, and stays responsive", async ({ page, request }) => {
    const seedResponse = await request.post("/api/runtime-work-state-snapshots", { data: backendSnapshot });
    expect(seedResponse.ok()).toBe(true);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "Runs" }).click();

    await expect(page.getByRole("heading", { name: "工作看板" })).toBeVisible();
    await expect(page.getByText(/当前数据源：后端快照/)).toBeVisible();
    for (const lane of ["待处理", "处理中", "待验收", "已关闭", "需关注"]) {
      await expect(page.getByRole("heading", { name: lane })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: /OpenClaw 执行监听已接入/ })).toBeVisible();

    await page.getByLabel("来源平台").selectOption("slock");
    await page.getByPlaceholder("搜索任务、消息、发起人、Agent 或群组").fill("@fixture-human");

    await expect(page.getByRole("button", { name: /Example in progress card/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /@example-agent/ }).first()).toBeVisible();
    await expect(page.getByText(/OpenClaw execution/)).not.toBeVisible();
    await expect(page.getByText("直接证据")).not.toBeVisible();
    await expect(page.getByText(/OpenClaw has no/)).not.toBeVisible();

    await page.getByRole("button", { name: /Example in progress card/ }).click();
    const detail = page.getByRole("complementary", { name: "工作项详情" });
    await expect(detail).toContainText("来源平台: Slock");
    await expect(detail).toContainText("发起人: @fixture-human");
    await expect(detail).toContainText("承接 Agent: @example-agent");
    await expect(detail).toContainText("群组/渠道: #example-board");

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { name: "工作看板" })).toBeVisible();

    const pageOverflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(pageOverflows).toBe(false);
  });

  test("keeps the board within the viewport on laptop widths", async ({ page, request }) => {
    const seedResponse = await request.post("/api/runtime-work-state-snapshots", { data: backendSnapshot });
    expect(seedResponse.ok()).toBe(true);

    await page.setViewportSize({ width: 1185, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "Runs" }).click();
    await expect(page.getByText(/当前数据源：后端快照/)).toBeVisible();

    const pageOverflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(pageOverflows).toBe(false);
  });

  test("shows source listening gaps when a target platform has no task-board data", async ({ page, request }) => {
    const workspaceOnlySnapshot: RuntimeWorkStateSnapshot = {
      observedAt: "2026-05-09T08:00:00.000Z",
      deviceId: "fixture-device",
      workItems: [],
      conversations: [],
      executions: [],
      capabilities: [{
        source: "slock",
        collectedAt: "2026-05-09T08:00:00.000Z",
        workItems: {
          support: "unknown",
          strategies: ["local_state"],
          evidence: [],
          limitations: [],
        },
        conversations: {
          support: "unknown",
          strategies: ["local_state"],
          evidence: [],
          limitations: [],
        },
        executions: {
          support: "unknown",
          strategies: ["local_state"],
          evidence: [],
          limitations: [],
        },
      }],
    };
    const seedResponse = await request.post("/api/runtime-work-state-snapshots", { data: workspaceOnlySnapshot });
    expect(seedResponse.ok()).toBe(true);

    await page.goto("/");
    await page.getByRole("button", { name: "Runs" }).click();
    await page.getByLabel("来源平台").selectOption("slock");

    const slockStatusCard = page.getByRole("button", { name: /Slock 监听未就绪/ });
    await expect(slockStatusCard).toBeVisible();
    await expect(slockStatusCard).toContainText(/缺少 Slock task board 或 API adapter/);
    await expect(page.getByText("直接证据")).not.toBeVisible();
  });
});
