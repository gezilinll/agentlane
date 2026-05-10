# Runtime Listening Acceptance Spec

版本：TinySpec v0.3

本文定义 Agentlane v1 对 OpenClaw、Multica、Slock 三个平台“真实监听到位”的验收口径。它不是 UI 设计稿，也不是平台能力承诺；它是 adapter、collector、Runs 看板和后续任务管理共同遵循的质量门槛。

## 目标

Runs 看板必须让用户找到“自己发给 Agent 的那条任务”，并知道是谁发起、哪个 Agent 承接、来自哪个群组或渠道、当前处于什么阶段、是否正在执行或失败。

每个平台 adapter 必须优先输出 Agentlane 统一字段：

| 字段 | 含义 | 前端缺失时 |
|---|---|---|
| `runtime` | 承载该任务的 Runtime 类型，例如 OpenClaw / Multica / Slock | 显示“未知”，不能用 Channel 或设备名替代 |
| `channelKind` | 触达侧 Channel 类型，例如 DingTalk / Telegram / Slack / Slock 默认入口 | 显示“不支持采集”或“默认”，不能展示原始协议字段 |
| `conversationLabel` | 用户实际发起任务的群组、频道、项目、会话或线程名称 | 显示“不支持采集”或“未知”，不能展示不可读原始 id |
| `creator` | 发起任务的人或系统 | 显示“不支持采集”或“未知”，不能猜 |
| `assigneeAgent` | 当前承接任务的 Agent | 显示“不支持采集”或“未知”，不能用 runtime 冒充 |
| `requestExcerpt` | 发起消息或任务标题摘要 | 没有摘要的对象不能进入 Runs 任务卡 |
| `workItemStatus` | 任务阶段 | 没有 WorkItem 的对象不能进入 Runs 任务泳道 |
| `executionStatus` | 真实执行状态 | 不支持时显示“不支持采集”，不能用在线状态替代 |
| `conversationLink` | 会话、线程或 session 关联 | 不支持时不展示跳转或关联 |
| `lastSeenAt` | 最近同步时间 | 不支持时显示“未知” |

TypeScript source of truth 是 `src/runtime/runtime-listening-acceptance.ts`，harness 是 `src/runtime/runtime-listening-acceptance.test.ts`。

## 平台定位

| 平台 | Agentlane 定位 | Runs 卡片来源 | 关键风险 |
|---|---|---|---|
| OpenClaw | execution source + message-backed work item source | 有 DingTalk message context、DingTalk requester session、task origin、trajectory prompt 或上游 WorkItem 关联时可生成任务卡；裸 execution 不能单独生成任务卡 | session / origin / trajectory 可补群组和请求摘要，但 creator 可能只能标记为不支持采集 |
| Multica | work item + execution source | Multica issue / task 可生成任务卡 | 需要确认真实 API 中 creator、assignee、chat session、runs 字段稳定 |
| Slock | task board work item source | Slock task board 可生成任务卡 | `server active` 只能表示可用，不能表示 execution running |

## 泳道映射规则

WorkStage 仍然是 Agentlane 自己的阶段，不直接等同任何平台状态。

OpenClaw：

- `queued/running` execution -> `processing`
- `succeeded` execution -> `closed`
- `failed/lost/timed_out/cancelled/unknown` execution -> `attention`
- DingTalk message-backed、session-backed、task-origin-backed 或 trajectory-backed WorkItem 可进入 `pending`
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

- OpenClaw 当前可接受状态是：有 DingTalk message context、DingTalk requester session、task origin 或 trajectory `prompt.submitted` 与 execution 关联时 `ready_for_runs`；只有裸 execution 时 `execution_only`。
- OpenClaw `messages.context*.json.records` 必须同时支持数组和以 msgId 为 key 的对象 map，且能从 `senderName/senderId` 生成 creator。
- OpenClaw DingTalk `direct/group` session 必须在 adapter / collector 层转成可读会话标签；缺少群名或人名时可显示 `DingTalk 私聊/群聊 + 短 id`，但前端不能直接展示完整原始会话 id。
- OpenClaw 未暴露 assignee 字段时，可用已关联的 `agentId` 尾段作为承接 Agent；不能显示成“不支持采集”，也不能用 Runtime 名称冒充。
- Multica 目标状态是 `ready_for_runs`。
- Slock 目标状态是 `ready_for_runs`，但 executionStatus 可以先是 `unknown`；它不能阻塞 task board 进入 Runs。
- workspace 文件、daemon 进程、agent 在线状态都不能单独证明任务监听已到位。
- `creator` 和 `assigneeAgent` 只有 UUID、不可读外部 id 或“不支持采集”时，只能算 `partial`；adapter 后续要补名称解析或对象目录关联。
- 前端不得展示 adapter evidence、英文 limitation、原始 command 或原始 API 字段。
- 前端不得把未关联上游 WorkItem 的裸 execution、OpenClaw `execution_only`、Slock `not_ready` 或 capability gap 伪造成任务卡。平台缺口留在诊断、spec 和日志中，不进入用户任务泳道。
- OpenClaw gateway restart recovery、heartbeat、async approval followup 等内部/system 任务不得作为用户任务进入 Runs。

## 当前下一步

1. 用当前 collector 在 `gezilinll-claw` 上重新跑 live inventory 和 work-state probe。
2. 用 `RuntimeListeningAcceptanceReport` 评估真实快照字段覆盖。
3. 针对 OpenClaw 继续用真实 DingTalk 消息验证 message context、requester session、target directory、task origin、trajectory prompt 和 delivery evidence 的关联稳定性。
4. 针对 Slock 使用本地 agent token 只读调用 internal API，并从 `/server` 自动发现 channel 后拉 task board；再评估 activity / execution 证据。
5. 针对 Multica 增加真实响应脱敏 fixture，锁定 creator、assignee、issue、run、chat session 字段。
