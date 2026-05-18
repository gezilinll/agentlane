# Design Tokens

Lorume visual implementation must flow through tokens and shared UI primitives. Product components should not scatter one-off colors, shadows, borders, fonts, or spacing.

## Source

Code token entry:

- [../../../src/ui/tokens.css](../../../src/ui/tokens.css)

Shared UI primitives keep their current `Pixel*` filenames for compatibility during this redesign:

- [../../../src/ui/PixelButton.tsx](../../../src/ui/PixelButton.tsx)
- [../../../src/ui/PixelField.tsx](../../../src/ui/PixelField.tsx)
- [../../../src/ui/PixelPanel.tsx](../../../src/ui/PixelPanel.tsx)
- [../../../src/ui/PixelBadge.tsx](../../../src/ui/PixelBadge.tsx)
- [../../../src/ui/PixelIcon.tsx](../../../src/ui/PixelIcon.tsx)
- [../../../src/ui/PixelLogo.tsx](../../../src/ui/PixelLogo.tsx)
- [../../../src/ui/PixelDecorations.tsx](../../../src/ui/PixelDecorations.tsx)

The implementation names are legacy; the rendered system is Glacier Premium Precision, not pixel art.

## Token Layers

1. Primitive token: raw palette, font stacks, radii, spacing, shadow.
2. Semantic token: page, rail, surface, text, line, action, focus, success, warning, danger.
3. Component token: button, field, badge, panel, nav, board, drawer, inspector.

Business pages should use semantic or component tokens.

## Required Token Groups

- Font: `--font-sans`, `--font-mono`, `--lorume-font-body`, `--lorume-font-mono`.
- Color: background, rail, surface, text, muted, line, action, accent, success, warning, danger, info.
- Border: hairline, focus ring, disabled border.
- Radius: small, medium, large, and full-pill.
- Shadow: subtle surface shadow, soft elevated shadow, floating drawer shadow, focus shadow.
- Spacing: 4px base scale.
- Motion: duration, easing, reduced-motion fallback.
- Z-index: header, utility bar, drawer, popover, modal, toast.

## Change Rules

- If the same visual value appears three times for the same intent, promote it to token or component variant.
- If a layout is truly page-specific, keep it page-scoped but still use tokens for visual values.
- Token names describe intent, not current color. Use `--lorume-color-action`, not `--blue-button`.
- Token changes must be checked against Brand, Identity, and Console surfaces.

## Forbidden

- Untokenized `#fff`, `#000`, random rgba, or one-off box-shadow in product CSS.
- Business page CSS overriding shared component core states.
- Visual tokens for a single runtime source, platform, or data row.
