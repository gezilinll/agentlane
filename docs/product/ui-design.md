# Agentlane Product Design

版本：Product Concept v0.1

Agentlane 是面向生产环境的 Agent Network 控制平面，用来管理人、Agent、Workflow、Skill、多设备 Worker、Run、Memory、Policy 与 Governance。它的目标不是提供一个新的聊天入口，而是把分散在个人电脑、远端机器、cron、skill、脚本、对话入口和人工经验里的 Agentic Work，收敛成可以被观察、调度、治理和演进的产品系统。

## 设计原则

- 产品形态是生产级 AgentOps Console，不是聊天产品，也不是单 Agent 框架。
- Skill 是一等对象，必须能查看、编辑、测试、发布、同步到 Worker、回滚和下线。
- Agent、Workflow、Skill、Worker、Run、Policy、Registry、Governance 都应有明确 owner、权限、生命周期和审计记录。
- Semantic Coordinator 负责语义路由、拆解、跨域协调和升级；Runtime / Execution Fabric 负责队列、Worker 调度、并发、重试、健康检查和故障切换。
- 页面图用于表达产品界面方向；交互、对象边界和实现依据以本文档为准。

## 信息架构

Agentlane 第一版采用桌面 Web Console。核心导航包含：

- 总控台 Command Center
- 对象目录 Catalog
- Agent Studio
- Workflow Studio
- Skill Registry & Editor
- Worker Fleet
- Runs / Run Trace
- People & Access
- Integrations & Resources
- Governance Center

三类主要用户动线：

- 运营者：Command Center -> Runs / Run Trace -> Worker Fleet / Governance Center
- Agent/Workflow 创建者：Catalog -> Agent Studio / Workflow Studio / Skill Editor -> Dry Run -> Publish -> Runs
- 平台管理员：People & Access -> Integrations & Resources -> Worker Fleet -> Governance Center

## 运行态术语

- Run：一次端到端执行实例，包含 route plan、tasks、logs、outputs、approvals 和 audit records。
- Task：Runtime Fabric 可调度的执行单元，可以等待 Worker、等待并发槽位，或被 Worker 执行。
- Active Runs：尚未 completed、failed、cancelled 或 archived 的 Run，包括 running、queued、waiting approval、retrying 等状态。
- Queue Depth：Task Queue 中尚未被 Worker pick up 的排队 Task 数，不包含正在执行的 in-flight tasks，也不包含未来定时但尚未入队的 scheduled tasks。

一个 Run 可以包含多个 Task。例如一次 AI+ 转化率分析 Run，可能拆成链接解析、BI 查询、星图查询、报告生成和钉钉发送多个 Task。

## 01. 总控台 Command Center

![总控台 Command Center](../../assets/product-ui/01-command-center.png)

Purpose:
查看 Agent Network 当前是否健康，包括活跃 Agent、运行中的 Run、在线 Worker、队列深度、失败任务、审批和治理风险。

Primary users:
平台运营者、OpenClaw 运维者、团队负责人。

Key interactions:

- 使用全局 Command 搜索对象、Run、Worker 或治理事件。
- 点击 KPI 卡片下钻到 Runs、Worker Fleet 或 Governance。
- 从拓扑图查看 Users -> Semantic Coordinator -> Task Queue -> Worker Fleet -> Outputs 的运行链路。
- 在右侧处理待审批任务或打开风险告警。
- 快速创建 Agent、Workflow、Skill 或注册 Worker。

Data objects:
Agent、Workflow、Skill、Worker、Run、Task Queue、Approval、Alert、Policy、Audit Log。

Entry points:
登录后默认首页、告警邮件/钉钉通知、Run Trace 返回入口。

Exit points:
Run Trace、Worker Fleet、Governance Center、Catalog、Workflow Studio。

## 02. 对象目录 Catalog

![对象目录 Catalog](../../assets/product-ui/02-catalog.png)

