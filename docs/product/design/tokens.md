# Design Tokens

Lorume 的视觉实现必须通过 token 和共享 UI primitive 进入页面。业务组件不直接散落一次性色值、字体、阴影、边框和间距。

## Source

代码 token 入口：

- [../../../src/ui/tokens.css](../../../src/ui/tokens.css)

共享 UI primitive：

- [../../../src/ui/PixelButton.tsx](../../../src/ui/PixelButton.tsx)
- [../../../src/ui/PixelField.tsx](../../../src/ui/PixelField.tsx)
- [../../../src/ui/PixelPanel.tsx](../../../src/ui/PixelPanel.tsx)
- [../../../src/ui/PixelBadge.tsx](../../../src/ui/PixelBadge.tsx)
- [../../../src/ui/PixelIcon.tsx](../../../src/ui/PixelIcon.tsx)
- [../../../src/ui/PixelLogo.tsx](../../../src/ui/PixelLogo.tsx)
- [../../../src/ui/PixelDecorations.tsx](../../../src/ui/PixelDecorations.tsx)

## Token Layers

Token 分三层：

1. Primitive token: 原始颜色、字体、间距、边框、阴影。
2. Semantic token: page、surface、text、border、focus、success、warning、danger 等语义。
3. Component token: button、field、badge、panel、card、nav、board 等组件变量。

业务页面优先使用 semantic 或 component token。

## Required Token Groups

- Font: `--font-pixel`, `--font-sans`, `--font-mono`。
- Color: background、surface、text、muted、primary、accent、success、warning、danger、info。
- Border: width、color、focus ring、disabled border。
- Radius: 像素风组件默认使用小半径或切角，不使用大圆角 SaaS 卡片。
- Shadow: pixel shadow、soft shadow、focus shadow。
- Spacing: 4px 基础尺度。
- Motion: duration、easing、reduced-motion fallback。
- Z-index: header、popover、modal、toast。

## Change Rules

- 如果同一视觉值出现三次并表达同一意图，应上升为 token 或组件 variant。
- 如果只是单页特殊构图，不应提前抽象。
- 新 token 名称描述用途，不描述当前颜色。例如用 `--color-action-primary`，不用 `--yellow-button`。
- 修改 token 后必须检查 Brand、Identity、Console 三类页面是否被意外影响。

## Forbidden

- 在组件里直接使用未命名的 `#fff`、`#000`、随机 rgba 或一次性 box-shadow。
- 页面级 CSS 私自覆盖共享组件核心边框、字体和状态。
- 为单个平台或单条数据新增视觉 token。
