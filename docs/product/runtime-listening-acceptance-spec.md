# Runtime Listening Acceptance Spec

版本：TinySpec v0.1

本文定义 Agentlane v1 对 OpenClaw、Multica、Slock 三个平台“真实监听到位”的验收口径。它不是 UI 设计稿，也不是平台能力承诺；它是 adapter、collector、Runs 看板和后续任务管理共同遵循的质量门槛。

## 目标

Runs 看板必须让用户找到“自己发给 Agent 的那条任务”，并知道是谁发起、哪个 Agent 承接、来自哪个群组或渠道、当前处于什么阶段、是否正在执行或失败。

每个平台 adapter 必须优先输出 Agentlane 统一字段：

| 字段 | 含义 | 前端缺失时 |
|---|---|---|
| `creator` | 发起任务的人或系统 | 显示“不支持采集”或“未知”，不能猜 |
| `assigneeAgent` | 当前承接任务的 Agent | 显示“不支持采集”或“未知”，不能用 runtime 冒充 |
| `channel` | 群组、频道、项目、会话入口 | 显示“不支持采集”或“未知”，不能展示原始 id |
| `requestExcerpt` | 发起消息或任务标题摘要 | 没有摘要的对象不能进入 Runs 任务卡 |
| `workItemStatus` | 任务阶段 | 没有 WorkItem 的对象不能进入 Runs 任务泳道 |
| `executionStatus` | 真实执行状态 | 不支持时显示“不支持采集”，不能用在线状态替代 |
| `conversationLink` | 会话、线程或 session 关联 | 不支持时不展示跳转或关联 |
| `lastSeenAt` | 最近同步时间 | 不支持时显示“未知” |

TypeScript source of truth 是 `src/runtime/runtime-listening-acceptance.ts`，harness 是 `src/runtime/runtime-listening-acceptance.test.ts`。

## 平台定位

| 平台 | Agentlane 定位 | Runs 卡片来源 | 关键风险 |
|---|---|---|---|
| OpenClaw | execution source | 不能单独生成任务卡，必须依赖 DingTalk、Slock、Multica 或其他上游 WorkItem | 有 execution 但缺 creator、群组和原始请求消息 |
| Multica | work item + execution source | Multica issue / task 可生成任务卡 | 需要确认真实 API 中 creator、assignee、chat session、runs 字段稳定 |
| Slock | task board work item source | Slock task board 可生成任务卡 | `server active` 只能表示可用，不能表示 execution running |

## 泳道映射规则

WorkStage 仍然是 Agentlane 自己的阶段，不直接等同任何平台状态。

OpenClaw：

- `queued/running` execution -> `processing`
- `succeeded` execution -> `closed`
- `failed/lost/timed_out/cancelled/unknown` execution -> `attention`
- 不产生 `pending`
- 不产生 `review`
- 未关联上游 WorkItem 的 execution 不进入 Runs 任务卡

Multica：

- issue `todo/backlog` -> `pending`
- issue `in_progress` 或 execution `queued/running` -> `processing`
- issue `in_review` -> `review`
- issue `done/cancelled` 且无失败 execution -> `closed`
- issue `blocked/unknown` 或 execution `failed/cancelled` -> `attention`

Slock：

- task `todo` -> `pending`
- task `in_progress` -> `processing`
- task `in_review` -> `review`
- task `done/cancelled` -> `closed`
- task `blocked/unknown` -> `attention`
- execution 状态必须来自 activity、event、observer 或 proxy 证据；不能由 `server active` 推断

## 验收标准

每个平台每次 live probe 后都要能生成 `RuntimeListeningAcceptanceReport`：

- OpenClaw 当前可接受状态是 `execution_only`，直到补齐上游 WorkItem 关联。
- Multica 目标状态是 `ready_for_runs`。
- Slock 目标状态是 `ready_for_runs`，但 executionStatus 可以先是 `unknown`；它不能阻塞 task board 进入 Runs。
- workspace 文件、daemon 进程、agent 在线状态都不能单独证明任务监听已到位。
- `creator` 和 `assigneeAgent` 只有 UUID 或不可读外部 id 时，只能算 `partial`；adapter 后续要补名称解析或对象目录关联。
- 前端不得展示 adapter evidence、英文 limitation、原始 command 或原始 API 字段。
- 前端不得把未关联上游 WorkItem 的裸 execution 伪造成任务卡，但必须用“监听状态”卡展示 OpenClaw `execution_only`、Slock `not_ready` 等平台级状态，避免目标平台在 Runs 中完全不可见。

## 当前下一步

1. 用当前 collector 在 `gezilinll-claw` 上重新跑 live inventory 和 work-state probe。
2. 用 `RuntimeListeningAcceptanceReport` 评估真实快照字段覆盖。
3. 针对 OpenClaw 深挖 DingTalk/channel/session 到 execution 的关联路径。
4. 针对 Slock 建立只读 API adapter，先拿 task board、channel/history，再评估 activity / execution 证据。
5. 针对 Multica 增加真实响应脱敏 fixture，锁定 creator、assignee、issue、run、chat session 字段。
