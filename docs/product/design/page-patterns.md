# Page Patterns

页面规范定义当前已存在页面的视觉、内容和交互边界。新增页面需要先补充本文件。

## Home

Purpose: 说明 Lorume 是 Agent Network 控制平面，并展示已经可用的 Runtime Fleet、Skill 管理、Runs、组织设置和任务/通知工具抽屉等能力。

Rules:

- Hero 标题可以使用 Pixel 字体，但正文使用 Sans。
- 第一屏必须同时看到价值主张和产品界面信号。
- 背景装饰比登录页更克制，避免和身份页完全重复。
- CTA 只指向已实现路径。
- 产品 mock 需要表达真实能力，不展示未来未实现导航。

## Login

Purpose: 邮箱验证码登录。

Rules:

- 页面聚焦登录，不展示组织 Not Found 这类后续状态。
- 发送验证码按钮有清晰图标、loading 和错误状态。
- 登录卡片可以更强像素化，但表单正文和按钮中文使用 Sans。
- 背景可保留像素装饰和运营概览，但不能喧宾夺主。

## Invite

Purpose: 通过邀请链接加入组织。

Rules:

- 先说明被邀请加入哪个组织。
- 用户需要用被邀请邮箱登录。
- 链接过期、邮箱不匹配、已加入、成功加入都需要明确状态。
- 不把 token 原文显示给用户。

## Skill 管理

Purpose: 管理组织 Skill 资产、设备发现 Skill、目标 Skill Set、审批、同步任务和通知。

Rules:

- 组织 Skill、设备发现、目标 Skill Set、审批、Operation、Notification 必须分区清晰。
- Runtime Fleet 的 Agent 详情只提供 `查看 Skill` 和 `刷新 Skill 清单`，不提供绕过 Skill 管理的分配快捷入口。
- Skill 管理从 URL `targetType` / `targetId` 预选目标时，必须等待 Runtime Fleet 目标数据存在后再选中。
- 编辑、发布、分配和同步入口必须对应已实现 API、权限和 harness。
- 不展示没有后端链路的“分配组织 Skill”或临时 mock 入口。

## Object Catalog

Purpose: 查看正式对象、owner、生命周期和依赖关系。

Rules:

- Object Catalog 当前不在主导航中；重新进入实现前必须重新补齐页面 spec、数据链路、权限和 harness。
- Catalog 是 Console Surface，信息密度优先。
- 筛选、列表、详情应对齐并响应式适配。
- 对象类型、生命周期、owner 状态使用统一 badge。
- 未实现的创建、编辑动作不进入可点击入口。

## Runtime Fleet

Purpose: 查看 Device、Runtime、Agent、最近同步、可用性和运行状态。

Rules:

- Runtime 与 Channel 不混用。
- Runtime Fleet 不提供 Channel 筛选。
- Runtime 可用性和运行状态使用 Lorume 统一语义。
- 详情面板展示用户可理解的身份、归属、同步和采集信息。
- 异常和未知状态需要能在 ingestion 或日志中追溯。

## Runs / Work Board

Purpose: 查看 Agent 承接的工作项、发起人、Channel、会话/群组、消息摘要和当前阶段。

Rules:

- 看板只展示真实工作项，不展示监听状态、裸 execution 或调试卡片。
- 甬道表达阶段，卡片不重复展示甬道标题。
- Runtime 筛选和 Channel 筛选分离。
- Channel 列表从真实数据动态生成。
- 时间范围筛选支持全部、快捷范围、自定义起止和清除。
- 卡片标题、摘要、详情标题必须处理长文本。
- Raw id、cid、phone、opaque conversation id 不直接作为会话名。
- 宽屏下详情面板应保持在可视区域内；用户滚动看板列表时，已选工作项详情不能消失到视野外。

## Operations Utility Drawer

Purpose: 查看异步 Operation / Job 的用户可见状态、资源、目标、错误和最近更新时间。

Rules:

- 抽屉从 Console 右上角打开，`/operations` 是深链，不进入主导航。
- 右上角入口属于 Console chrome，必须预留布局空间或在窄屏重新定位，不能遮挡页面主按钮、筛选器或详情面板。
- 抽屉按组织读取数据；无组织时不请求 API。
- 列表展示状态、类型、目标和最近更新时间，详情展示 Job 级别的状态。
- 关闭抽屉时回到打开前的 Console 页面。
- 不展示后端原始 payload、token、设备密钥或调试字段。

## Notifications Utility Drawer

Purpose: 查看同步、采集、审核和恢复类通知线程。

Rules:

- 抽屉从 Console 右上角打开，`/notifications` 是深链，不进入主导航。
- 右上角入口属于 Console chrome，必须预留布局空间或在窄屏重新定位，不能遮挡页面主按钮、筛选器或详情面板。
- 抽屉按组织读取数据；无组织时不请求 API。
- 列表展示 severity、状态、标题和更新时间，详情展示摘要、资源、动作和投递状态。
- 通知列表区分未读和已读；选择未读 Thread 后应标记为已读。
- 通知抽屉是排查入口，不替代 Operation 详情或后端日志。

## Organization Settings

Purpose: 查看当前组织、成员身份，并创建邀请链接。

Rules:

- 无组织时提示创建或通过邀请加入组织。
- owner/admin 可以创建邀请链接；其他角色只查看自己的组织身份。
- 邀请链接只展示给当前操作者，不写入日志或测试截图。
