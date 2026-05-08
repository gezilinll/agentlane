import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";

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
});
