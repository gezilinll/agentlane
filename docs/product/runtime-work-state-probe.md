# Runtime Work State Probe

版本：TinySpec v0.2

本文记录 Agentlane 对 OpenClaw、Multica、Slock 在工作项、会话和执行态上的探测结果。它用于指导后续 Runtime Fleet、任务看板和 Agent 调度能力，不代表已经开始接管聊天入口或任务调度。

## 目标数据

Agentlane 需要把外部平台数据先转成自己的工作态模型，再交给页面、Catalog 或后续调度能力消费。当前 TypeScript source of truth 是 `src/runtime/runtime-work-state.ts`。

目标对象：

- `RuntimeWorkItem`：业务工作项，例如 Slock board card、Multica issue、外部任务或需求卡片。
- `RuntimeConversation`：会话或线程，例如 channel thread、DM、OpenClaw session、Multica chat session。
- `RuntimeExecution`：一次具体运行，例如 OpenClaw run、Multica task/run、Slock agent activity。
- `RuntimeObservationCapability`：平台能力声明，用于说明某个平台通过什么策略满足哪些字段，以及还有什么限制。

目标状态：

- WorkItem：`todo`、`in_progress`、`in_review`、`done`、`blocked`、`cancelled`、`unknown`。
- Conversation：`open`、`active`、`idle`、`closed`、`unknown`。
- Execution：`queued`、`running`、`succeeded`、`failed`、`cancelled`、`unknown`。
- WorkStage：`pending`、`processing`、`review`、`closed`、`attention`。

## 统一阶段规则

WorkStage 是 Agentlane 用于统一任务队列或看板的阶段，不等于任一平台的原始状态。当前 source of truth 是 `deriveRuntimeWorkStage`，harness 在 `src/runtime/runtime-work-state.test.ts` 中覆盖。

| WorkStage | 中文含义 | 进入规则 | 说明 |
|---|---|---|---|
| `pending` | 待处理 | 有业务 WorkItem，状态是待办或 backlog 映射到待办 | 表示任务已进入系统，但尚未进入 Agent 处理 |
| `processing` | 处理中 | WorkItem 处于处理中，或 Execution 是 `queued/running` | Slock 的处理中只代表业务阶段；必须有 execution evidence 才代表真实运行中 |
| `review` | 待验收 | WorkItem 处于 review / in_review | 表示等待人审、结果确认或下游验收 |
| `closed` | 已关闭 | WorkItem 已 done/cancelled，或无 review 概念的平台 execution succeeded | 表示无需继续推进，包含完成或取消 |
| `attention` | 需关注 | blocked、failed、lost、timed out、cancelled execution、unknown 或平台不支持的阶段 | 表示失败、阻塞、状态不可信或需要补观测 |

阶段和执行态的基本约束：

- WorkStage 优先表达“项目管理阶段”，Execution.status 表达“真实运行状态”。
- 看板 `in_progress` 不能直接证明 execution `running`。
- 如果平台没有 review 概念，不允许为了统一 UI 伪造 review 阶段。
- 如果平台没有业务 WorkItem，不允许为了填满看板伪造 pending 阶段。
- Adapter 必须给出 `confidence`：`direct`、`partial` 或 `unsupported`。

## 平台阶段映射

| 平台 | pending | processing | review | closed | attention |
|---|---|---|---|---|---|
| OpenClaw | 不支持；需上游 WorkItem | execution `queued/running` | 不支持 | execution `succeeded` | execution `failed/cancelled/unknown/lost/timed_out`，或出现 unsupported WorkItem 阶段 |
| Multica | issue `todo/backlog` | issue `in_progress` 或 execution `queued/running` | issue `in_review`，若平台暴露 | issue `done/cancelled` 或 execution `succeeded` | issue `blocked/unknown` 或 execution `failed/cancelled` |
| Slock | task `todo` | task `in_progress`，但无 execution evidence 时 `confidence=partial` | task `in_review` | task `done/cancelled` | task `blocked/unknown` 或 execution `failed/cancelled` |

OpenClaw 特别规则：

- OpenClaw 是 runtime / execution 强来源，不是项目管理任务源。
- OpenClaw 没有 review 概念，execution 成功后直接进入 `closed`。
- OpenClaw 的待处理必须来自 DingTalk、Slock、Multica 或其他上游 WorkItem，不能由 OpenClaw adapter 自己推断。
- OpenClaw `lost`、`timed_out` 归一到 execution failed 后进入 `attention`。

Slock 特别规则：

- Slock task board 可以可靠提供 WorkItem 阶段。
- Slock server info 中的 agent `active` 只能表示在线或可用，不能作为 execution running 证据。
- 在没有 activity/event/proxy 证据前，Slock task `in_progress` 的 WorkStage 是 `processing`，但 `confidence=partial`。

Multica 特别规则：

