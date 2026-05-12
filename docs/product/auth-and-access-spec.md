# Auth And Access Spec

版本：TinySpec v0.1

本规格定义 Agentlane 第一版组织、登录、成员、邀请、会话和设备 token 的产品边界。它是当前权限实现的来源，不覆盖计费、SSO、复杂 RBAC 或审计报表。

## 目标

- 用户使用团队邮箱接收验证码登录，不设置密码。
- 登录后必须处在一个组织中，才能进入 Agentlane Console。
- 组织可以由登录用户创建，也可以通过邀请链接加入。
- 组织内成员有最小角色：owner、admin、member。
- Device Collector 使用设备 token 向 backend 上报数据；token 只保存哈希，不明文入库。
- Runtime Fleet、Runs、Catalog 等 Console 页面必须通过用户 session 访问。

## 非目标

- 不做个人账号密码登录。
- 不做 Google、GitHub、企业 SSO 或 LDAP。
- 不做计费、套餐、席位购买。
- 不做细粒度资源 ACL，例如单个 Runtime、单个 Agent、单条 Run 的授权。
- 不做跨组织共享数据。
- 不在前端、日志、fixture、文档或截图中保留验证码、session token、device token、邮件 API key。

## 对象模型

### User

User 是一个邮箱身份。邮箱是登录和邀请匹配的唯一稳定标识。

字段：

- `id`：内部 ID。
- `email`：登录邮箱，大小写不敏感存储和匹配。
- `displayName`：展示名，可为空。
- `createdAt` / `updatedAt`：创建和更新时间。

### Organization

Organization 是数据和成员权限边界。Runtime、Agent、Run、Device 后续都应归属到某个组织。

字段：

- `id`：内部 ID。
- `name`：组织名称。
- `slug`：可读唯一标识，用于 URL 或管理展示。
- `createdByUserId`：创建人。
- `createdAt` / `updatedAt`：创建和更新时间。

### Organization Member

Organization Member 表示用户在组织内的角色。

角色：

- `owner`：组织所有者，可管理成员、邀请和设备 token。
- `admin`：管理员，可邀请成员和管理设备 token。
- `member`：普通成员，可查看 Console 和工作数据。

当前阶段只做三档角色，不做更细权限矩阵。owner 和 admin 可执行管理动作；member 只能读取组织内 Console 数据。

### Email Login Code

Email Login Code 是一次性登录验证码。

规则：

- 验证码只发送到目标邮箱。
- 数据库存储验证码哈希、过期时间、消费时间和尝试次数。
- 验证成功后创建或复用 User。
- 验证码过期、已消费或尝试次数超限时必须拒绝。

### Session

Session 是浏览器登录态。

规则：

- session token 只通过 HTTP-only cookie 返回。
- 数据库存储 session token 哈希，不存明文。
- logout 后 session 立即失效。
- `/api/me` 返回当前用户和可访问组织列表。

### Organization Invitation

Invitation 是加入组织的链接凭证。

规则：

- owner / admin 可以邀请邮箱加入组织。
- 邀请链接包含一次性 token，数据库只存 token 哈希。
- 被邀请人点击链接后，如果未登录，先完成邮箱验证码登录。
- 登录邮箱必须和邀请邮箱一致，才能接受邀请。
- 接受后创建 Organization Member，邀请标记为已接受。

### Device Token

Device Token 是设备侧 Collector 上报和控制面的凭证。

规则：

- token 由 owner / admin 创建。
- token 明文只在创建时返回一次。
- 数据库存储 token 哈希和短 prefix，用于识别与排查。
- Collector 上报 inventory / work-state、设备 WebSocket 控制面和 refresh command 都使用 device token。
- 如果 backend 开启 device token 校验，缺失、过期或撤销的 token 必须被拒绝。

## API 边界

Auth API：

- `POST /api/auth/email-code`：发送邮箱验证码。
- `POST /api/auth/login`：校验验证码并创建 session。
- `POST /api/auth/logout`：撤销当前 session。
- `GET /api/me`：读取当前用户、组织和角色。

Organization API：

- `POST /api/organizations`：创建组织。
- `GET /api/organizations`：读取当前用户组织列表。
- `POST /api/organizations/:organizationId/invitations`：创建邀请。
- `POST /api/invitations/:token/accept`：接受邀请。

Device token API：

- `POST /api/organizations/:organizationId/device-tokens`：创建设备 token。
- `GET /api/organizations/:organizationId/device-tokens`：列出设备 token 摘要。
- `POST /api/device-snapshots`：Collector 上报 inventory，使用 device token。
- `POST /api/runtime-work-state-snapshots`：Collector 上报 work-state，使用 device token。
- `GET /api/device-control/ws`：设备控制面连接，使用 device token。

Runtime / Runs 读取 API：

- Console 读取类 API 必须有有效 session。
- v1 只按用户所属组织做最小隔离，不在 React 页面里推导权限。

## 邮件发送

邮箱验证码通过可替换的 Email Provider 发送。第一版使用 Sender / Resend 类 HTTP 邮件服务均可，但 API key 只允许通过环境变量注入。

实现要求：

- 本地测试使用 fake provider，不发真实邮件。
- 开发环境可以输出一次性调试码，但该能力必须由显式环境变量开启。
- 生产环境没有邮件 provider 配置时，发送验证码接口必须失败并给出可排查错误。

## UI 规则

- 登录、验证码、创建组织、邀请加入页面使用 Cream Arcade 视觉语言。
- Console 后续逐步统一到相同 token 系统。
- 品牌标题、按钮、状态短标签可使用 Fusion Pixel；正文、表单、说明文字使用 Noto Sans SC 或系统 sans-serif fallback。
- 像素风只作为视觉语言，不改变信息架构和权限边界。

## Harness

后端：

- crypto 测试必须证明验证码、session、invitation token 和 device token 只可通过哈希校验。
- store 测试必须覆盖 User -> Organization -> Member -> Invitation -> Session -> Device Token 的核心链路。
- HTTP API 测试必须覆盖发送验证码、登录、`/api/me`、创建组织、邀请、接受邀请和 logout。
- Runtime 读取 API 在开启 session 校验时必须拒绝匿名请求。
- Collector / control 在开启 device token 校验时必须拒绝无效 token。

前端：

- 登录页、验证码页、创建组织页和邀请加入页必须有组件测试。
- Console 必须被 `/api/me` gate 保护。
- Playwright Console harness 可以通过 `VITE_AGENTLANE_AUTH_MODE=disabled` 进入已验收页面，专注验证 Catalog、Runtime Fleet 和 Runs 的布局与交互；Auth 流程由独立组件 harness 覆盖。
- 已验收的 Runtime Fleet 和 Runs 交互不得因 auth 和视觉改造回退。

## 验收标准

- 未登录用户访问 Console 时进入登录流程。
- 使用邮箱验证码可以登录。
- 无组织用户登录后进入创建组织流程。
- 有待接受邀请的用户可以在登录后通过邀请链接加入组织。
- 登录用户可以查看 Console；logout 后不能继续访问 Console API。
- 设备 token 明文不入库，失效 token 无法上报。
- 所有新规则进入 spec、AGENTS 和 harness；没有过程性 mockup 或临时调研文件残留。
