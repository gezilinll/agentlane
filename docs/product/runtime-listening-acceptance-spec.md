# Runtime Listening Acceptance Spec

版本：TinySpec v0.9

本文定义 Agentlane v1 对 OpenClaw、Multica、Slock 三个平台“真实监听到位”的验收口径。它不是 UI 设计稿，也不是平台能力承诺；它是 adapter、collector、Runs 看板和后续任务管理共同遵循的质量门槛。

## 分层原则

Agentlane 的工作态模型按产品归属分层，而不是按采集来源分层。

- Device 是设备连接与承载层，只回答“哪台设备在线、collector 是否连着、有哪些 Runtime 注册在这台设备上”。Device 不生成任务卡，也不拥有泳道。
- Runtime 是执行环境层，只回答“这个执行环境是否可用、离线、闲置或工作中”。Runtime 可以是采集入口，但任务、会话和泳道不归 Runtime 所有。
- Agent 是工作主体层，负责承接用户请求和任务。项目管理级泳道只归 Agent：待处理、处理中、待验收、已关闭、需关注。
- WorkItem、Conversation、Execution 是 Agent 工作态的三类证据：WorkItem 表达业务任务，Conversation 表达用户上下文，Execution 表达一次运行尝试。它们可以从 Runtime adapter 采集，但必须在 adapter / query 层关联到 Agent 工作模型。
- OpenClaw CLI、Slock task board、Slock activity、Multica issue/run 等都是采集策略，不是 Agentlane 产品语义。只有能帮助判断 Agent 工作项、Agent 执行态或 Runtime 粗粒度忙闲时，才应该进入统一模型。

## 目标

Agent Work Board / Runs 看板必须让用户找到“自己发给 Agent 的那条任务”，并知道是谁发起、哪个 Agent 承接、来自哪个群组或渠道、当前处于什么阶段、是否正在执行或失败。

每个平台 adapter 必须优先输出 Agentlane 统一字段：

| 字段 | 含义 | 前端缺失时 |
|---|---|---|
| `runtime` | 承载或采集该任务的 Runtime 类型，例如 OpenClaw / Multica / Slock | 显示“未知”，不能用 Channel 或设备名替代 |
| `channelKind` | 触达侧 Channel 类型，例如 DingTalk / Telegram / Slack；Slock、Multica、OpenClaw、Codex 属于 Runtime / 平台入口，不属于 Runs Channel | 显示“默认渠道”或不展示渠道 badge，不能展示原始协议字段 |
| `conversationLabel` | 用户实际发起任务的群组、频道、项目、会话或线程名称 | 显示“不支持采集”或“未知”；DingTalk 群聊缺名时只展示“DingTalk 群聊”，不能展示不可读原始 id 或过程性补全文案 |
| `creator` | 发起任务的人或系统 | 显示“不支持采集”或“未知”，不能猜 |
| `assigneeAgent` | 当前承接任务的 Agent | 显示“不支持采集”或“未知”，不能用 runtime 冒充 |
| `requestExcerpt` | 发起消息或任务标题摘要 | 没有摘要的对象不能进入 Runs 任务卡 |
| `workItemStatus` | 任务阶段 | 没有 WorkItem 的对象不能进入 Runs 任务泳道 |
| `executionStatus` | 真实执行状态 | 没有关联执行记录时不作为任务卡必要信息展示；平台不支持执行态时可以在诊断或详情中说明“不支持采集”，不能用在线状态替代 |
| `conversationLink` | 会话、线程或 session 关联 | 不支持时不展示跳转或关联 |
| `lastSeenAt` | 最近同步时间 | 不支持时显示“未知” |

TypeScript source of truth 是 `src/runtime/runtime-listening-acceptance.ts`，harness 是 `src/runtime/runtime-listening-acceptance.test.ts`。

## 平台定位

| 平台 | Agentlane 定位 | Runs 卡片来源 | 关键风险 |
|---|---|---|---|
| OpenClaw | execution source + linked message-backed work item source | DingTalk message context 只有在被 task、trajectory、requester session、task origin 或上游 WorkItem 关联时才生成任务卡；裸 execution 和未关联入站消息不能单独生成任务卡 | 必须优先用 `message_id` 把 trajectory/task execution 回连到同一条 channel message，避免重复卡片和 creator 丢失 |
| Multica | work item + execution source | Multica issue / task 可生成任务卡 | 需要确认真实 API 中 creator、assignee、chat session、runs 字段稳定 |
| Slock | task board work item source | Slock task board 可生成任务卡 | task board 生命周期和 agent activity 运行态必须分开处理；`server active` 只能表示可用，不能表示 execution running |

## 泳道映射规则

WorkStage 仍然是 Agentlane 自己的 Agent 工作阶段，不直接等同任何平台状态，也不归 Device 或 Runtime 所有。

OpenClaw：

