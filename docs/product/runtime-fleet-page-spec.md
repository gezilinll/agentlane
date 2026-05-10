# Runtime Fleet Page Spec

版本：TinySpec v0.6

Runtime Fleet 是 Agentlane v1 用来查看设备、runtime、agent 和 channel binding 的第一版管理页面。页面优先读取本地后端最新 collector snapshot 和设备连接状态；没有后端数据时回退到 collector snapshot fixture，保证开发期仍可离线预览。

## 分层原则

Runtime Fleet 必须区分“数据从哪里采集”和“产品上归属哪一层”。

- Device 管设备连接和承载状态：在线、最近心跳、连接方式、collector 状态、已注册 Runtime。Device 不拥有任务、会话或泳道。
- Runtime 管执行环境状态：是否可用、是否离线、是否闲置、是否有工作负载。Runtime 可以是采集任务和会话数据的入口，但不拥有项目管理级任务或泳道。
- Agent 管用户可理解的工作状态：待处理、处理中、待验收、已关闭、需关注，以及发起人、承接 Agent、会话/群组、消息摘要和执行结果。
- Adapter 负责把 OpenClaw、Multica、Slock 等平台差异转成 Agentlane 统一模型。UI 不能直接解释平台原始字段，也不能把平台状态原样暴露成产品语义。

## 目标

- 展示已注册设备的基本状态、hostname、OS、最后同步时间和连接状态。
- 展示设备上的 runtime，包括 OpenClaw、Codex、Claude Code、Slock、Multica 等 `kind`。
- 展示 runtime 下的 managed agents、归属 runtime、可用性、运行状态、channel binding 和最近同步。
- 支持按关键词、runtime kind、可用性、channel 过滤。
- 点击设备、runtime 或 agent 后，在右侧详情面板查看身份信息、连接状态、归属关系、已注册 Runtime 和关联渠道。
- 当设备控制面在线时，支持从页面请求远端设备刷新 snapshot。
- 页面自动轮询最新 snapshot，使运行资产管理视图持续更新。

## 非目标

- 当前版本不做中控 Agent。
- 当前版本不创建、编辑或删除外部平台 Agent。
- 当前版本不接管聊天入口。
- 当前版本不展示所有网络接口、所有 MAC 地址或所有内部进程端口。
- 当前版本不把 capabilities、sourceRefs 等原始 adapter 字段作为页面主信息。

## 数据源

页面使用 `GET /api/runtime-inventory/latest` 读取本地后端最新资产快照，并用 `GET /api/runtime-work-state/latest` 辅助推导 Runtime 运行状态和 Agent 展示状态。后端没有收到任何设备上报或不可用时，页面使用 `fixtures/runtime/collector-snapshot.sample.json` 作为开发期 fallback。组件不直接理解 OpenClaw、Slock 或 Multica 的内部结构，只消费标准化后的 Runtime Fleet view model。

页面挂载后每 30 秒读取一次 latest snapshot，并显示页面自己的上次刷新时间。自动刷新只读取后端已有快照，不自动下发远端 `inventory.refresh` 命令；远端采集仍由 collector 定时上报或用户手动点击刷新触发。

远程刷新使用 `POST /api/devices/:deviceId/refresh`。后端能通过 WebSocket 找到在线设备时，返回命令状态；设备不在线时，页面展示可解释失败，不伪装成实时刷新。设备侧执行刷新时必须同时上报 inventory 与 work-state，这样 Runtime Fleet 的 Agent 状态和 Runs 看板不会使用不同步的数据源。

## 统一语义

Adapter 必须把外部平台差异转换成 Agentlane 自己的数据语义，UI 不直接解释平台原始字段。

`lastSeenAt` 表示 Agentlane 最近一次从对应对象采集到状态的时间。Device、Runtime、Agent 都使用同一字段语义，页面以本地化时间展示，不展示原始 UTC ISO 字符串。

旧版本 snapshot 如果缺少 Agent 级 `lastSeenAt`，页面可以回退到归属 Runtime 的 `lastSeenAt`，再回退到 snapshot `observedAt`，避免在对象已被采集的情况下展示不可解释的未知时间。

Runtime 可用性继续使用 `RuntimeHealthStatus = online/degraded/offline/unknown`。Runtime 运行状态使用独立的 `RuntimeOperatingStatus`：

- `offline`：Runtime 不可达或长时间未同步。
- `working`：Runtime 可达，且至少一个关联 Agent 有 `processing` 工作项；如果没有工作项但有 `queued/running` execution，也可以作为工作中证据。Slock v1 以 task board `in_progress` 作为工作中依据，不要求实时 activity。
- `idle`：Runtime 可达，adapter 能观测该 Runtime 的工作项或执行态，且当前没有处理中工作项或运行中 execution。
- `unknown`：adapter 无法判断当前 Runtime 可用性或忙闲。

