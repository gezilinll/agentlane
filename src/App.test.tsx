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

    await user.selectOptions(screen.getByLabelText("来源平台"), "slock");
    await user.type(screen.getByPlaceholderText("搜索任务、消息、发起人、Agent 或群组"), "@fixture-human");

    expect(screen.getAllByText("Example in progress card").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/@fixture-human/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/@example-agent/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/#example-board/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/OpenClaw execution/)).not.toBeInTheDocument();
    expect(screen.queryByText("直接证据")).not.toBeInTheDocument();
    expect(screen.queryByText(/OpenClaw has no/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Example in progress card/ }));

    const detail = screen.getByRole("complementary", { name: "工作项详情" });
    expect(within(detail).getByRole("heading", { name: "Example in progress card" })).toBeInTheDocument();
    expect(within(detail).getByText("来源平台: Slock")).toBeInTheDocument();
    expect(within(detail).getByText("发起人: @fixture-human")).toBeInTheDocument();
    expect(within(detail).getByText("承接 Agent: @example-agent")).toBeInTheDocument();
    expect(within(detail).getByText("群组/渠道: #example-board")).toBeInTheDocument();
  });

  it("keeps OpenClaw and Slock visible when they only have execution data or listening gaps", async () => {
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
    expect(await screen.findByText("OpenClaw 执行监听已接入")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("来源平台"), "slock");
    expect((await screen.findAllByText("Slock 监听未就绪")).length).toBeGreaterThan(0);
    expect(screen.queryByText(/OpenClaw execution/)).not.toBeInTheDocument();
    expect(screen.queryByText("直接证据")).not.toBeInTheDocument();
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
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(backendSnapshot), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Runtime Fleet" }));

    expect((await screen.findAllByText("Backend Fixture Mac")).length).toBeGreaterThan(0);
    expect(vi.mocked(globalThis.fetch).mock.calls[0]?.[0]?.toString()).toContain(
      "/api/runtime-inventory/latest",
    );
  });

  it("filters Runtime Fleet agents by channel and opens agent details", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Runtime Fleet" }));
    await user.selectOptions(screen.getByLabelText("Channel"), "slock");

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
