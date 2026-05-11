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
  workItems: [
    ...openclaw.workItems,
    ...multica.workItems,
    ...slock.workItems,
    {
      id: "fixture-long-title-card",
      source: "slock",
      externalId: "fixture-long-title-card",
      title: "https://git.intra.gaoding.com/gdesign/meta/-/merge_requests/184 让大卷执行review，如果有问题让codex继续修复",
      description: "https://git.intra.gaoding.com/gdesign/meta/-/merge_requests/184 让大卷执行review，如果有问题让codex继续修复并回报结果",
      status: "done",
      channel: { kind: "slock", label: "#AjisGTD" },
      creator: { kind: "human", label: "AjiHuang" },
      assignee: { kind: "agent", label: "PMO" },
      lastSeenAt: "2026-05-09T08:00:00.000Z",
    },
  ],
  conversations: [...openclaw.conversations, ...multica.conversations, ...slock.conversations],
  executions: [...openclaw.executions, ...multica.executions, ...slock.executions],
  capabilities: [...openclaw.capabilities, ...multica.capabilities, ...slock.capabilities],
};

test.describe("Runs / Work Board", () => {
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
    await expect(page.getByLabel("渠道")).toHaveValue("all");
    await expect(page.getByLabel("渠道").locator("option")).toHaveText(["全部", "DingTalk"]);
    const searchBox = await page.getByPlaceholder("搜索任务、消息、发起人、Agent 或会话/群组").boundingBox();
    const stageBox = await page.getByLabel("阶段").boundingBox();
    const timeTriggerBox = await page.getByRole("button", { name: /选择时间范围/ }).boundingBox();
    expect(searchBox?.width ?? 0).toBeLessThan(620);
    expect(searchBox?.width ?? 0).toBeGreaterThan(300);
    expect(timeTriggerBox?.width ?? 0).toBeLessThan(480);
    expect(timeTriggerBox?.x ?? 0).toBeGreaterThan(stageBox?.x ?? 0);
    await expect(page.getByLabel("开始时间")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /帮我检查今天的线上异常/ })).toBeVisible();
    await page.getByRole("button", { name: /选择时间范围/ }).click();
    await expect(page.getByRole("button", { name: "清除时间" })).toBeVisible();
    await page.getByRole("button", { name: "1天" }).click();
    await page.getByRole("button", { name: "确认" }).click();
    const timeSummaryFits = await page.locator(".timeRangeSummary").evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    );
    expect(timeSummaryFits).toBe(true);
    await page.getByRole("button", { name: /选择时间范围/ }).click();
    await page.getByRole("button", { name: "日历中选择" }).click();
    await page.getByLabel("开始时间").fill("2026-05-09T15:45");
    await page.getByLabel("结束时间").fill("2026-05-09T16:00");
    await page.getByRole("button", { name: "立即查询" }).click();
    await expect(page.getByRole("button", { name: /帮我检查今天的线上异常/ })).toBeVisible();
    await page.getByRole("button", { name: /选择时间范围/ }).click();
    await page.getByRole("button", { name: "日历中选择" }).click();
    await page.getByLabel("开始时间").fill("2026-05-10T00:00");
    await page.getByLabel("结束时间").fill("2026-05-10T23:59");
    await page.getByRole("button", { name: "立即查询" }).click();
    await expect(page.getByRole("button", { name: /帮我检查今天的线上异常/ })).not.toBeVisible();
    await page.getByRole("button", { name: /选择时间范围/ }).click();
    await page.getByRole("button", { name: "清除时间" }).click();
    await expect(page.getByRole("button", { name: /帮我检查今天的线上异常/ })).toBeVisible();

    await page.getByLabel("来源 Runtime").selectOption("slock");
    await page.getByPlaceholder("搜索任务、消息、发起人、Agent 或会话/群组").fill("@fixture-human");

    const slockCard = page.getByRole("button", { name: /Example in progress card/ });
    await expect(slockCard).toBeVisible();
    await expect(slockCard).not.toContainText("处理中");
    await expect(page.getByRole("button", { name: /@example-agent/ }).first()).toBeVisible();
    await expect(page.getByText(/OpenClaw execution/)).not.toBeVisible();
    await expect(page.getByText("直接证据")).not.toBeVisible();
    await expect(page.getByText(/OpenClaw has no/)).not.toBeVisible();
    await expect(page.getByText("能力缺口")).not.toBeVisible();

    await page.getByRole("button", { name: /Example in progress card/ }).click();
    const detail = page.getByRole("complementary", { name: "工作项详情" });
    await expect(detail).toContainText("来源 Runtime: Slock");
    await expect(detail).toContainText("Channel: 默认渠道");
    await expect(detail).toContainText("发起人: @fixture-human");
    await expect(detail).toContainText("承接 Agent: @example-agent");
    await expect(detail).toContainText("会话/群组: #example-board");

    await page.getByPlaceholder("搜索任务、消息、发起人、Agent 或会话/群组").fill("merge_requests/184");
    const longCard = page.getByRole("button", { name: /merge_requests\/184/ });
    await expect(longCard).toBeVisible();
    const longCardFits = await longCard.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    );
    expect(longCardFits).toBe(true);

    await longCard.click();
    const longDetail = page.getByRole("complementary", { name: "工作项详情" });
    const longDetailFits = await longDetail.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    );
    expect(longDetailFits).toBe(true);

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

  test("keeps source listening gaps out of task cards when a target platform has no task-board data", async ({ page, request }) => {
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
    await page.getByLabel("来源 Runtime").selectOption("slock");

    await expect(page.getByRole("button", { name: /Slock 监听未就绪/ })).not.toBeVisible();
    await expect(page.getByRole("button", { name: /缺少 Slock task board 或 API adapter/ })).not.toBeVisible();
    await expect(page.getByText("无匹配项").first()).toBeVisible();
    await expect(page.getByText("直接证据")).not.toBeVisible();
    await expect(page.getByText("能力缺口")).not.toBeVisible();
  });
});
