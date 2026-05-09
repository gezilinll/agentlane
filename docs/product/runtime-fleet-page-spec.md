# Runtime Fleet Page Spec

版本：TinySpec v0.3

Runtime Fleet 是 Agentlane v1 用来查看设备、runtime、agent 和 channel binding 的第一版管理页面。页面优先读取本地后端最新 collector snapshot 和设备连接状态；没有后端数据时回退到 collector snapshot fixture，保证开发期仍可离线预览。

## 目标

- 展示已注册设备的基本状态、hostname、OS、最后同步时间和连接状态。
- 展示设备上的 runtime，包括 OpenClaw、Codex、Claude Code、Slock、Multica 等 `kind`。
- 展示 runtime 下的 managed agents、归属 runtime、状态、channel binding、最近同步和统一运行统计。
- 支持按关键词、runtime kind、状态、channel 过滤。
- 点击设备、runtime 或 agent 后，在右侧详情面板查看身份信息、连接状态、归属关系、已注册 Runtime、关联渠道和运行统计。
- 当设备控制面在线时，支持从页面请求远端设备刷新 snapshot。
- 页面自动轮询最新 snapshot，使运行资产管理视图持续更新。

## 非目标

- 当前版本不做中控 Agent。
- 当前版本不创建、编辑或删除外部平台 Agent。
- 当前版本不接管聊天入口。
- 当前版本不展示所有网络接口、所有 MAC 地址或所有内部进程端口。
- 当前版本不把 capabilities、sourceRefs 等原始 adapter 字段作为页面主信息。

## 数据源

页面使用 `GET /api/runtime-inventory/latest` 读取本地后端最新快照。后端没有收到任何设备上报或不可用时，页面使用 `fixtures/runtime/collector-snapshot.sample.json` 作为开发期 fallback。组件不直接理解 OpenClaw、Slock 或 Multica 的内部结构，只消费标准化后的 Runtime Fleet view model。

页面挂载后每 30 秒读取一次 latest snapshot，并显示页面自己的上次刷新时间。自动刷新只读取后端已有快照，不自动下发远端 `inventory.refresh` 命令；远端采集仍由 collector 定时上报或用户手动点击刷新触发。

远程刷新使用 `POST /api/devices/:deviceId/refresh`。后端能通过 WebSocket 找到在线设备时，返回命令状态；设备不在线时，页面展示可解释失败，不伪装成实时刷新。

## 统一语义

Adapter 必须把外部平台差异转换成 Agentlane 自己的数据语义，UI 不直接解释平台原始字段。

`lastSeenAt` 表示 Agentlane 最近一次从对应对象采集到状态的时间。Device、Runtime、Agent 都使用同一字段语义，页面以本地化时间展示，不展示原始 UTC ISO 字符串。

Agent 状态：

- `active`：当前有任务或会话正在执行。
- `idle`：当前无任务或会话执行，但 Agent 可识别且可用。
- `inactive`：已停用或不可接收任务。
- `degraded`：可识别但状态异常。
- `unknown`：adapter 无法判断当前状态。

运行统计：

- `activeTasks`：当前执行中的任务数。
- `queuedTasks`：当前排队任务数。
- `activeSessions`：当前活跃会话数。
- `historicalSessions`：历史或累计会话数。
- `maxConcurrency`：配置的并发容量。

Adapter 拿不到某个统计字段时不伪造数据，页面展示 `不支持采集`。

## 页面字段策略

Device：

- 列表/卡片展示设备名、连接状态、最近同步、Runtime 数、Agent 数。
- 详情展示 `身份信息`、`连接状态`、`已注册 Runtime`。
- 不在主界面展示 channel、sourceRefs、所有 IP、所有 MAC。

Runtime：

- 列表展示 Runtime 名称、Kind、状态、所属设备、最近同步。
- 详情展示 `身份信息`、`归属关系`、`运行统计`。
- 运行入口不作为 v1 页面主信息，避免在没有明确用户价值前增加实体。
- capabilities 只作为诊断信息保留，不作为表格主列。

Agent：

- 列表展示 Agent 名称、归属 Runtime、关联渠道、状态、最近同步。
- 归属 Runtime 使用 Runtime 列表中的同一展示名，不用 UUID 作为主识别。
- 详情展示 `身份信息`、`归属关系`、`关联渠道`、`运行统计`。
- sourceRefs 只用于生成平台标识或外部链接，不直接以 `source: id` 的原始形式展示。

## 验收标准

- 主导航可以进入 Runtime Fleet 页面。
- 页面顶部显示设备、在线 Runtime、Agent、异常数量。
- 用户可以搜索 `tester` 并只看到相关 Agent。
- 用户可以按 `Slock` channel 过滤 Agent。
- 用户可以点击 Agent 行并在详情面板看到归属 Runtime、归属设备、关联渠道和运行统计。
- 用户可以点击 Runtime 行并在详情面板看到所属设备和运行统计，不出现运行入口区块。
- 用户可以点击 Device 卡片并在详情面板看到身份信息、连接状态和已注册 Runtime。
- 当后端已有最新 snapshot 时，页面展示后端设备名称而不是 fixture 设备名称。
- 页面自动读取后端 latest snapshot，并展示上次刷新时间。
- 当设备在线时，点击刷新按钮会请求后端下发远程刷新命令；设备离线时展示失败原因。
- OpenClaw 历史 session 数展示为历史会话，不展示为活跃会话。
- Slock 仅能识别 workspace 时，Agent 状态为未知，不伪装成活跃。
- 页面在桌面和移动宽度下不横向溢出。
