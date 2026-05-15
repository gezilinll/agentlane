# Responsive And Accessibility

Lorume 必须在桌面、窄屏和高密度数据场景下保持可读、可操作。

## Responsive Rules

- 断点由内容决定，不为设备型号硬编码。
- 首页和登录页在窄屏改为单列。
- Console 页面在窄屏优先保留导航、筛选、列表和详情的可访问路径。
- 看板可以横向滚动局部区域，但整页不应出现意外横向滚动。
- 详情面板在窄屏可以下移或全宽显示。

## Text Stress

必须检查：

- 长中文标题。
- 长 URL。
- 英文无空格字符串。
- 长 Runtime / Agent / Channel 名称。
- 大量工作项。
- 空数据和异常数据。

长文本需要 clamp、换行、摘要或 tooltip，不允许撑破容器。

## Accessibility

- 交互元素可键盘访问。
- Focus-visible 清晰。
- 表单 label 可见。
- 状态不只靠颜色表达。
- Icon-only 按钮需要可访问名称。
- 背景装饰不进入读屏语义。

## Contrast And Scale

- 正文对比度优先于装饰效果。
- Console 页面字号不能为了视觉风格过小。
- 点击目标在触屏场景下足够大。

## Edge States

每个页面至少考虑：

- Loading
- Empty
- Error
- Unauthorized
- Long content
- Stale data
- Network failure