- Multica issue 是 WorkItem 强来源。
- Multica task/run 是 Execution 强来源。
- 如果 issue status 和 execution status 冲突，失败类 execution 优先进入 `attention`，运行中 execution 优先进入 `processing`，其余再使用 issue 阶段。

## 探测摘要

| 平台 | WorkItem | Conversation | Execution | 建议策略 |
|---|---|---|---|---|
| OpenClaw | 不直接提供业务看板，需依赖上游任务源 | 可通过 session/channel health 做部分会话态 | 支持，通过 `tasks list`、`status`、`health` | `cli` + `native_api` |
| Multica | 支持，通过 `issue list/get/status` | 部分支持，通过 `chat_session_id`、issue runs/messages | 支持，通过 `agent tasks`、`issue runs`、daemon `active_task_count` | `cli` + `native_api` |
| Slock | 支持，通过 task board API/CLI | 支持 channel/thread history，DM 依赖 agent context | 暂不完整；server `active` 不是执行中 | `native_api` + `cli`，执行态再评估 proxy/launcher |

## OpenClaw

只读探测命令：

- `openclaw status --json --timeout 5000`
- `openclaw health --json --timeout 5000`
- `openclaw tasks list --json`

已确认字段：

- Runtime：`runtimeVersion`、gateway reachability、gateway URL、agent list、channel health。
- Conversation：agent session count、recent session keys、recent session updated time。
- Execution：`taskId`、`runId`、`status`、`runtime`、`agentId`、`ownerKey`、`requesterSessionKey`、`createdAt`、`startedAt`、`endedAt`、`lastEventAt`、`deliveryStatus`。
- Channel：DingTalk `running`、`connected`、`lastConnectedAt`、`lastInboundAt`、`lastEventAt`、`lastError`。

探测样本摘要：

- `tasks list` 返回 1087 个 task。
- 状态包括 `succeeded`、`lost`、`timed_out`、`failed`、`cancelled`。
- `health` 返回 main agent 的 session count 和 recent session keys。
- DingTalk channel 当前可观测连接态和最近事件时间。

映射建议：

- `RuntimeExecution.status`：`succeeded` -> `succeeded`；`failed`、`timed_out`、`lost` -> `failed`；`cancelled` -> `cancelled`；运行中状态出现时映射为 `running`；排队态出现时映射为 `queued`。
- `RuntimeWorkStage`：`queued/running` -> `processing`；`succeeded` -> `closed`；`failed/cancelled/unknown/lost/timed_out` -> `attention`。OpenClaw 不产生 `pending` 或 `review`。
- `RuntimeConversation`：用 OpenClaw session key 生成会话对象，`updatedAt` 映射为 `lastActivityAt` / `lastSeenAt`。
- `RuntimeWorkItem`：OpenClaw 本身不提供业务看板，暂不从 OpenClaw adapter 伪造 WorkItem。若后续 DingTalk 或其他上游渠道提供任务对象，应由对应 channel adapter 产生 WorkItem。

结论：

- OpenClaw 能满足执行态和会话态的 v1 需求。
- OpenClaw 不能单独满足业务看板态，需要上游任务源或 channel adapter 补齐。

## Multica

只读探测命令：

- `multica daemon status --output json`
- `multica runtime list --output json`
- `multica agent list --output json`
- `multica agent tasks <agent-id> --output json`
- `multica issue list --output json`
- `multica issue runs <issue-id> --output json`

已确认字段：

- Runtime：`id`、`provider`、`name`、`status`、`runtime_mode`、`daemon_id`、`last_seen_at`、`metadata`、`launch_header`。
- Agent：`id`、`name`、`runtime_id`、`status`、`max_concurrent_tasks`、`model`、`visibility`、`updated_at`。
- WorkItem：issue `id`、`identifier`、`number`、`title`、`description`、`status`、`assignee_id`、`assignee_type`、`creator_id`、`creator_type`、`priority`、`labels`、`created_at`、`updated_at`。
- Execution：task/run `id`、`issue_id`、`agent_id`、`runtime_id`、`chat_session_id`、`kind`、`status`、`attempt`、`max_attempts`、`priority`、`created_at`、`dispatched_at`、`started_at`、`completed_at`、`error`、`work_dir`。

探测样本摘要：

- daemon 当前 `status=running`，`active_task_count=0`。
- runtime list 返回 3 个 runtime。
- agent list 返回 8 个 agent，其中 7 个 `idle`，1 个 `offline`。
- issue list 返回 50 个 issue，状态包括 `todo`、`backlog`、`cancelled`、`done`、`blocked`。
- issue runs 和 agent tasks 都能返回执行历史与运行时间字段。
- 主动探测曾确认任务会从 `queued` 进入 `running`，daemon `active_task_count` 会从 0 变 1，完成后回到 0。

映射建议：

