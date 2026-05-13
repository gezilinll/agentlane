# Motion

动效服务状态理解和品牌节奏，不做炫技。

## Motion Roles

- Brand Surface: 可使用轻量进入、像素漂浮、按钮反馈等品牌动效。
- Identity Surface: 可使用输入反馈、验证码发送反馈、邀请状态转换。
- Console Surface: 只使用帮助理解状态变化的动效。

## Timing

- 微交互：100 到 180ms。
- 常规状态变化：180 到 300ms。
- 页面级进入：300 到 500ms。

超过 500ms 的动效必须有明确价值。

## Easing

- UI 状态变化使用 ease-out 或接近的自然缓动。
- 避免弹性、夸张 bounce 和持续晃动。

## Performance

- 优先动画 opacity 和 transform。
- 不随意动画 width、height、top、left、margin 等布局属性。
- 动效不能导致列表、看板或详情面板重排抖动。

## Reduced Motion

尊重 `prefers-reduced-motion`。减少动效时仍要保留状态反馈。
