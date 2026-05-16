# Skill Management Spec

状态：当前规则

本规格定义 Lorume 对 Skill 的组织级资产管理、导入校验、权限审核、目标分配和异步操作状态规则。Skill 是组织内可复用、可版本化、可审计的能力资产，不只是某台设备或某个 runtime 上的本地文件。

## 目标

- 统一查看组织内和已注册设备 / runtime / agent 上可识别的 Skill。
- 支持从本地 Markdown、ZIP 包、GitHub URL 和 Marketplace URL / 条目导入 Skill。
- 支持把设备、runtime 或 agent 上已有的 Skill 提升为组织级 Skill。
- 组织级 Skill 必须保存自己的内容副本和版本，不能只引用来源设备上的路径。
- 支持发布 Skill 版本；发布权限不足或风险较高时进入审核。
- 支持在 Skill Registry 内编辑当前最新 Markdown 源文，并保存为新的草稿版本。
- 支持把组织级 Skill 分配到 Device、Runtime 或 Agent。
- Skill 分配和后续同步必须通过可审计的 Operation / Job Runner 表达状态；不在页面内假装同步已经完成。
- 支持资源级权限和审核流，避免普通成员直接编辑、发布或下发到非本人管理的目标。
- 所有平台差异必须由 adapter 转换成 Lorume 的 Skill 语义，UI 不直接判断 OpenClaw、Multica 或 Slock 的本地目录规则。
- UI 只能暴露已有 HTTP API、权限规则和 harness 覆盖的动作。target support 原因等能力如果没有 API 与 harness，不出现在页面动作中。

## 非目标

- 不提供“让 Agent 自己安装 Skill”的入口，不让 Agent 通过对话自行推断安装方式。
- 不把外部 GitHub 仓库、Marketplace 条目或设备本地路径当成组织 Skill 的唯一存储。
- 不承诺静态校验可以证明第三方脚本绝对安全。
- 不做跨组织共享 Skill。
- 不做复杂工作流引擎。审核只覆盖 Skill 编辑、发布、分配和下发所需的最小状态。
- 不在前端、日志、fixture、测试或文档中保存平台 token、GitHub token、设备 token 或 Skill 中疑似密钥的完整值。

## 对象边界

### Skill

Skill 是组织级能力资产。它拥有名称、描述、owner、生命周期、权限和版本列表。组织级 Skill 是可复用资产库，不是默认生效层；它不会自动应用到组织内所有 Device、Runtime 或 Agent。

字段：

- `id`：内部 ID。
- `organizationId`：所属组织。
- `slug`：组织内唯一可读标识，由导入或创建时生成。
- `name`：展示名，来自 `SKILL.md` frontmatter 或用户输入。
- `description`：简短说明。
- `ownerUserId`：Skill owner。
- `status`：`draft`、`published`、`archived`。
- `source`：最近一次内容来源摘要，例如 `upload_md`、`upload_zip`、`github_url`、`marketplace_url`、`manual_edit`、`device_discovery`。
- `createdAt` / `updatedAt` / `archivedAt`：创建、更新和归档时间。

### Skill Version

Skill Version 是 Skill 的不可变内容版本。每次导入或编辑都会创建新的版本记录；编辑保存为草稿版本，发布只改变对应版本的发布状态，不覆盖历史版本。

字段：

- `id`：内部 ID。
- `skillId`：所属 Skill。
- `version`：组织内展示版本，可由用户输入或系统生成。
- `packageHash`：规范化内容包 hash。
- `summary`：本版本变更摘要。
- `createdByUserId`：创建人。
- `publishedByUserId`：发布人，可为空。
- `publishedAt`：发布时间，可为空。
- `validationStatus`：`passed`、`warning`、`blocked`。
- `validationResult`：导入与发布校验结果摘要。

### Skill File

Skill File 是某个版本中的文件内容。组织级 Skill 必须保存自己的文件副本。

字段：

- `id`：内部 ID。
- `skillVersionId`：所属版本。
- `path`：包内相对路径，规范化后不能逃出 Skill 根目录。
- `contentHash`：文件 hash。
- `sizeBytes`：文件大小。
- `content` 或 `blobRef`：文件内容或对象存储引用。当前包大小受限时可以直接由 Postgres 保存。