Purpose:
作为所有正式对象的统一 Registry，集中查看 Agent、Workflow、Skill、Tool、Data Source、Memory、Policy、Worker 的 owner、生命周期、健康状态和依赖关系。

Primary users:
Agent/Workflow 创建者、平台管理员、治理负责人。

Key interactions:

- 按对象类型、owner、lifecycle、health、permission risk 过滤。
- 搜索已有对象，例如 `aetheris-link-inspect`、`AI+ Conversion Workflow`、`OpenClaw Worker Pool`。
- 打开右侧详情抽屉查看依赖、最近 Runs、使用方和风险。
- 从目录直接创建 Agent、Workflow、Skill 或注册资源。
- 进入对应 Studio 或 Editor 做编辑和发布。

Data objects:
CatalogObject、Agent、Workflow、Skill、Tool、Data Source、Memory、Policy、Worker、Dependency、Lifecycle。

Entry points:
Command Center、全局 Command、Governance 告警、Run Trace 依赖跳转。

Exit points:
Agent Studio、Workflow Studio、Skill Editor、Integrations & Resources、Governance Center。

## 03. Agent Studio

![Agent Studio](../../assets/product-ui/03-agent-studio.png)

Purpose:
创建和维护 Domain Agent。Agent 负责领域判断、归因、解释和建议，不直接替代 Workflow 或 Skill。

Primary users:
领域 owner、平台管理员、Agent 维护者。

Key interactions:

- 编辑 Agent 的 Purpose、Domain、Role 和 Output Contract。
- 分配 Owner 和 Responsibility Tags。
- 绑定 Skills / Tools，例如 Aetheris CLI、event-analysis、obslog-query、BI Query、Xingtu Link Inspect。
- 设置 Memory Scope 和 Permission Policy。
- 配置 Eval Checklist，并执行 Test Run。
- 从 Draft 推进到 Review、Pilot、Production、Monitor。
- 发布新版本或回滚到历史版本。

Data objects:
Agent、Owner、ResponsibilityTag、SkillBinding、ToolBinding、MemoryScope、PermissionPolicy、Eval、Version、Run。

Entry points:
Catalog、Create Agent Flow、Governance 缺失 owner 告警。

Exit points:
Runs / Run Trace、Catalog、Governance Center、Skill Registry & Editor。

## 04. Workflow Studio

![Workflow Studio](../../assets/product-ui/04-workflow-studio.png)

Purpose:
编排可重复运行的固定 Workflow，明确触发、步骤、调用对象、审批、产物、接收人和生命周期。

Primary users:
业务流程 owner、运营者、平台管理员。

Key interactions:

- 选择 Trigger，例如 Schedule、Event、Webhook、Manual、DingTalk。
- 拖拽或新增步骤节点。
- 绑定 Domain Agent、Skill 和 Tool。
- 设置 Human Approval、Output、接收人、timeout、retry 和 eval。
- 执行 Dry Run 验证输入输出。
- 发布到 Pilot 或 Production，并保留 Version。
- 从 Run Trace 回看每个节点执行情况。

Data objects:
Workflow、Trigger、Step、AgentBinding、SkillBinding、ToolCall、Approval、Output、Schedule、Version、Run。

Entry points:
Catalog、Create Workflow Flow、Command Center 快捷创建。

Exit points:
Runs / Run Trace、Governance Center、Agent Studio、Skill Registry & Editor。

## 05. Skill Registry & Editor

![Skill Registry & Editor](../../assets/product-ui/05-skill-registry-editor.png)

Purpose:
把 OpenClaw 风格的 Skill 作为一等资产管理，支持查看、编辑、测试、发布、同步到多 Worker、回滚和下线。

Primary users:
Skill 维护者、OpenClaw 运维者、Agent/Workflow 创建者。

Key interactions:

