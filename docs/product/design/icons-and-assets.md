# Icons And Assets

Lorume icons, logo, and decorative assets must use a unified modern visual weight. Consistency is more important than quick one-off SVGs.

## Brand Mark

The brand mark source of truth:

- [../../../src/ui/PixelLogo.tsx](../../../src/ui/PixelLogo.tsx)
- [../../../public/favicon.svg](../../../public/favicon.svg)

`PixelLogo` is a legacy implementation name. The rendered mark should be a compact, modern Lorume mark and the browser tab icon should stay visually aligned with it.

## Icon System

- Product icons enter pages through [../../../src/ui/PixelIcon.tsx](../../../src/ui/PixelIcon.tsx).
- Do not mix icon libraries, text symbols, ad hoc SVGs, and different stroke weights on one page.
- New icons first enter the shared icon primitive.
- Icons should feel simple, modern, and operational; they should not rely on retro pixel-grid styling.

## Asset Sources

SVG, PNG, generated bitmap assets, or external icon sources can be used only when:

- The visual style matches the current system.
- File names are semantic.
- Licensing is traceable.
- Colors can be token-controlled or reliably theme-compatible.

## Decorations

Decorations are optional and quiet:

- Low-noise grid backgrounds.
- Hairline traces.
- Subtle product-preview structure.

Rules:

- Decoration carries no business meaning.
- Decoration cannot overlap text or controls.
- Decoration cannot create scroll or responsive problems.
- Console pages should use minimal decoration.

## Images

When a page needs to prove product capability, use real UI or credible UI simulation. Do not use abstract illustration where the user needs to understand the product.