### Discovered Target Skill

Discovered Target Skill 表示 collector 从已注册 Device、Runtime 或 Agent 的本地 Skill 目录中识别到的 Skill 包。它是“目标当前有什么”的只读快照，不是组织资产，也不是安装记录。

字段：

- `id`：内部 ID，由目标 ID 和本地 Skill 目录生成。
- `deviceId`：来源设备。
- `source`：来源 runtime / adapter，例如 `openclaw`、`multica`、`slock` 或 `manual`。
- `targetType` / `targetId` / `targetName`：Skill 当前归属的 Device、Runtime 或 Agent。
- `runtimeId` / `agentId`：当目标或来源可解析到 Runtime / Agent 时记录。
- `name` / `description`：来自 `SKILL.md` frontmatter 或一级标题。
- `packageHash`：当前发现包的内容 hash。
- `skillPath`：设备上的来源目录，仅用于定位与审计，不作为组织 Skill 的持久内容。
- `files`：已规范化的文件快照，至少包含 `SKILL.md`。
- `lastSeenAt`：最近一次发现时间。

规则：

- Collector 只扫描显式配置的 `skillDiscoveryTargets` / `skillDiscoveryRoots` 和 adapter 已知的本地 Skill 目录；扫描结果随 Runtime inventory 上报。
- 发现结果写入 `runtime_skill_discoveries`，下一次同设备快照中缺失的发现结果会被移除，保持“目标当前状态”语义。
- 用户点击“提升为组织 Skill”时，后端必须把发现结果中的文件内容复制成新的组织 Skill 和 Skill Version，来源类型为 `device_discovery`。
- 被提升后的组织 Skill 与来源目录解耦；目标设备上删除或修改本地 Skill，不会删除或覆盖组织 Skill 的历史版本。
- 提升动作仍进入统一 Skill 包校验链路；校验阻断时不创建组织 Skill。

### Skill Assignment

Skill Assignment 表示“组织 Skill 的某个版本被显式分配到某个目标”。它不是安装记录，也不等于目标上已经存在该 Skill。只有用户或审核流程明确选择 Device、Runtime 或 Agent 目标后，组织 Skill 才会进入目标解析 Skill Set。

目标类型：

- `device`：分配到某台设备。
- `runtime`：分配到某个 runtime。
- `agent`：分配到某个 managed agent。

字段：

- `id`：内部 ID。
- `organizationId`：所属组织。
- `skillId` / `skillVersionId`：分配的 Skill 和版本。
- `targetType` / `targetId`：目标类型和目标 ID。
- `status`：`pending_review`、`approved`、`syncing`、`synced`、`failed`、`unsupported`、`disabled`。
- `createdByUserId`：创建人。
- `approvedByUserId`：批准人，可为空。
- `lastSyncJobId`：最近一次同步操作，可为空。
- `createdAt` / `updatedAt`：创建和更新时间。

### Skill Sync Job

Skill Sync Job 是一次确定性下发、删除或校验操作的审计记录。它由 [Operation And Job Runner Spec](./operation-job-runner-spec.md) 中的 Operation / Job Runner 驱动，记录操作结果，不承担长期安装状态。

字段：

- `id`：内部 ID。
- `assignmentId`：关联分配，可为空。一次仅校验目标现状时可以没有分配。
- `action`：`sync`、`remove`、`verify`。
- `targetType` / `targetId`：操作目标。
- `status`：`queued`、`running`、`succeeded`、`failed`、`unsupported`。
- `operationId` / `jobId`：关联公共异步 Operation 和 Job，可为空。
- `commandId`：关联 collector 控制面命令，可为空。
- `packageHash`：操作时使用的版本 hash。
- `startedAt` / `finishedAt`：开始和完成时间。
- `errorSummary`：失败摘要，不包含密钥或完整原始日志。

同步规则：