- `RuntimeWorkItem.status`：`todo` -> `todo`；`backlog` 可先映射为 `todo`；`blocked` -> `blocked`；`done` -> `done`；`cancelled` -> `cancelled`。若 Multica 后续暴露 review 状态，再映射 `in_review`。
- `RuntimeWorkStage`：issue `todo/backlog` -> `pending`；issue `in_review` -> `review`；issue `done/cancelled` -> `closed`；issue `blocked/unknown` -> `attention`；execution `queued/running` 优先 -> `processing`；execution `failed/cancelled` 优先 -> `attention`。
- `RuntimeConversation`：优先用 `chat_session_id`；issue 维度的对话可通过 `issue run-messages` 补。
- `RuntimeExecution.status`：Multica task status 可直接映射到 `queued`、`running`、`succeeded` / `failed` / `cancelled`。当前 `completed` 映射为 `succeeded`。

结论：

- Multica 能满足 WorkItem、Conversation、Execution 三层的大部分 v1 需求。
- 需要在 adapter 内处理 `backlog/completed` 等平台状态到 Agentlane 状态的映射。

## Slock

只读探测方式：

- `slock server info`
- `slock task list --channel <channel>`
- `GET /internal/agent/:agentId/tasks?channel=<channel>`
- `GET /internal/agent/:agentId/history?channel=<target>&limit=<n>`
- Slock daemon 源码中确认内部存在 `agent:activity`，但当前 CLI 没有直接暴露可查询 activity state。

已确认字段：

- Server info：channel list、joined state、agent list、agent `active/inactive`。
- Task board：`id`、`taskNumber`、`status`、`taskStatus`、`title`、`content`、`channelName`、`channelType`、`messageId`、`threadId`、`createdByName`、`claimedByName`、`createdAt`、`updatedAt`、`completedAt`。
- History：message `id`、`seq`、`channelId`、`senderType`、`senderId`、`messageType`、`content`、`threadId`、`taskStatus`、`taskNumber`、`createdAt`、`updatedAt`、`replyCount`。

探测样本摘要：

- 样例 channel A 的 task board 返回 55 个任务：`in_progress=39`、`in_review=6`、`done=10`。
- 样例 channel B 的 task board 返回 41 个任务：`in_progress=7`、`in_review=19`、`done=15`。
- task API 的完整列表需要不带 `status=all`；状态过滤使用 `status=in_progress`、`status=in_review`、`status=done` 等。
- channel/thread history 能返回消息结构；DM history 是否可读依赖当前 agent context。
- `server info` 中的 agent `active` 表示 Slock 侧可用或在线，不等于 Agentlane 的 `RuntimeExecution.status=running`。

映射建议：

- `RuntimeWorkItem`：Slock task board 是首选来源。`status` 可直接映射 `in_progress`、`in_review`、`done`；若出现未覆盖状态，映射为 `unknown` 并记录 adapter warning。
- `RuntimeWorkStage`：task `todo` -> `pending`；task `in_progress` -> `processing` 且 `confidence=partial`，除非有 execution evidence；task `in_review` -> `review`；task `done/cancelled` -> `closed`；task `blocked/unknown` -> `attention`。
- `RuntimeConversation`：channel target 和 thread target 可生成 conversation；`threadId` / `messageId` 用作外部引用。
- `RuntimeExecution`：不应从 Slock task status 或 server `active` 推断 execution running。执行态需要额外路径：
  - 优先继续探测 Slock 是否有可用 activity/event API。
  - 可选使用 Agentlane-managed launcher 或进程内 observer 读取 daemon `agent:activity`。
  - 可选使用网络 proxy 观察 WSS/HTTPS 事件，但若要读明文需要证书/进程代理配合，成本和安全边界更重。

结论：

- Slock 能满足业务看板态和部分会话态。
- Slock 当前不能仅靠 CLI/server info 满足真实执行态，需要 activity API、observer 或 proxy 方案补齐。

## 当前设计判断

- Adapter 可以选择不同采集策略，但必须输出 Agentlane 统一模型。
- WorkItem 状态和 Execution 状态必须分开：看板 `in_progress` 不代表 runtime 正在执行。
- OpenClaw 先作为 execution/session 强来源。
- Multica 作为 work item + execution 的强来源。
- Slock 作为 task board 强来源，但 execution state 需要单独方案。
- 网络 proxy 可以作为增强策略，但 v1 不应默认要求 TLS 明文拦截；优先使用平台 API/CLI 和低侵入 observer。

## 前端闭环范围

Runs / Work Board 第一版是只读页面，用于验证统一工作态模型是否能被用户理解和验收。

- 页面只读取 `GET /api/runtime-work-state/latest`，没有后端快照时使用明确标识的 fixture。
- 页面只消费 `runtime-work-state-query.ts` 生成的 lane、summary、detail 和 capability notes。
- 页面不直接判断 OpenClaw、Multica、Slock 原始状态含义。
- 页面不提供拖拽、写回、指派、接管聊天或代理流量入口。
- 页面必须展示 `confidence` 和平台能力缺口，避免把 partial / unsupported 数据误呈现为强事实。