- `queued/running` execution -> `processing`
- `succeeded` execution -> `closed`
- `failed/lost/timed_out/cancelled/unknown` execution -> `attention`
- 已关联上游 task、trajectory、requester session、task origin 或其他明确 WorkItem 的 DingTalk message-backed WorkItem 可进入 `pending`
- 不产生 `review`
- 未关联上游 WorkItem 的 execution 或入站消息不进入 Runs 任务卡

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
- task `done/cancelled/closed` -> `closed`，其中 Slock 官方 `closed` 在 Agentlane work item 中归一为 `cancelled`
- task `blocked/unknown` -> `attention`
- Slock task board 官方状态是 `todo/in_progress/in_review/done/closed`，必须以这些字段作为 WorkItem 阶段来源。
- Slock task `in_progress` 是 v1 Runs 的直接阶段证据，足以让 Agentlane 的 Agent WorkStage 进入 `processing`，并让归属 Runtime 的粗粒度运行状态进入 `working`。
- Slock Activity 官方运行态包括 `Working`、`Thinking`、`Sending message`、`Idle` 等。这类状态只作为未来更细实时忙闲证据，不是 v1 工作看板和 Runtime `working` 的前置条件，也不应原样展示为 Agentlane 产品状态。
- execution 状态若要从 Slock 补齐，必须来自 `agent:activity`、event、observer 或 proxy 证据；不能由 `server active` 推断。但 executionStatus 暂时为 `unknown` 不阻塞 task board 进入 Runs。

## 验收标准

每个平台每次 live probe 后都要能生成 `RuntimeListeningAcceptanceReport`：

- OpenClaw 当前可接受状态是：DingTalk message context 与 task、DingTalk requester session、task origin 或 trajectory `prompt.submitted` 关联时 `ready_for_runs`；只有裸 execution 或未关联入站消息时 `execution_only`。
- OpenClaw `messages.context*.json.records` 必须同时支持数组和以 msgId 为 key 的对象 map，且能从 `senderName/senderId` 生成 creator。
- OpenClaw trajectory/session runtime-context 中的 `message_id/sender/chat_id/group_subject/group_channel` 必须在 collector / adapter 层解析；当 `message_id` 能匹配 `messages.context` 时，execution 必须回连原 message-backed WorkItem，不能额外生成一张缺 creator 的 trajectory 卡片。
- OpenClaw message context 与 trajectory/session 证据不一致时，优先使用更具体的 session 证据修正同一条 message-backed WorkItem。例如 message context 只有不可读 `cid...` 兜底，但 trajectory session 是 `agent:<agent>:dingtalk:direct:<userId>` 时，必须把会话修正为私聊。
- OpenClaw 老 trajectory 如果没有 `message_id`，但同一 DingTalk session / conversation 下的用户 prompt 与 `messages.context` 文本一致或互为前缀，且时间在 2 小时内，也必须回连原 message-backed WorkItem；如果 trajectory 是 `direct` session，也可以用同一 senderId / senderName、文本和时间窗口回连原 message-backed WorkItem。这个兜底只在 adapter / collector 层执行，前端不能自己做猜测关联。
- OpenClaw DingTalk `direct/group` session 必须在 adapter / collector 层转成可读会话标签；缺少群名时，前端展示 `DingTalk 群聊`；缺少私聊人名时，前端展示 `DingTalk 私聊`，不可把 `cid...`、手机号、open conversation id 或其他不可读原始 id 当作会话名展示。
- OpenClaw 未暴露 assignee 字段时，可用已关联的 `agentId` 尾段作为承接 Agent；不能显示成“不支持采集”，也不能用 Runtime 名称冒充。
- Multica 目标状态是 `ready_for_runs`。
- Slock 目标状态是 `ready_for_runs`，但 executionStatus 可以先是 `unknown`；它不能阻塞 task board 进入 Runs。
- workspace 文件、daemon 进程、agent 在线状态都不能单独证明任务监听已到位。
- Runtime 可用、Runtime 忙闲、Agent 工作泳道必须分开验收；不能因为任务数据经由 Runtime adapter 采集，就把任务卡归属到 Runtime。
- `creator` 和 `assigneeAgent` 只有 UUID、不可读外部 id 或“不支持采集”时，只能算 `partial`；adapter 后续要补名称解析或对象目录关联。
- 前端不得展示 adapter evidence、英文 limitation、原始 command 或原始 API 字段。
- Runs Channel 筛选只能使用当前快照中实际出现的用户触达渠道，不能把 Runtime 或平台来源放进 Channel 单选列表。
- 前端详情没有关联 execution 时可以不展示执行状态；不能把所有无 execution 的任务卡都显示成“不支持采集”，也不能用在线状态补一个 execution。
- 前端不得把未关联上游 WorkItem 的裸 execution、OpenClaw `execution_only`、Slock `not_ready` 或 capability gap 伪造成任务卡。平台缺口留在诊断、spec 和日志中，不进入用户任务泳道。
- OpenClaw gateway restart recovery、heartbeat、async approval followup 等内部/system 任务不得作为用户任务进入 Runs。

## 维护规则

- Adapter 采集策略变化时，必须同步更新本 spec、`runtime-work-state-probe.md` 和对应 harness。
- 真实设备验证结果只能沉淀为当前规则、字段约束或脱敏 fixture；不要保留临时排查步骤、个人机器路径、原始 token 或过程性 checklist。
- `RuntimeListeningAcceptanceReport` 是验收入口：OpenClaw、Multica、Slock 的 readiness、字段覆盖和 gaps 必须由归一化 snapshot 推导，不能由前端临时解释平台原始字段。
- 新增平台或新增 channel 时，先在 adapter 层转成 Agentlane 的 Runtime、Channel、WorkItem、Conversation、Execution，再让页面消费统一模型。