- 用户触发同步时，系统创建 `skill_sync` Operation / Job，不在请求内直接写目标设备。
- Job Runner 读取 Assignment、Skill Version 和文件内容，创建 `Skill Sync Job`，并通过 device control channel 下发 `skill.sync` 命令。
- `skill.sync` payload 只包含目标、Skill 元数据、package hash 和已规范化的文件列表；不包含平台 token、登录态或外部平台原始响应。
- Collector 必须根据命令中的 `targetType` / `targetId` 解析目标写入位置。解析优先级为：`skillSyncTargets` 精确 `targetId` 配置、`skillSyncTargets` 的 source/runtime/agent external id 配置、全局 `skillSyncRoot`、collector 默认 `.lorume/skills` staging root。
- `skillSyncTargets` 是设备本地配置，不由前端拼路径；它可以用 `targetId` 精确绑定，也可以用 `source`、`runtimeExternalId`、`agentExternalId` 描述 OpenClaw、Multica、Slock 等 adapter 能识别的目标。
- Collector 写入前必须校验文件相对路径、文件大小和 SHA-256 hash，并用临时目录 + 原子 rename 替换目标 Skill 目录。
- Collector 成功回报必须包含写入文件数和 root 解析方式；失败摘要只保留用户可理解错误，不泄露密钥。
- Collector 成功回报后，`Skill Sync Job` 进入 `succeeded`，对应 Assignment 进入 `synced`。
- Collector 失败、超时或目标不支持时，`Skill Sync Job` 进入 `failed` 或 `unsupported`，对应 Assignment 进入 `failed` 或 `unsupported`，并保留用户可读失败摘要。
- 重复收到同一个 commandId 时，collector 只回报重复成功，不重复写入。
- 当前确定性写回根目录由 collector 配置和 adapter 目标解析决定；没有 runtime 专属目标配置时默认写入 collector 的 Skill sync root，不由 UI 拼接本地路径。

### Resource Permission

Resource Permission 表示用户或成员组对某个资源的细粒度授权。

资源类型：

- `skill`
- `device`
- `runtime`
- `agent`

Skill 权限：

- `view`：查看 Skill。
- `edit`：编辑 Skill 草稿。
- `publish`：发布 Skill 版本。
- `archive`：归档或删除 Skill。
- `manage_access`：管理 Skill 的资源级授权。

目标资源权限：

- `manage_skills`：允许把 Skill 分配和下发到该 Device、Runtime 或 Agent。

组织角色仍然存在，但资源级权限用于控制具体 Skill 和具体目标。下发不是独立权限；用户只是在已批准的 Assignment 上触发或重试系统同步。

### Approval Request

Approval Request 表示一次需要人工批准的动作。审核必须保存结构化动作快照，不能只保存一个不透明扩展字段。

触发场景：

- 无 `publish` 权限的用户请求发布 Skill 版本。
- 把 Skill 分配或下发到非本人管理的 Agent。
- 把 Skill 分配或下发到共享 Device、共享 Runtime、生产目标或缺失 owner 的目标。
- 高风险 Skill 包请求发布或下发。

字段：

- `id`：内部 ID。
- `organizationId`：所属组织。
- `action`：`publish_skill`、`assign_skill`、`sync_skill`、`archive_skill`、`delete_skill`。
- `skillId`：关联 Skill。
- `skillVersionId`：关联版本，可为空。
- `targetType` / `targetId`：动作目标，可为空。
- `riskLevel`：`low`、`medium`、`high`、`blocked`。
- `riskSummary`：风险摘要。
- `requestedReason`：申请原因，可为空。
- `snapshotHash`：申请时 Skill 版本、目标和风险结果的快照 hash。
- `requestedByUserId`：申请人。
- `requiredApproverUserIds` 或 `requiredRole`：可审批主体。
- `status`：`pending`、`approved`、`rejected`、`cancelled`。
- `metadata`：少量扩展信息，不存储密钥、完整日志或 Skill 文件内容。
- `createdAt` / `resolvedAt`：创建和处理时间。

## Skill 包格式

Lorume 接受以下导入形态：

- 单个 Markdown 文件：文件内容被规范化为 `SKILL.md`。
- ZIP 包：包根目录或首层目录必须包含唯一 `SKILL.md`。
- GitHub URL：支持 `github.com` 仓库根目录、`tree` 子目录或 `blob` 文件 URL；导入后记录 resolved ref 和 package hash。
- Marketplace URL / 条目：Marketplace 只作为来源发现和下载入口；当前接受能直接下载 Markdown 或 ZIP 内容的 URL，下载后的内容仍按统一包规则校验和入库。

Skill 包必须包含：