Runtime 运行状态必须从 Agentlane 统一 WorkStage / ExecutionStatus 推导，不直接把 Slock / OpenClaw / Multica 原始状态暴露到页面。

Agent 状态：

- `active`：当前有任务或会话正在执行；Slock v1 可用 task board assignee + `in_progress` 作为 Agent 正在承接任务的证据。
- `idle`：当前无任务或会话执行，但 Agent 可识别且可用；当某平台 work-state 已可观测且没有匹配该 Agent 的处理中工作项时，可以展示为空闲。
- `inactive`：已停用或不可接收任务。
- `degraded`：可识别但状态异常。
- `unknown`：adapter 无法判断当前状态。

Agent 状态必须优先使用 Agentlane WorkItem / Execution 证据，再回退到 inventory 中的 adapter 原始归一结果。Slock task board 中的 assignee 名称可以用于匹配 ManagedAgent；如果 task board 中的 `agentId` 只是 workspace / token 归属而不是任务承接者，不能用它把所有任务错误归到同一个 Agent。

Agent 工作负载统计：

- `activeTasks`：当前执行中的任务数。
- `queuedTasks`：当前排队任务数。
- `activeSessions`：当前活跃会话数。
- `historicalSessions`：历史或累计会话数。
- `maxConcurrency`：配置的并发容量。

这些统计属于 Agent 工作负载或诊断信息。Runtime 可以用它们汇总出粗粒度忙闲状态，但 Runtime 详情不展示任务/会话明细，避免把 Agent 工作管理越层放到 Runtime。

Adapter 拿不到某个字段时不伪造数据，页面展示 `不支持采集` 或不展示该区块。

## 页面字段策略

Device：

- 列表/卡片展示设备名、连接状态、最近同步、Runtime 数、Agent 数。
- 详情展示 `身份信息`、`连接状态`、`已注册 Runtime`。
- 详情中的最近同步只在概览中展示一次，连接状态不重复展示同一时间。
- 不在主界面展示 channel、sourceRefs、所有 IP、所有 MAC。

Runtime：

- 列表展示 Runtime 名称、Runtime 类型、所属设备、可用性、运行状态、最近同步。
- 详情展示 `身份信息`、`归属关系`。
- 运行入口不作为 v1 页面主信息，避免在没有明确用户价值前增加实体。
- Runtime 不展示项目管理级任务、会话泳道或 Agent 工作负载明细。
- capabilities 只作为诊断信息保留，不作为表格主列。

Agent：

- 列表展示 Agent 名称、归属 Runtime、关联渠道、状态、最近同步。
- 归属 Runtime 使用 Runtime 列表中的同一展示名，不用 UUID 作为主识别。
- 详情展示 `身份信息`、`归属关系`、`关联渠道`、`运行统计`。这里的 `运行统计` 仅指 Agent 工作负载统计，不应用于 Runtime 详情。
- sourceRefs 只用于生成平台标识或外部链接，不直接以 `source: id` 的原始形式展示。

## 验收标准

- 主导航可以进入 Runtime Fleet 页面。
- 页面顶部显示设备、在线 Runtime、Agent、异常数量。
- 用户可以搜索 `tester` 并只看到相关 Agent。
- 用户可以按 `Slock` channel 过滤 Agent。
- 用户可以点击 Agent 行并在详情面板看到归属 Runtime、归属设备、关联渠道和运行统计。
- 用户在桌面宽度滚动到 Agent 表格后点击行，详情面板仍停留在可视区域内。
- 当旧 snapshot 缺少 Agent 级最近同步时间时，Agent 列表和详情使用归属 Runtime 或 snapshot 时间回退，不展示未知。
- 用户可以点击 Runtime 行并在详情面板看到所属设备、Agent 数量、可用性和运行状态，不出现运行入口或任务/会话统计区块。
- 当 latest work-state 中 Slock Runtime 关联的 Agent 有 `in_progress` 工作项时，Runtime 运行状态显示为 `工作中`。
- 当 latest work-state 中 Slock task board 的 assignee 指向某个 Agent 且任务为 `in_progress` 时，该 Agent 状态显示为 `活跃`；已可观测但无处理中任务时显示为空闲。
- 用户可以点击 Device 卡片并在详情面板看到身份信息、连接状态和已注册 Runtime。
- 当后端已有最新 snapshot 时，页面展示后端设备名称而不是 fixture 设备名称。
- 页面自动读取后端 latest snapshot，并展示上次刷新时间。
- 当设备在线时，点击刷新按钮会请求后端下发远程刷新命令；设备离线时展示失败原因。
- OpenClaw 历史 session 数展示为历史会话，不展示为活跃会话。
- Slock 仅能识别 workspace 时，Agent 状态为未知，不伪装成活跃。
- 页面在桌面和移动宽度下不横向溢出。