- 搜索和筛选 Skill，例如 `aetheris-link-inspect`、`event-analysis`、`obslog-query`。
- 查看 Skill metadata：source、version、owner、used by、required tools、permission risk、last sync、health。
- 打开 `SKILL.md`、Scripts、Tests、Versions。
- 编辑说明、触发规则、脚本或测试用例。
- 执行 Dry Run，验证输入输出和权限。
- 创建版本并发布。
- 选择目标 Worker 同步 Skill。
- 监控调用失败率，并支持 Rollback / Disable。

Data objects:
Skill、SkillVersion、SkillScript、SkillTest、WorkerSyncTarget、Dependency、PermissionRisk、AuditLog。

Entry points:
Catalog、Agent Studio skill binding、Workflow Studio skill binding、Governance 风险告警。

Exit points:
Worker Fleet、Run Trace、Governance Center、Catalog。

## 06. Worker Fleet

![Worker Fleet](../../assets/product-ui/06-worker-fleet.png)

Purpose:
管理分布式执行设备，包括 M1、ECS、Browser Worker 和 OpenClaw Worker。它属于 Runtime / Execution Fabric，不负责语义编排。

Primary users:
平台管理员、OpenClaw 运维者、值班运营者。

Key interactions:

- 注册新 Worker，并选择 M1 / ECS / Browser Worker 类型。
- 查看 heartbeat、CPU/RAM、queue、active sessions、capabilities、pool 和 last error。
- 对 Worker 执行 Drain、Resume、Failover、View Logs。
- 查看当前 sessions，并迁移任务到其他 Worker。
- 按 Worker Pool、能力标签、健康状态筛选。
- 从 Worker 详情查看 OpenClaw、Nowledge、SLS、GitLab、Aetheris 等能力是否可用。

Data objects:
Worker、WorkerPool、WorkerCapability、Heartbeat、HealthCheck、Session、Task、Queue、FailoverEvent。

Entry points:
Command Center、Run Trace、Register Worker Flow、Governance 稳定性告警。

Exit points:
Run Trace、Skill Sync、Governance Center、Audit Log。

## 07. Runs / Run Trace

![Runs / Run Trace](../../assets/product-ui/07-run-trace.png)

Purpose:
查看单次任务从入口、语义路由、排队、Worker 分配、工具调用、审批、产出到审计的完整链路。

Primary users:
运营者、Agent/Workflow owner、平台管理员、问题排查人员。

Key interactions:

- 查看 Route Plan，确认 Semantic Coordinator 为什么这样分配。
- 查看 Queue、Session Router 和 Worker Selection。
- 展开 Tool Calls、Skill Calls、Logs 和中间产物。
- 处理 Human Approval。
- 执行 Retry、Cancel、Reroute 或 Create Incident。
- 查看 Output Preview 和 Audit Record。
- 从失败节点跳转到 Worker Fleet、Skill Editor 或 Governance。

Data objects:
Run、Task、RoutePlan、QueueItem、WorkerAssignment、ToolCall、SkillCall、LogEvent、Approval、Output、AuditRecord。

Entry points:
Command Center KPI、告警、Workflow Studio Dry Run、Run Execution Flow。

Exit points:
Worker Fleet、Skill Registry & Editor、Governance Center、Output、Decision Record。

## 08. People & Access

![People & Access](../../assets/product-ui/08-people-access.png)

Purpose:
管理人、角色画像、责任标签、owner 槽位、权限范围和审批链。Personal Work Agent 是个人入口实例，不是职位 Agent。

Primary users:
平台管理员、团队负责人、治理负责人。

Key interactions:

- 邀请成员并设置 Role Profile。
- 添加 Responsibility Tags，例如 Cost Owner、Quality Owner、Metric Owner。
- 为 Agent、Workflow、Skill、Policy 分配 owner。
- 配置 Permission Scope 和 Approval Chain。
- 查看个人入口、偏好记忆和 owned objects。
- 审计权限变更和审批行为。