- 唯一的 `SKILL.md`。
- 可解析的 YAML frontmatter。
- `name` 和 `description`。

Skill 包可以包含任意安全的相对目录和文件，例如：

- `references/`
- `scripts/`
- `assets/`
- `tests/`
- runtime 特定配置文件。

Lorume 不约束 Skill 包的目录命名风格。中文目录名、空格和用户自定义目录都可以存在，只要系统能确定唯一 Skill 根目录，并且所有文件都留在该根目录内。

## 导入与校验

校验结果分为：

- `blocked`：阻断导入、发布或下发。
- `warning`：允许保存草稿，但发布或下发可能需要审核。
- `info`：展示提示，不影响流程。

阻断规则：

- 缺少唯一 `SKILL.md`。
- `SKILL.md` frontmatter 无法解析。
- 缺少必填字段 `name` 或 `description`。
- ZIP entry 的实际落盘路径包含绝对路径、目录逃逸或无法规范化的路径。
- 单文件、总包、文件数或目录深度超过限制。
- 文件名包含控制字符或无法规范化。

目录逃逸只检查包内文件实际落盘路径，不扫描 Markdown 或脚本内容里的 `../` 字符串。Skill 文档或脚本可以用相对路径引用包内上级目录文件，只要文件本身仍位于 Skill 根目录内。

当前限制：

- 单文件不超过 `1MB`。
- ZIP 解包后总大小不超过 `8MB`。
- 文件数不超过 `128`。
- 目录深度不超过 `4`。

风险分级规则：

- 包含 `scripts/`、shebang、`.sh`、`.bash`、`.zsh`、`.ps1`、`.cmd`、`.bat`、`.mjs`、`.cjs`、`.js`、`.ts` 等可执行或脚本内容：`warning`。
- 包含 `package.json`、`requirements.txt`、`pyproject.toml`、`Cargo.toml` 等依赖安装文件：`warning`。
- 包含嵌套压缩包：`warning`。
- 缺少 license frontmatter：`warning`。
- license 字段不是可识别 SPDX 表达：`warning`。
- compatibility 缺失：`warning`。
- compatibility 明确排除目标 runtime：目标下发时 `blocked`。

校验只做代码级确定性检查和静态风险分级，不调用 LLM 判断脚本意图，不承诺第三方代码安全。

## 生命周期

Skill 生命周期：

- `draft`：可编辑，不能被下发到目标。
- `published`：已发布版本，可以被分配和下发。
- `archived`：保留历史和审计，不允许新增分配或下发。

规则：

- 编辑已发布 Skill 会产生草稿，不直接修改已发布版本。
- 页面内编辑当前只支持单文件 `SKILL.md` 的最新 Markdown 源文。多文件 Skill 必须通过重新导入更新，避免只保存源文时丢失配套文件。保存草稿时必须重新走 Skill 包规范化和静态校验，生成新的不可变 Skill Version，并把 Skill 状态置为 `draft`。
- 发布草稿会标记当前草稿版本为已发布，并把 Skill 状态置为 `published`。
- 已发布版本不可变。
- 归档 Skill 不删除历史文件、Assignment 和同步记录。
- 删除只允许用于未发布且未被 Assignment 引用的草稿 Skill。
- 组织级 Skill 被提升后保存独立副本，来源设备或 runtime 删除本地 Skill 不影响组织副本。

## 权限与审核

基础组织角色：

- `owner`：组织所有者。
- `admin`：组织管理员。
- `member`：普通成员。

资源级权限优先用于具体操作：

- 查看 Skill：需要 `skill.view`，组织 owner / admin 默认拥有。
- Skill owner 默认拥有该 Skill 的查看、编辑、发布、归档和授权管理能力。
- 编辑 Skill 草稿：需要 `skill.edit`。
- 发布版本：需要 `skill.publish`，没有权限时创建审核。
- 分配 Skill 到目标：需要 `skill.view`，并且对目标有 `manage_skills` 或获得目标 owner 审核。
- 触发同步：Assignment 必须已批准，且用户对目标有 `manage_skills` 或是该 Assignment 的申请人 / 审批人。
- 归档：需要 `skill.archive`，归档保留 Assignment 和同步记录，不需要额外审核。
- 删除：需要 `skill.archive`，并且只允许未发布且未被 Assignment 引用的草稿 Skill；其他情况必须归档。
- 管理 Skill 授权：需要 `skill.manage_access`。

