# Runtime Fleet Page Spec

版本：TinySpec v0.1

Runtime Fleet 是 Agentlane v1 用来查看设备、runtime、agent 和 channel binding 的第一版管理页面。阶段 1 只使用 collector snapshot fixture 驱动页面；阶段 2 再接入真实后端 API。

## 目标

- 展示已注册设备的基本状态、hostname、OS、最后在线时间。
- 展示设备上的 runtime，包括 OpenClaw、Codex、Claude Code、Slock、Multica 等 `kind`。
- 展示 runtime 下的 managed agents、来源、状态、channel binding 和负载摘要。
- 支持按关键词、runtime kind、状态、channel 过滤。
- 点击 runtime 或 agent 后，在右侧详情面板查看来源引用、capabilities、channel binding 和健康信息。

## 非目标

- 阶段 1 不接真实后端。
- 阶段 1 不做中控 Agent。
- 阶段 1 不创建、编辑或删除外部平台 Agent。
- 阶段 1 不接管聊天入口。

## 数据源

页面使用 `fixtures/runtime/collector-snapshot.sample.json` 作为开发期数据源。组件不直接理解 OpenClaw、Slock 或 Multica 的内部结构，只消费 `RuntimeInventorySnapshot`。

## 验收标准

- 主导航可以进入 Runtime Fleet 页面。
- 页面顶部显示设备、在线 Runtime、Agent、异常数量。
- 用户可以搜索 `tester` 并只看到相关 Agent。
- 用户可以按 `Slock` channel 过滤 Agent。
- 用户可以点击 Agent 行并在详情面板看到 channel 和来源信息。
- 页面在桌面和移动宽度下不横向溢出。
