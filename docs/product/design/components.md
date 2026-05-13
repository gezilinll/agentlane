# Components

组件规则覆盖当前已经出现的 UI primitive 和页面组件。新增组件应先确认能否复用现有 primitive。

## Shared Primitives

- `PixelButton`: 主按钮、次按钮、危险按钮、图标按钮。
- `PixelField`: 输入框、邮箱、验证码、带 icon 的输入。
- `PixelPanel`: 表单面板、信息面板、模拟窗口。
- `PixelBadge`: 状态、来源、渠道、阶段。
- `PixelIcon`: 产品 icon 入口。
- `PixelLogo`: 品牌标记。
- `PixelDecorations`: 背景像素装饰。

## Buttons

- 中文按钮使用 Sans 字体。
- 主按钮使用明确动作，例如 `发送验证码`、`开始使用`、`查看看板`。
- 不使用 `提交`、`确认` 这类缺少对象的标签，除非上下文已经唯一。
- Disabled、loading、focus-visible、hover、active 状态必须存在。

## Fields

- 表单字段必须有可见 label。
- Placeholder 只提供示例，不替代 label。
- 错误信息写明问题和下一步。
- 验证码输入需要支持粘贴。

## Badges

- Badge 文案必须短。
- 状态 badge 用语义色，来源/runtime/channel badge 用中性或信息色。
- 同一卡片内 badge 不超过必要数量。

## Work Cards

- 卡片必须能回答：是什么任务、谁发起、哪个 Agent 承接、来自哪个 Runtime/Channel、当前处于什么阶段。
- 卡片不显示甬道标题，因为甬道和详情概览已经表达阶段。
- 标题和摘要必须截断或 clamp，不能撑出横向滚动。
- 没有用户意义的调试数据不进入卡片。

## Detail Panels

- 详情面板标题需要最大宽度和换行策略。
- 概览、任务上下文、最近状态、消息摘要应按用户理解顺序排列。
- 不重复展示已经在同一区域明确表达的信息。

## Empty And Error States

- 空状态说明当前筛选下没有结果，不暗示系统故障。
- 错误状态说明失败原因和可执行下一步。
- Loading 使用骨架或轻量状态，不用整页 spinner 阻断阅读。