目标 owner 规则：

- Device owner 可以批准下发到该设备。
- Runtime owner 可以批准下发到该 runtime。
- Agent owner 可以批准下发到该 agent。
- 组织 owner / admin 可以处理缺失 owner 的目标。

审核规则：

- 对个人自有 Agent 的低风险 Skill 分配可以直接批准。
- 对非本人 Agent、共享 Agent、共享 Device、共享 Runtime、生产目标或高风险 Skill 必须审核。
- 审核通过后，系统创建对应 Operation；Operation 成功后才创建或激活 Assignment，并继续触发后续同步。
- 审核拒绝后，不得留下半激活 Assignment。
- 审核通过的是申请时的 `snapshotHash`。如果 Skill 版本、目标或风险结果变化，必须重新申请。

## 目标层级与生效规则

Skill 可以分配到 Device、Runtime 或 Agent。组织级 Skill 只作为资产来源，不参与默认生效。目标 Skill Set 由查询层根据显式 Assignment 计算，不在前端拼接。

概念边界：

- `Organization Skill`：组织资产库中的 Skill 内容副本和版本。它可以被复用、编辑、发布和分配，但不会默认应用到任何目标。
- `Skill Assignment`：组织 Skill 的某个版本被显式分配到 Device、Runtime 或 Agent。
- `Target Skill Set`：某个目标按 Device -> Runtime -> Agent 层级解析后应该使用的 Skill 列表。
- `Installed Skill`：已经通过同步命令写入目标并完成校验的 Skill。只有 Assignment 状态为 `synced` 时，才表示该 Skill 已安装生效。

优先级：

1. Agent Assignment。
2. Runtime Assignment。
3. Device Assignment。

如果同一个 Skill 在多个层级分配：

- 更具体目标覆盖更泛目标。
- 同一 target 上同一 Skill 只能有一个 active Assignment。
- 已 disabled 的 Assignment 不参与生效计算。
- `pending_review` Assignment 不参与 Target Skill Set。
- `approved` Assignment 进入 Target Skill Set，但状态为待同步。
- `syncing` Assignment 进入 Target Skill Set，但状态为同步中。
- `synced` Assignment 进入 Target Skill Set，且表示已安装生效。
- `failed` / `unsupported` Assignment 进入 Target Skill Set，作为需要处理的目标状态，不代表已安装生效。

Runtime 与 Agent 的继承含义：

- Runtime 可以使用其自身 Assignment，以及所属 Device 的可兼容 Assignment。
- Agent 可以使用自身 Assignment，以及所属 Runtime / Device 的可兼容 Assignment。
- 兼容性由 Skill metadata、目标 runtime kind 和 adapter capability 共同决定。

目标解析顺序：

1. 查询目标自身及其父级目标的显式 Assignment。
2. 去掉 `pending_review`、`disabled` 和不兼容 Assignment。
3. 按同一 `skillId` 去重，更具体目标覆盖更泛目标。
4. 返回 Target Skill Set，并同时返回每个 Skill 的安装状态：待同步、同步中、已安装、失败或不支持。
5. UI 可以展示 Target Skill Set 和安装状态，但不能把组织资产库中的未分配 Skill 展示为目标已生效 Skill。

## Adapter 能力矩阵

Adapter 必须声明：

- `discover`：能否发现目标上的 Skill。
- `read`：能否读取 Skill 内容。
- `write`：能否写入或更新 Skill。
- `remove`：能否从目标移除 Skill。
- `verify`：能否校验目标上的 Skill hash 或版本。
- `reload`：写入后是否需要 reload / restart。
- `scope`：支持的目标层级，例如 device、runtime、agent。
- `limitations`：已知限制。

当前平台规则：

### OpenClaw

- 支持发现、读取、写入和校验 OpenClaw Skill。
- 优先使用 OpenClaw 官方 CLI 或明确的本地 Skill 目录。
- 写入后必须通过 CLI list/info 或文件 hash 校验。
- 如果 OpenClaw runtime 不可达，目标展示为不支持下发或同步失败。

### Multica

