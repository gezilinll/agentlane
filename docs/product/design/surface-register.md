# Surface Register

Surface Register 定义页面类型、视觉强度和体验边界。新增页面必须先归类，再落视觉和交互。

## Surface Types

| Surface | Pages | Role | Visual Intensity |
|---|---|---|---|
| Brand Surface | `/` | 解释 Lorume 的价值和方向 | 最高 |
| Identity Surface | `/login`, `/invite/:token` | 登录、组织加入、身份恢复 | 高 |
| Console Surface | `/runtime`, `/skills`, `/runs`, `/operations`, `/notifications`, `/settings` | 日常管理、查看、筛选、排查 | 中 |

## Brand Surface

Brand Surface 可以使用更强的像素字体、装饰物、非对称构图、模拟窗口和游戏化符号。它必须快速说明：

- Lorume 管理什么。
- 当前已经能做什么。
- 用户下一步应该进入登录还是看 Console。

Brand Surface 不展示不可用模块作为 CTA，不用大段概念解释替代产品画面。

## Identity Surface

Identity Surface 使用 Brand Surface 的同一套 Cream Arcade 语言，但更聚焦单一任务：

- 输入邮箱。
- 发送验证码。
- 输入验证码。
- 创建组织或加入邀请组织。

Identity Surface 可以保留背景装饰和运营概览，但错误、成功、loading、过期邀请等状态必须清晰。

## Console Surface

Console Surface 以操作效率为核心：

- 导航稳定，不把未实现页面放入主导航。
- 筛选区紧凑，字段宽度服务内容。
- 列表、看板、详情面板优先保证可读性。
- 像素风通过边框、阴影、badge、短标签、icon 和局部标题体现。

Console Surface 的长正文、任务标题、表格内容、详情说明不使用大面积像素字体。

## Cross-Surface Rules

- 所有 surface 共用 token、logo、icon 语法和状态色。
- 页面之间可以调整装饰密度，但不能产生两套品牌。
- 如果同一组件在不同 surface 的视觉强度不同，差异应通过 variant 或 token 表达，不在业务页面硬编码。