Data objects:
User、RoleProfile、ResponsibilityTag、OwnerSlot、PermissionPolicy、ApprovalChain、PersonalWorkAgent、PreferenceMemory。

Entry points:
Governance 缺失 owner 告警、Catalog 对象详情、Command Center 管理入口。

Exit points:
Governance Center、Agent Studio、Workflow Studio、Catalog。

## 09. Integrations & Resources

![Integrations & Resources](../../assets/product-ui/09-integrations-resources.png)

Purpose:
管理工具、数据源、记忆、凭证和外部系统，让 Agent、Workflow、Skill 不直接散落绑定底层资源。

Primary users:
平台管理员、资源 owner、Skill 维护者。

Key interactions:

- 添加 Integration，例如 OpenClaw、Nowledge、DingTalk、slock.ai、BI、Xingtu、SLS、GitLab、Aetheris CLI。
- 测试连接和健康检查。
- 设置 Credential Scope 和 Permission Scope。
- 配置 Memory 与 Data Source 的使用范围。
- 查看 Used by Agents / Workflows / Skills。
- 打开 Audit Log 或禁用风险资源。

Data objects:
Integration、Tool、DataSource、Memory、Credential、MessagingChannel、Repository、HealthCheck、PermissionScope。

Entry points:
Catalog、Agent Studio、Workflow Studio、Skill Editor、Governance 风险告警。

Exit points:
Governance Center、Run Trace、Catalog、People & Access。

## 10. Governance Center

![Governance Center](../../assets/product-ui/10-governance-center.png)

Purpose:
统一处理权限、审批、审计、成本、稳定性、安全、记忆治理、评测和生命周期策略。

Primary users:
治理负责人、平台管理员、值班运营者、业务 owner。

Key interactions:

- 查看风险摘要和 risk signals。
- 处理 approval queue，并支持 Approve、Reject、Escalate。
- 编辑 Permission Policy、Cost Guard、Memory Governance 和 Lifecycle Policy。
- 查看 Audit Logs 和 Policy Matrix。
- 设置 Eval 规则和稳定性规则。
- 对反复失败或低质输出触发升级、重跑、回滚或下线。

Data objects:
Policy、Approval、AuditLog、RiskSignal、CostGuard、SecurityRule、MemoryGovernanceRule、Eval、LifecycleTransition。

Entry points:
Command Center 告警、Run Trace 异常、Catalog 风险对象、Failure Recovery Flow。

Exit points:
Run Trace、People & Access、Worker Fleet、Catalog、Decision Record。

## 流程图

### 创建 Agent 流程 Create Agent Flow

![创建 Agent 流程](../../assets/product-ui/flow-create-agent.png)

核心逻辑：

- 从 Catalog 新建 Agent，进入 Agent Studio。
- 先定义 Purpose、Domain 和 Output Contract，再分配 Owner 与 Responsibility Tags。
- 绑定 Skills、Tools、Memory Scope 和 Permission Policy。
- 配置 Eval Checklist 并执行 Test Run。
- 通过 Review Approval 后发布到 Production。
- 进入 Monitor 状态后，按风险和效果选择 Rollback、Retire 或 Replace。

关键风险点：
缺失 owner、权限风险、eval 失败、依赖 Skill 或 Tool 不健康。

### 创建 Workflow 流程 Create Workflow Flow

![创建 Workflow 流程](../../assets/product-ui/flow-create-workflow.png)

核心逻辑：

- 从 Catalog 新建 Workflow，进入 Workflow Studio。
- 选择 Trigger，编排 Steps，绑定 Domain Agent、Skill 和 Tool。
- 配置 Human Approval、Output、接收人、Schedule、Retry 和 Eval。
- 先 Dry Run，再进入 Review Approval。
- 通过后发布到 Pilot 或 Production。
- 运行后持续进入 Runs 和 Governance 监控。