- 支持通过 Multica 的 workspace / local Skill 与 agent 关联模型管理 Skill。
- 优先使用 Multica 自己的 Skill 管理能力，不直接绕过平台模型写底层目录。
- 如果 Multica agent 背后暴露底层 runtime，底层 runtime 写入只能作为 adapter 明确支持的策略，不能由 UI 推断。
- 下发后必须能从 Multica Skill / agent 关联结果或本地 Skill report 中校验。

### Slock

- Slock 不承诺 native Skill store。
- Slock agent 的 Skill 管理通过其底层 runtime 完成，例如 Codex 或 OpenClaw。
- Adapter 需要识别 Slock agent 背后的 runtime，并把 Skill 下发委托给对应 runtime adapter。
- 不直接写 `.slock` 目录作为默认策略。
- 如果无法识别底层 runtime 或无法校验写入结果，目标展示为不支持下发。

### Codex

- 支持通过 Codex 本地 Skill 目录发现、读取、写入和校验 Skill。
- Skill 目录位置由 collector 根据环境变量和默认路径识别。
- 写入后通过目录扫描和 hash 校验。

## 通知

Skill 导入、校验、发布、审核、分配、下发和归档产生的异步状态由 [Operation And Job Runner Spec](./operation-job-runner-spec.md) 管理，通知由 [Notification Spec](./notification-spec.md) 统一管理。

Skill 模块必须发出以下通知事件：

- 导入完成或失败。
- 发布需要审核。
- 审核通过或拒绝。
- 下发完成或失败。
- 归档完成。
- 高风险 Skill 请求发布或下发。

通知事件只包含摘要和跳转引用，不包含 Skill 文件正文、完整脚本、密钥或原始 adapter 返回体。

## 当前 HTTP API 边界

Skill API：

- `GET /api/skills`：列出当前用户在组织内可查看的 Skill。
- `POST /api/skills/import`：导入 Markdown、ZIP、GitHub URL 或 Marketplace 来源。
- `GET /api/skill-discoveries`：按组织和可选设备读取当前 collector 发现的目标本地 Skill。
- `POST /api/skill-discoveries/:discoveryId/promote`：把目标本地 Skill 的文件快照复制为新的组织 Skill，来源类型为 `device_discovery`。
- `GET /api/skills/:skillId`：读取可查看 Skill 的详情。
- `GET /api/skills/:skillId/versions/:versionId/files`：读取可查看版本文件树。
- `POST /api/skills/:skillId/versions`：对可编辑 Skill 创建新的草稿版本。当前页面编辑器提交 Markdown 源文，后端按 `manual_edit` 来源重新规范化、校验并保存文件副本。
- `POST /api/skills/:skillId/archive`：归档可归档 Skill。归档是软删除，默认列表不再返回，但详情、版本和文件历史仍可读取。
- `DELETE /api/skills/:skillId`：只删除未发布且未被 Assignment 引用的草稿 Skill；已发布、已归档或被引用 Skill 返回阻断错误。
- `POST /api/skills/:skillId/publish`：创建发布 Operation 或创建发布审核。

Resource Permission API：

- `POST /api/resource-permissions`：授予某用户对 Skill、Device、Runtime 或 Agent 的资源级权限。组织 owner / admin 可直接授权；普通成员需要对该资源有 `manage_access`。

Assignment API：

- `GET /api/skill-assignments`：列出分配。
- `POST /api/skill-assignments`：创建分配 Operation 或创建分配审核。
- `POST /api/skill-assignments/:assignmentId/sync`：为已批准或可重试的 Assignment 创建 `skill_sync` Operation，并由 Job Runner 异步下发到目标设备。
- `GET /api/skill-targets/:targetType/:targetId/skill-set`：根据 Runtime Fleet 中的 Device -> Runtime -> Agent 父子关系和显式 Assignment，返回某个目标当前解析出的 Target Skill Set。组织资产库中的未分配 Skill 不会出现在结果中。

Approval API：

- `GET /api/approval-requests`：列出待处理审核。
- `POST /api/approval-requests/:requestId/approve`：批准。
- `POST /api/approval-requests/:requestId/reject`：拒绝。

Operation / Notification API：

