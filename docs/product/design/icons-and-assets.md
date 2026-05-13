# Icons And Assets

Agentlane 的 icon、logo 和装饰资产必须使用统一像素语言。视觉一致性优先于快速拼凑。

## Brand Mark

品牌标记以共享代码和 favicon 为准：

- [../../../src/ui/PixelLogo.tsx](../../../src/ui/PixelLogo.tsx)
- [../../../public/favicon.svg](../../../public/favicon.svg)

Logo 必须表达 brain / circuit / control plane 的方向。页面 logo 和浏览器 tab icon 应保持同源，不出现两个互不相干的标记。

## Icon System

- 产品 icon 通过 [../../../src/ui/PixelIcon.tsx](../../../src/ui/PixelIcon.tsx) 进入页面。
- 同一页面不混用普通线性图标、文本符号、临时 SVG 和不同线宽图标。
- 新 icon 需要先进入共享 icon primitive，再被业务页面使用。
- Icon 的视觉大小、描边、像素网格和颜色应与当前 Cream Arcade 语言一致。

## Asset Sources

可以使用外部像素 icon 库、SVG、PNG 或自绘 SVG，但进入项目后必须满足：

- 视觉风格和现有 icon 一致。
- 文件命名语义化。
- 授权信息可追溯。
- 能被 token 控制颜色或至少能稳定适配主题。

如果视觉质量和授权条件冲突，先用视觉质量验证方向，再在落正式资产前补齐授权判断。

## Decorations

背景装饰包括像素点、小十字、低密度图案、角色化小图形和提示条 icon。

规则：

- 装饰不承载业务含义。
- 装饰不遮挡文字和控件。
- 装饰不制造滚动或响应式问题。
- 首页和登录页装饰密度可以不同，避免视觉疲劳。
- Console 页面只保留低干扰装饰。

## Images

产品页需要展示真实产品能力时，优先使用真实界面或可信模拟界面，不用抽象插画替代核心信息。
