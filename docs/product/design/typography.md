# Typography

Agentlane 使用三层字体系统：Pixel 建立品牌，Sans 保证中文阅读，Mono 表达技术和数据。

## Font Roles

| Role | Font | Use |
|---|---|---|
| Pixel | `--font-pixel` | Logo、Hero 大标题、短装饰标签、少量窗口标题 |
| Sans | `--font-sans` | 中文正文、按钮中文、表单、说明、任务内容 |
| Mono | `--font-mono` | Runtime 名称、英文标签、数字、命令、ID、时间戳 |

## Pixel Font Rules

Pixel 字体用于点睛和品牌识别：

- Logo。
- 首页 hero 大标题。
- 登录页主标题。
- 模拟控制台标题。
- 极短标签和装饰文字。

Pixel 字体不得用于：

- 长段中文正文。
- 工作项消息内容。
- 表格正文。
- 错误说明。
- 密集筛选控件。

## Sans Font Rules

Sans 是产品阅读主字体：

- 中文正文。
- CTA 中文按钮。
- 任务标题和摘要。
- 表单标签和 placeholder。
- 详情面板说明。

按钮中文使用 Sans Medium 或 Semibold。复古感由边框、阴影、颜色和布局承担，不强行靠像素字体。

## Mono Font Rules

Mono 用于让技术值稳定对齐：

- Runtime、Agent、Channel 英文值。
- 数字指标。
- 命令片段。
- token prefix、device id、短 hash。
- 时间戳。

Mono 不用于长中文句子。

## Hierarchy

- 每页只允许一个最高层级标题。
- Hero 标题可以很大，但不能压缩正文和 CTA 到不可见。
- Console 页面标题小于 Brand 页面标题。
- 卡片标题必须和卡片宽度匹配，长文本使用截断或多行 clamp，不制造横向滚动。

## Implementation Mapping

当前代码中的字体职责必须保持一致：

- Brand / Identity 的 Logo、Hero 标题、登录标题、模拟窗口标题可以使用 `--font-pixel`。
- Console 的页面标题可以使用 `--font-pixel`，但导航、筛选、按钮、表格、看板卡片和详情正文不得大面积使用 Pixel。
- `PixelButton`、`.primaryButton`、`.secondaryButton`、`.quickRangeButton`、`.toolbarField select`、`.workCard strong`、`.detailHeader h2`、`.detailBlock p` 和 `.detailBlock li` 使用 `--font-sans`。
- `.navItem`、`.metricCard strong`、`.tableSummary`、`.tableHeader`、`.assetHeader`、`.badge`、`.lifecycleBadge`、`.refPill` 和 `.statusBadge` 使用 `--font-mono`。
- `src/ui/ui-tokens.test.tsx` 会锁定这些核心映射；调整字体策略时必须同步更新本规范和 harness。

## Line Length

- 正文理想行长 45 到 75 个英文字符等价宽度。
- 详情面板和卡片中的中文段落不超过 3 到 5 行，超过时使用摘要或折叠。
- 表格和看板中的标题优先展示有效摘要，而不是完整原始消息。