- `GET /api/operations`：按组织、资源类型、资源 ID、目标或状态查询异步操作。
- `GET /api/operations/:operationId`：读取单个异步操作和 job 明细。
- `GET /api/notifications`：按组织读取页面内通知线程。
- `GET /api/notifications/:threadId`：读取通知线程和投递明细。

当前 Skill Registry 页面从 Runtime Fleet 查询结果中派生可分配目标，并在用户选择目标后调用 Skill target HTTP API 展示目标 Skill Set 与安装状态。页面不得在前端自行拼接生效规则，也不得调用不存在的 target support 原因 API。
当前 Skill Registry 页面可以对已批准、已同步、失败或不支持的 Assignment 触发“同步到目标”；该动作只创建 Operation，不直接写设备。

## UI 规则

Skill Registry 页面必须支持：

- 在用户已选组织后读取组织 Skill、分配、待处理审核、相关 Operation、通知和 Runtime Fleet 目标。
- 展示设备发现到的本地 Skill，并支持把发现结果提升为独立组织 Skill。
- 查看 Skill 详情、版本、文件树、校验结果、分配目标、相关 Operation 和待处理审核。
- 导入 Markdown、ZIP、GitHub URL 和 Marketplace URL。ZIP 文件由页面转成 base64 后进入同一个 `POST /api/skills/import` 校验链路。
- 单文件 `SKILL.md` 可以打开最新版本源文，支持源文编辑和本地 Markdown 预览；保存时调用 `POST /api/skills/:skillId/versions` 创建新的草稿版本，不直接覆盖已发布版本。
- 发布版本或提交发布审核。
- 选择 Device、Runtime 或 Agent 目标并创建分配 Operation 或提交分配审核。
- 选择目标后展示后端解析出的 Target Skill Set，包含 Skill 名称和待同步、同步中、已安装、同步失败或不支持等安装状态。
- 待处理审核必须能在 Skill 详情内批准或拒绝；处理后刷新相关 Operation、通知、分配和审批状态。
- 已批准、已同步、失败或不支持的 Assignment 必须能触发“同步到目标”，并在同步 Operation 排队后刷新相关状态。
- 可归档 Skill 必须能从详情页归档；归档后从组织 Skill 活跃列表移除，但历史版本和文件仍保留在后端。
- 未发布且未被引用的草稿 Skill 可以物理删除；已发布或被引用 Skill 只能归档，不能删除。
- 最新版本未发布时，分配按钮必须禁用并明确提示先发布。
- 目标 ID 可能包含 `:`、`/` 或其他分隔符，页面传参必须编码和解码，不能截断。
- 页面内通知展示状态摘要和跳转语义，不展示完整原始日志。

UI 不展示原始 token、完整脚本风险日志、外部平台私有 API 返回体或调试字段。
UI 不展示未实现入口。没有 API 与 harness 的 target support 原因入口不出现在页面中。

## Harness

包校验：

- Markdown 导入生成规范 `SKILL.md`。
- ZIP 导入拒绝目录穿越、绝对路径、逃逸 symlink、超限文件、缺失唯一 `SKILL.md` 和无效 frontmatter。
- ZIP 中中文目录名、空格目录名和自定义目录名不会被拒绝。
- Markdown 或脚本内容包含 `../` 字符串不会被路径校验误杀。
- GitHub URL 导入锁定 commit SHA 和 package hash。
- Marketplace 导入仍经过统一包校验。
- 手动编辑保存会以 `manual_edit` 来源创建新的草稿版本，并重新走 Markdown 包校验。
- 脚本、依赖文件、license 缺失、compatibility 缺失产生 warning。

权限与审核：