关键风险点：
缺失 owner、审批链缺失、dry-run 失败、输出接收人不明确、权限过大。

### Skill 生命周期 Skill Lifecycle Flow

![Skill 生命周期](../../assets/product-ui/flow-skill-lifecycle.png)

核心逻辑：

- 从 Skill Registry 搜索并打开 Skill Detail。
- 查看 `SKILL.md`、Scripts、Tests、Versions 和调用历史。
- 编辑说明、脚本或测试样例后执行 Dry Run。
- 通过依赖检查和权限检查后创建版本。
- Review Approval 后同步到选定 Workers。
- 监控调用失败率和风险信号。
- 出问题时 Rollback、Disable、Retire 或 Replace。

关键风险点：
测试失败、依赖缺失、权限风险、Worker 同步失败、失败率升高。

### 注册 Worker 流程 Register Worker Flow

![注册 Worker 流程](../../assets/product-ui/flow-register-worker.png)

核心逻辑：

- 在 Worker Fleet 点击 Register Worker。
- 选择 M1、ECS 或 Browser Worker 类型。
- 建立 SSH 或 Tailscale 连接。
- 安装 Agentlane Worker，并绑定 OpenClaw、Nowledge 和 Skills。
- 执行 Capability Scan 和 Heartbeat Check。
- 分配 Worker Pool，建立 Capacity Baseline。
- Ready 后进入持续监控。
- 不健康时执行 Drain、Failover 或下线。

关键风险点：
SSH 失败、依赖缺失、健康检查失败、容量不足、OpenClaw/Nowledge 不可用。

### 运行执行流程 Run Execution Flow

![运行执行流程](../../assets/product-ui/flow-run-execution.png)

核心逻辑：

- 任务从 DingTalk、slock.ai、Cron、CLI 或 API 进入。
- 先进行 Identity & Permission Check。
- Intent Classification 后交给 Semantic Coordinator 做 Route、Plan 和 Split。
- 选择 Agent 或 Workflow，再进入 Task Queue。
- Session Router 选择合适 Worker。
- Worker 执行 Tool / Skill Calls。
- 如需要，触发 Human Approval。
- 交付 Brief、Report、Alert、Task、Decision 或 Follow-up。
- 写入 Run Trace、Audit Record、Memory 和 Decision Record。

关键风险点：
权限拒绝、路由不明确、Worker 不可用、审批超时、Tool/Skill 调用失败。

### 故障恢复流程 Failure Recovery Flow

![故障恢复流程](../../assets/product-ui/flow-failure-recovery.png)

核心逻辑：

- Risk Signal 或 Alert 触发排查。
- 从 Governance 或 Command Center 打开 Run Trace。
- 判断失败类型：权限、Worker、Tool/Skill、低质输出、成本或稳定性。
- 查看 Worker Health，决定 Retry、Reroute 或 Drain。
- Worker 不健康时 Failover 到其他 Worker。
- 重跑受影响任务并交付修正输出。
- 必要时 Human Escalation。
- 写入 Audit Record，并沉淀 Decision Record 或更新 Policy。

关键风险点：
重复失败、权限风险、Worker 不健康、输出质量低、Cost Guard 触发。

## 实现优先级

- 第一版前端可以优先实现 Command Center、Catalog、Skill Registry & Editor、Worker Fleet、Run Trace 五个页面，覆盖最核心的“可见、可管、可追踪”能力。
- Workflow Studio 与 Agent Studio 可以先做表单 + 简化节点画布，不必一开始做复杂低代码拖拽。
- Governance Center 初期先实现审批、审计、风险事件和生命周期变更，成本守护与 eval 可以后置增强。
- Integrations & Resources 初期先接 OpenClaw、Nowledge、DingTalk/slock、BI/星图/SLS、GitLab、Aetheris CLI。
- 图片中的 UI 细节不应被机械照搬，真正实现时应以对象模型、交互流和运行态数据为准。
