# Page Patterns

页面规范定义当前已存在页面的视觉、内容和交互边界。新增页面需要先补充本文件。

## Home

Purpose: 说明 Agentlane 是 Agent Network 控制平面，并展示已经可用的 Runtime Fleet、Runs、Catalog 等能力。

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

## Catalog

Purpose: 查看正式对象、owner、生命周期和依赖关系。

Rules:

- Catalog 是 Console Surface，信息密度优先。
- 筛选、列表、详情应对齐并响应式适配。
- 对象类型、生命周期、owner 状态使用统一 badge。
- 未实现的创建、编辑动作不进入可点击入口。

## Runtime Fleet

Purpose: 查看 Device、Runtime、Agent、最近同步、可用性和运行状态。

Rules:

- Runtime 与 Channel 不混用。
- Runtime Fleet 不提供 Channel 筛选。
- Runtime 可用性和运行状态使用 Agentlane 统一语义。
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