- member 无 `skill.view` 时不能看到 Skill 列表项、详情和版本文件。
- member 有 `skill.view` 但无 `skill.publish` 时发布会创建审核。
- 发布审核通过后创建发布 Operation；Operation 成功后，对应 Skill Version 被标记为已发布，Skill 进入 `published`。
- 有 `skill.view` 且对目标有 `manage_skills` 时，分配请求创建 Operation，Operation 成功后创建 approved Assignment。
- 缺少目标 `manage_skills` 时，分配请求创建审核，不创建半激活 Assignment。
- 审核拒绝不会留下 active Assignment。
- 组织 owner / admin 或资源 `manage_access` 持有人可以授予资源级权限。
- Skill 发布、分配和下发 Operation 会记录可查询状态，并在完成、失败或不支持时产生通知事件。
- `skill_sync` Operation 会创建 `Skill Sync Job`，保留 operation/job/command 关联，并把终态镜像到对应 Assignment。
- Device control channel 能把 `skill.sync` 命令下发到在线设备，并能等待 command 进入成功、失败、超时或不支持等终态。
- Collector 能把 `skill.sync` 文件 payload 写入配置的目标 Skill root 或默认 Skill sync root，拒绝目录逃逸、文件大小不匹配和 hash 不匹配。
- Collector 能从配置的 Skill discovery 目标目录发现包含 `SKILL.md` 的包，并随 Runtime inventory 上报。
- 发现结果提升为组织 Skill 会复制文件内容并重新校验；来源目标后续删除不会影响组织 Skill。

Adapter contract：

- OpenClaw adapter 能发现、写入并校验 Skill。
- Multica adapter 使用平台 Skill / agent 关联模型，不由 UI 拼接本地路径。
- Slock adapter 通过底层 runtime adapter 管理 Skill；无法识别底层 runtime 时返回不支持下发。
- Adapter 返回不支持时，UI 显示不支持下发，不提供“让 Agent 自己安装”的操作。

UI：

- 无组织上下文时不请求 Skill API，并提示先选择组织。
- Skill Registry 覆盖导入、查看详情、查看版本文件、发布 / 发布审核、分配 / 分配审核、Operation 状态和通知展示。
- Skill Registry 覆盖设备发现 Skill 列表和提升为组织 Skill；提升调用正式 `POST /api/skill-discoveries/:discoveryId/promote`，不在前端拼接 Skill 内容。
- Markdown 导入调用正式 Skill API，不绕过后端校验。
- ZIP 导入把文件名和 base64 内容提交到正式 Skill API，不伪装成 Markdown。
- GitHub URL 和 Marketplace URL 导入进入同一 `POST /api/skills/import` 路径。
- 单文件 `SKILL.md` 的 Skill 源文编辑器能在源文和预览之间切换，保存后调用 `POST /api/skills/:skillId/versions`，显示草稿保存状态，并刷新最新版本和文件内容。
- 归档 Skill 调用 `POST /api/skills/:skillId/archive`，成功后从活跃组织 Skill 列表移除，并显示归档状态。
- 删除草稿调用 `DELETE /api/skills/:skillId`，只允许后端确认未发布且未被引用的草稿；阻断错误不得在前端绕过。
- 发布、分配和审批动作返回 Operation 或 Approval 后，页面刷新相关 Operation、通知、分配和审批状态。
- 已批准 Assignment 的“同步到目标”按钮调用 `POST /api/skill-assignments/:assignmentId/sync`，返回 Operation 后显示排队状态并刷新相关数据。
- 选择目标后调用 `GET /api/skill-targets/:targetType/:targetId/skill-set`，页面只展示后端解析出的 Target Skill Set，不把组织 Skill 库里的未分配 Skill 当作目标已生效 Skill。
- 最新版本未发布时不能创建分配。
- 包含 `:` 的 target ID 在选择和提交分配时不丢失。
- 风险提示和审核状态可见。
- 页面导航通过 `/skills` 进入，并纳入 Console 路由 harness。
- `check:e2e:auth` 必须通过真实邮箱验证码登录、创建组织、进入 `/skills`、导入 Markdown Skill，并创建发布 Operation；该浏览器 harness 不允许绕过正式 Skill API 或组织上下文。

## 验收标准

- 组织 Skill 有独立内容副本，来源设备删除不影响组织版本。
- 设备发现 Skill 是目标状态快照；提升后才成为组织 Skill。
- Markdown、ZIP、GitHub URL 和 Marketplace 导入都进入同一校验链路。
- 高风险或权限不足的发布 / 分配 / 下发会进入审核。
- 下发只通过确定性 adapter / collector / CLI / 文件同步完成。
- 不支持下发的目标不会出现“让 Agent 自己安装”的入口。
- OpenClaw、Multica、Slock 的平台差异在 adapter 层处理，UI 只消费 Lorume Skill 模型。
- 页面只呈现当前 API 和 harness 证明过的动作，不保留临时 mock、调试字段或超前按钮。
