import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import fixtureSnapshot from "../fixtures/runtime/collector-snapshot.sample.json";
import type { RuntimeInventorySnapshot, RuntimeWorkStateSnapshot } from "./runtime";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Catalog page", () => {
  it("renders the Chinese Catalog page with seed objects", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "对象目录" })).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Catalog 对象" });
    expect(within(table).getByText("AI+ 转化分析流程")).toBeInTheDocument();
    expect(within(table).getByText("业务指标 Agent")).toBeInTheDocument();
  });

  it("renders visible labels for all catalog filters", () => {
    render(<App />);

    const toolbar = screen.getByLabelText("对象筛选");
    expect(within(toolbar).getByText("搜索")).toBeInTheDocument();
    expect(within(toolbar).getByText("类型")).toBeInTheDocument();
    expect(within(toolbar).getByText("生命周期")).toBeInTheDocument();
    expect(within(toolbar).getByText("Owner 状态")).toBeInTheDocument();
  });

  it("filters objects by search query", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByPlaceholderText("搜索名称、用途或标签"), "成本");

    expect(screen.getByText("成本守护策略")).toBeInTheDocument();
    expect(screen.queryByText("OpenClaw M1 Worker")).not.toBeInTheDocument();
  });

  it("combines type and owner filters", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.selectOptions(screen.getByLabelText("类型"), "policy");
    await user.click(screen.getByRole("button", { name: "待定" }));

    const table = screen.getByRole("table", { name: "Catalog 对象" });
    expect(within(table).getByText("成本守护策略")).toBeInTheDocument();
    expect(within(table).queryByText("BI 指标数据源")).not.toBeInTheDocument();
  });

  it("opens the detail panel for a selected object", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("row", { name: /成本守护策略/ }));

    const detail = screen.getByLabelText("对象详情");
    expect(within(detail).getByRole("heading", { name: "成本守护策略" })).toBeInTheDocument();
    expect(within(detail).getByText("权限")).toBeInTheDocument();
    expect(within(detail).getByText("评测")).toBeInTheDocument();
  });

  it("shows an empty state when filters match nothing", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByPlaceholderText("搜索名称、用途或标签"), "不存在对象");

    expect(screen.getByRole("heading", { name: "没有匹配的对象" })).toBeInTheDocument();
  });

  it("opens Runs work board with task context and no adapter debug text", async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn(async (input) => {
      const url = input.toString();
      if (url.includes("/api/runtime-work-state/latest")) {
        return new Response(JSON.stringify({ error: "not_found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "unexpected request" }), { status: 500 });
    }) as unknown as typeof fetch;
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Runs" }));

    expect(screen.getByRole("heading", { name: "工作看板" })).toBeInTheDocument();
    for (const lane of ["待处理", "处理中", "待验收", "已关闭", "需关注"]) {
      expect(screen.getByRole("heading", { name: lane })).toBeInTheDocument();
    }
    expect(await screen.findByText(/当前数据源：Fixture/)).toBeInTheDocument();
    const channelSelect = screen.getByLabelText("渠道") as HTMLSelectElement;
    expect(channelSelect.value).toBe("all");
    expect(within(channelSelect).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "全部",
      "DingTalk",
    ]);

    await user.selectOptions(screen.getByLabelText("来源 Runtime"), "slock");
    await user.type(screen.getByPlaceholderText("搜索任务、消息、发起人、Agent 或会话/群组"), "@fixture-human");

    const slockCard = screen.getByRole("button", { name: /Example in progress card/ });
    expect(within(slockCard).queryByText("处理中")).not.toBeInTheDocument();
    expect(screen.getAllByText("Example in progress card").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/@fixture-human/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/@example-agent/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/#example-board/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/OpenClaw execution/)).not.toBeInTheDocument();
    expect(screen.queryByText("直接证据")).not.toBeInTheDocument();
    expect(screen.queryByText(/OpenClaw has no/)).not.toBeInTheDocument();
    expect(screen.queryByText("能力缺口")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Example in progress card/ }));

    const detail = screen.getByRole("complementary", { name: "工作项详情" });
    expect(within(detail).getByRole("heading", { name: "Example in progress card" })).toBeInTheDocument();
    expect(within(detail).getByText("来源 Runtime: Slock")).toBeInTheDocument();
    expect(within(detail).getByText("Channel: 默认渠道")).toBeInTheDocument();
    expect(within(detail).getByText("发起人: @fixture-human")).toBeInTheDocument();
    expect(within(detail).getByText("承接 Agent: @example-agent")).toBeInTheDocument();
    expect(within(detail).getByText("会话/群组: #example-board")).toBeInTheDocument();
    expect(within(detail).queryByText("执行状态: 不支持采集")).not.toBeInTheDocument();
  });

  it("keeps Slock task-board items readable when no execution record is linked", async () => {
    const user = userEvent.setup();
    const backendSnapshot: RuntimeWorkStateSnapshot = {
      observedAt: "2026-05-09T08:00:00.000Z",
      deviceId: "fixture-device",
      workItems: [
        {
          id: "fixture-slock-no-execution",
          source: "slock",
          externalId: "fixture-slock-no-execution",
          title: "Task without execution record",
          status: "in_progress",
          channel: { kind: "slock", label: "#example-board" },
          assignee: { kind: "agent", label: "@example-agent" },
          creator: { kind: "human", label: "@fixture-human" },
          lastSeenAt: "2026-05-09T08:00:00.000Z",
        },
      ],
      conversations: [],
      executions: [],
      capabilities: [],
    };
    globalThis.fetch = vi.fn(async (input) => {
      const url = input.toString();
      if (url.includes("/api/runtime-work-state/latest")) {
        return new Response(JSON.stringify(backendSnapshot), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "unexpected request" }), { status: 500 });
    }) as unknown as typeof fetch;
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Runs" }));
    await user.click(await screen.findByRole("button", { name: /Task without execution record/ }));

    const detail = screen.getByRole("complementary", { name: "工作项详情" });
    expect(within(detail).getByText("工作项状态: 处理中")).toBeInTheDocument();
    expect(within(detail).queryByText(/执行状态:/)).not.toBeInTheDocument();
    expect(within(detail).queryByText("执行状态: 不支持采集")).not.toBeInTheDocument();
  });

  it("does not turn OpenClaw executions or Slock listening gaps into Runs cards", async () => {
    const user = userEvent.setup();
    const backendSnapshot: RuntimeWorkStateSnapshot = {
      observedAt: "2026-05-09T08:00:00.000Z",
      deviceId: "fixture-device",
      workItems: [],
      conversations: [{
        id: "fixture-device:openclaw:gateway:conversation:session-1",
        source: "openclaw",
        externalId: "session-1",
        status: "active",
        runtimeId: "fixture-device:openclaw:gateway",
        agentId: "fixture-device:openclaw:gateway:agent:main",
        lastSeenAt: "2026-05-09T08:00:00.000Z",
      }],
      executions: [{
        id: "fixture-device:openclaw:gateway:execution:run-1",
        source: "openclaw",
        externalId: "run-1",
        runtimeId: "fixture-device:openclaw:gateway",
        agentId: "fixture-device:openclaw:gateway:agent:main",
        status: "succeeded",
        lastSeenAt: "2026-05-09T08:00:00.000Z",
      }],
      capabilities: [
        {
          source: "openclaw",
          collectedAt: "2026-05-09T08:00:00.000Z",
          workItems: { support: "unsupported", strategies: ["cli"], evidence: [], limitations: [] },
          conversations: { support: "partial", strategies: ["cli"], evidence: [], limitations: [] },
          executions: { support: "supported", strategies: ["cli"], evidence: [], limitations: [] },
        },
        {
          source: "slock",
          collectedAt: "2026-05-09T08:00:00.000Z",
          workItems: { support: "unknown", strategies: ["local_state"], evidence: [], limitations: [] },
          conversations: { support: "unknown", strategies: ["local_state"], evidence: [], limitations: [] },
          executions: { support: "unknown", strategies: ["local_state"], evidence: [], limitations: [] },
        },
      ],
    };
    globalThis.fetch = vi.fn(async (input) => {
      const url = input.toString();
      if (url.includes("/api/runtime-work-state/latest")) {
        return new Response(JSON.stringify(backendSnapshot), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "unexpected request" }), { status: 500 });
    }) as unknown as typeof fetch;
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Runs" }));
    expect(await screen.findByText(/当前数据源：后端快照/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("来源 Runtime"), "slock");
    expect(screen.queryByText("Slock 监听未就绪")).not.toBeInTheDocument();
    expect(screen.queryByText("OpenClaw 执行监听已接入")).not.toBeInTheDocument();
    expect(screen.queryByText(/OpenClaw execution/)).not.toBeInTheDocument();
    expect(screen.queryByText("直接证据")).not.toBeInTheDocument();
    expect(screen.queryByText("能力缺口")).not.toBeInTheDocument();
  });

  it("opens Runtime Fleet and renders the fixture runtime inventory", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Runtime Fleet" }));

    expect(screen.getByRole("heading", { name: "运行资产" })).toBeInTheDocument();
    expect(within(screen.getByLabelText("设备")).getByText("Fixture Mac")).toBeInTheDocument();
    expect(within(screen.getByRole("table", { name: "Runtime 列表" })).getByText("OpenClaw Gateway")).toBeInTheDocument();
    expect(within(screen.getByRole("table", { name: "Agent 列表" })).getByText("tester")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "所属设备" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "归属 Runtime" })).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader", { name: "最近同步" }).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByLabelText("Channel")).not.toBeInTheDocument();
    expect(within(screen.getByLabelText("Runtime")).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "全部",
      "OpenClaw",
      "Slock",
    ]);
    expect(within(screen.getByLabelText("可用性")).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "全部",
      "在线",
    ]);
  });

  it("loads Runtime Fleet from the backend query API when available", async () => {
    const user = userEvent.setup();
    const backendSnapshot = fixtureSnapshot as RuntimeInventorySnapshot;
    globalThis.fetch = vi.fn(async (input) => {
      const url = input.toString();
      if (url.includes("/api/runtime-fleet")) {
        return new Response(JSON.stringify({
          observedAt: "2026-05-10T10:00:00.000Z",
          devices: [{ ...backendSnapshot.device, name: "Backend DB Mac" }],
          runtimes: backendSnapshot.runtimes,
          agents: backendSnapshot.agents,
          summary: { agentCount: 2, deviceCount: 1, runtimeCount: 2 },
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/api/runtime-work-state/latest")) {
        return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
      }
      return new Response(JSON.stringify({ error: "unexpected request" }), { status: 500 });
    }) as unknown as typeof fetch;

    render(<App />);
    await user.click(screen.getByRole("button", { name: "Runtime Fleet" }));

    expect((await screen.findAllByText("Backend DB Mac")).length).toBeGreaterThan(0);
    expect(screen.getByText(/当前数据源：后端快照/)).toBeInTheDocument();
  });

  it("loads Runs from the backend work-item query API when available", async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn(async (input) => {
      const url = input.toString();
      if (url.includes("/api/runtime-work-items")) {
        return new Response(JSON.stringify({
          items: [{
            agentId: "fixture-mac:slock:slock-daemon:agent:tester",
            assignee: { kind: "agent", label: "tester" },
            channelKind: "other",
            channelLabel: "#AjisGTD",
            conversationId: "fixture-mac:slock:slock-daemon:conversation:thread-1",
            creator: { kind: "human", label: "PMO" },
            description: "PMO asked the Slock agent to inspect queue handoff.",
            externalId: "task-1",
            id: "fixture-mac:slock:slock-daemon:work-item:task-1",
            lastSeenAt: "2026-05-10T10:00:00.000Z",
            runtimeId: "fixture-mac:slock:slock-daemon",
            source: "slock",
            stage: "processing",
            status: "in_progress",
            title: "AGTD-001 Fix queue handoff",
          }],
          total: 1,
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "unexpected request" }), { status: 500 });
    }) as unknown as typeof fetch;

    render(<App />);
    await user.click(screen.getByRole("button", { name: "Runs" }));

    expect(await screen.findByRole("button", { name: /AGTD-001 Fix queue handoff/ })).toBeInTheDocument();
    expect(screen.getByText(/当前数据源：后端查询/)).toBeInTheDocument();
  });

  it("filters Runs cards by manual time range and exposes quick ranges", async () => {
    const user = userEvent.setup();
    const backendSnapshot: RuntimeWorkStateSnapshot = {
      observedAt: "2026-05-09T08:00:00.000Z",
      deviceId: "fixture-device",
      workItems: [
        {
          id: "fixture-old-card",
          source: "openclaw",
          externalId: "fixture-old-card",
          title: "Old card",
          status: "done",
          lastSeenAt: "2026-05-08T10:00:00.000Z",
        },
        {
          id: "fixture-new-card",
          source: "openclaw",
          externalId: "fixture-new-card",
          title: "New card",
          status: "done",
          lastSeenAt: "2026-05-09T12:00:00.000Z",
        },
      ],
      conversations: [],
      executions: [],
      capabilities: [],
    };
    globalThis.fetch = vi.fn(async (input) => {
      const url = input.toString();
      if (url.includes("/api/runtime-work-state/latest")) {
        return new Response(JSON.stringify(backendSnapshot), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "unexpected request" }), { status: 500 });
    }) as unknown as typeof fetch;
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Runs" }));
    expect(await screen.findByText(/当前数据源：后端快照/)).toBeInTheDocument();
    const lanes = screen.getByLabelText("工作态泳道");
    expect(within(lanes).getAllByText("Old card").length).toBeGreaterThan(0);
    expect(within(lanes).getAllByText("New card").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("开始时间")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("结束时间")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "清除时间" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /选择时间范围/ }));
    expect(screen.getByRole("button", { name: "今天" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "清除时间" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "日历中选择" }));
    fireEvent.change(screen.getByLabelText("开始时间"), { target: { value: "2026-05-09T00:00:00" } });
    fireEvent.change(screen.getByLabelText("结束时间"), { target: { value: "2026-05-09T23:59:59" } });
    await user.click(screen.getByRole("button", { name: "立即查询" }));

    expect(within(lanes).queryByText("Old card")).not.toBeInTheDocument();
    expect(within(lanes).getAllByText("New card").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /选择时间范围/ }));
    await user.click(screen.getByRole("button", { name: "清除时间" }));
    expect(within(lanes).getAllByText("Old card").length).toBeGreaterThan(0);
    expect(within(lanes).getAllByText("New card").length).toBeGreaterThan(0);
  });

  it("loads Runtime Fleet from the latest backend snapshot when available", async () => {
    const user = userEvent.setup();
    const backendSnapshot: RuntimeInventorySnapshot = {
      ...(fixtureSnapshot as RuntimeInventorySnapshot),
      device: {
        ...(fixtureSnapshot as RuntimeInventorySnapshot).device,
        name: "Backend Fixture Mac",
      },
    };
    globalThis.fetch = vi.fn(async (input) => {
      const url = input.toString();
      if (url.includes("/api/runtime-fleet")) {
        return new Response(JSON.stringify({ error: "postgres_store_unavailable" }), { status: 503 });
      }
      return new Response(JSON.stringify(backendSnapshot), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Runtime Fleet" }));

    expect((await screen.findAllByText("Backend Fixture Mac")).length).toBeGreaterThan(0);
    expect(vi.mocked(globalThis.fetch).mock.calls.some((call) =>
      call[0]?.toString().includes("/api/runtime-inventory/latest"),
    )).toBe(true);
  });

  it("shows Runtime operating status from the latest Agent work state", async () => {
    const user = userEvent.setup();
    const backendSnapshot = fixtureSnapshot as RuntimeInventorySnapshot;
    const workState: RuntimeWorkStateSnapshot = {
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
    globalThis.fetch = vi.fn(async (input) => {
      const url = input.toString();
      if (url.includes("/api/runtime-inventory/latest")) {
        return new Response(JSON.stringify(backendSnapshot), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/api/runtime-work-state/latest")) {
        return new Response(JSON.stringify(workState), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "unexpected request" }), { status: 500 });
    }) as unknown as typeof fetch;
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Runtime Fleet" }));

    expect(await screen.findByRole("columnheader", { name: "运行状态" })).toBeInTheDocument();
    const runtimeTable = screen.getByRole("table", { name: "Runtime 列表" });
    const slockRuntimeRow = within(runtimeTable).getByRole("row", { name: /Slock daemon/ });
    expect(within(slockRuntimeRow).getByText("工作中")).toBeInTheDocument();

    await user.click(slockRuntimeRow);
    const detail = screen.getByRole("complementary", { name: "运行资产详情" });
    expect(within(detail).getByText("运行状态: 工作中")).toBeInTheDocument();
    expect(within(detail).getByText("可用性: 在线")).toBeInTheDocument();
  });

  it("shows Slock Agent status and workload statistics from task-board work state", async () => {
    const user = userEvent.setup();
    const backendSnapshot = fixtureSnapshot as RuntimeInventorySnapshot;
    const workState: RuntimeWorkStateSnapshot = {
      observedAt: "2026-05-09T08:00:00.000Z",
      deviceId: backendSnapshot.device.id,
      workItems: [
        {
          id: "fixture-slock-task-running",
          source: "slock",
          externalId: "fixture-slock-task-running",
          title: "Running Slock board card",
          status: "in_progress",
          runtimeId: "fixture-mac:slock:slock-daemon",
          agentId: "fixture-mac:slock:slock-daemon:agent:workspace-owner",
          assignee: { kind: "agent", label: "tester" },
          conversationId: "fixture-mac:slock:slock-daemon:conversation:thread-running",
        },
        {
          id: "fixture-slock-task-queued",
          source: "slock",
          externalId: "fixture-slock-task-queued",
          title: "Queued Slock board card",
          status: "todo",
          runtimeId: "fixture-mac:slock:slock-daemon",
          agentId: "fixture-mac:slock:slock-daemon:agent:workspace-owner",
          assignee: { kind: "agent", label: "tester" },
          conversationId: "fixture-mac:slock:slock-daemon:conversation:thread-queued",
        },
      ],
      conversations: [
        {
          id: "fixture-mac:slock:slock-daemon:conversation:thread-running",
          source: "slock",
          externalId: "thread-running",
          status: "open",
          runtimeId: "fixture-mac:slock:slock-daemon",
          agentId: "fixture-mac:slock:slock-daemon:agent:workspace-owner",
          workItemId: "fixture-slock-task-running",
        },
        {
          id: "fixture-mac:slock:slock-daemon:conversation:thread-queued",
          source: "slock",
          externalId: "thread-queued",
          status: "closed",
          runtimeId: "fixture-mac:slock:slock-daemon",
          agentId: "fixture-mac:slock:slock-daemon:agent:workspace-owner",
          workItemId: "fixture-slock-task-queued",
        },
      ],
      executions: [],
      capabilities: [],
    };
    globalThis.fetch = vi.fn(async (input) => {
      const url = input.toString();
      if (url.includes("/api/runtime-inventory/latest")) {
        return new Response(JSON.stringify(backendSnapshot), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/api/runtime-work-state/latest")) {
        return new Response(JSON.stringify(workState), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "unexpected request" }), { status: 500 });
    }) as unknown as typeof fetch;
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Runtime Fleet" }));
    expect(screen.queryByLabelText("Channel")).not.toBeInTheDocument();

    const agentTable = screen.getByRole("table", { name: "Agent 列表" });
    const testerRow = within(agentTable).getByRole("row", { name: /tester/ });
    expect(within(testerRow).getByText("活跃")).toBeInTheDocument();

    await user.click(testerRow);

    const detail = screen.getByRole("complementary", { name: "运行资产详情" });
    expect(within(detail).getByRole("heading", { name: "tester" })).toBeInTheDocument();
    expect(within(detail).getByText("状态: 活跃")).toBeInTheDocument();
    expect(within(detail).getByText("活跃任务: 1")).toBeInTheDocument();
    expect(within(detail).getByText("队列深度: 1")).toBeInTheDocument();
    expect(within(detail).getByText("活跃会话: 1")).toBeInTheDocument();
    expect(within(detail).getByText("历史会话: 2")).toBeInTheDocument();
  });

  it("filters Runtime Fleet agents by search and opens agent details", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Runtime Fleet" }));
    expect(screen.queryByLabelText("Channel")).not.toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("搜索设备、Runtime、Agent 或渠道"), "tester");

    const agentTable = screen.getByRole("table", { name: "Agent 列表" });
    expect(within(agentTable).getByText("tester")).toBeInTheDocument();
    expect(within(agentTable).queryByText("main")).not.toBeInTheDocument();

    await user.click(screen.getByRole("row", { name: /tester/ }));

    const detail = screen.getByRole("complementary", { name: "运行资产详情" });
    expect(within(detail).getByRole("heading", { name: "tester" })).toBeInTheDocument();
    expect(within(detail).getByText("归属关系")).toBeInTheDocument();
    expect(within(detail).getByText("所属 Runtime: Slock daemon")).toBeInTheDocument();
    expect(within(detail).getByText("所属设备: Fixture Mac")).toBeInTheDocument();
    expect(within(detail).getByText("关联渠道")).toBeInTheDocument();
    expect(within(detail).getByText("Slock")).toBeInTheDocument();
    expect(within(detail).queryByText("slock: tester")).not.toBeInTheDocument();
    expect(within(detail).queryByText("事实")).not.toBeInTheDocument();
    expect(within(detail).queryByText("可用渠道")).not.toBeInTheDocument();
  });

  it("renders Runtime Fleet agents with multiple same-kind channel bindings without duplicate key warnings", async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const backendSnapshot: RuntimeInventorySnapshot = {
      ...(fixtureSnapshot as RuntimeInventorySnapshot),
      agents: (fixtureSnapshot as RuntimeInventorySnapshot).agents.map((agent) => {
        if (agent.id !== "fixture-mac:openclaw:gateway-18789:agent:main") return agent;
        return {
          ...agent,
          channelBindings: [
            { kind: "dingtalk", label: "DingTalk default", externalId: "default", status: "enabled" },
            { kind: "dingtalk", label: "DingTalk backup", externalId: "backup", status: "enabled" },
          ],
        };
      }),
    };
    globalThis.fetch = vi.fn(async (input) => {
      const url = input.toString();
      if (url.includes("/api/runtime-inventory/latest")) {
        return new Response(JSON.stringify(backendSnapshot), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "unexpected request" }), { status: 500 });
    }) as unknown as typeof fetch;
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Runtime Fleet" }));
    expect(await screen.findByText("DingTalk backup")).toBeInTheDocument();

    const duplicateKeyWarning = consoleError.mock.calls.some((call) =>
      call.some((argument) => String(argument).includes("Encountered two children with the same key")),
    );
    expect(duplicateKeyWarning).toBe(false);
  });

  it("automatically refreshes the latest Runtime Fleet snapshot while mounted", async () => {
    vi.useFakeTimers();
    let latestRequests = 0;
    globalThis.fetch = vi.fn(async (input) => {
      const url = input.toString();
      if (url.includes("/api/runtime-inventory/latest")) {
        latestRequests += 1;
        const snapshot: RuntimeInventorySnapshot = {
          ...(fixtureSnapshot as RuntimeInventorySnapshot),
          device: {
            ...(fixtureSnapshot as RuntimeInventorySnapshot).device,
            name: `Auto Refresh Mac ${latestRequests}`,
          },
          observedAt: `2026-05-08T08:00:0${latestRequests}.000Z`,
        };
        return new Response(JSON.stringify(snapshot), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "unexpected request" }), { status: 500 });
    }) as unknown as typeof fetch;
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Runtime Fleet" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getAllByText("Auto Refresh Mac 1")).toHaveLength(3);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
      await Promise.resolve();
    });

    expect(screen.getAllByText("Auto Refresh Mac 2").length).toBeGreaterThan(0);
    expect(latestRequests).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/上次刷新/)).toBeInTheDocument();
  });

  it("requests a remote device refresh and reloads the latest backend snapshot", async () => {
    const user = userEvent.setup();
    let latestRequests = 0;
    const backendSnapshot: RuntimeInventorySnapshot = {
      ...(fixtureSnapshot as RuntimeInventorySnapshot),
      device: {
        ...(fixtureSnapshot as RuntimeInventorySnapshot).device,
        name: "Backend Fixture Mac",
      },
    };
    const refreshedSnapshot: RuntimeInventorySnapshot = {
      ...backendSnapshot,
      device: {
        ...backendSnapshot.device,
        name: "Refreshed Fixture Mac",
      },
    };
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = input.toString();
      if (url.includes("/api/runtime-inventory/latest")) {
        latestRequests += 1;
        return new Response(JSON.stringify(latestRequests === 1 ? backendSnapshot : refreshedSnapshot), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/api/devices/fixture-mac/refresh") && init?.method === "POST") {
        return new Response(JSON.stringify({ ok: true, commandId: "cmd-refresh-1", status: "sent" }), {
          status: 202,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/api/devices/fixture-mac/commands/cmd-refresh-1")) {
        return new Response(JSON.stringify({ commandId: "cmd-refresh-1", status: "succeeded" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "unexpected request" }), { status: 500 });
    }) as unknown as typeof fetch;
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Runtime Fleet" }));
    expect(await screen.findAllByText("Backend Fixture Mac")).toHaveLength(3);

    await user.click(screen.getByRole("button", { name: "请求设备刷新" }));

    expect(await screen.findByText("刷新完成")).toBeInTheDocument();
    expect((await screen.findAllByText("Refreshed Fixture Mac")).length).toBeGreaterThan(0);
    expect(vi.mocked(globalThis.fetch).mock.calls.some((call) => call[0].toString().includes("/refresh"))).toBe(true);
  });

  it("shows a clear remote refresh error when the device is disconnected", async () => {
    const user = userEvent.setup();
    const backendSnapshot = fixtureSnapshot as RuntimeInventorySnapshot;
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = input.toString();
      if (url.includes("/api/runtime-inventory/latest")) {
        return new Response(JSON.stringify(backendSnapshot), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/api/devices/fixture-mac/refresh") && init?.method === "POST") {
        return new Response(JSON.stringify({
          error: "device_not_connected",
          message: "device is not connected: fixture-mac",
        }), {
          status: 409,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "unexpected request" }), { status: 500 });
    }) as unknown as typeof fetch;
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Runtime Fleet" }));
    expect((await screen.findAllByText("Fixture Mac")).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "请求设备刷新" }));

    expect(await screen.findByText("device is not connected: fixture-mac")).toBeInTheDocument();
  });
});
