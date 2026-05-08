import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import fixtureSnapshot from "../fixtures/runtime/collector-snapshot.sample.json";
import type { RuntimeInventorySnapshot } from "./runtime";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
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

  it("opens Runtime Fleet and renders the fixture runtime inventory", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Runtime Fleet" }));

    expect(screen.getByRole("heading", { name: "运行资产" })).toBeInTheDocument();
    expect(screen.getByText("Fixture Mac")).toBeInTheDocument();
    expect(screen.getByText("OpenClaw Gateway")).toBeInTheDocument();
    expect(screen.getByText("tester")).toBeInTheDocument();
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

    expect(await screen.findByText("Backend Fixture Mac")).toBeInTheDocument();
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
    expect(within(detail).getByText("Slock")).toBeInTheDocument();
    expect(within(detail).getByText("slock: tester")).toBeInTheDocument();
  });
});
