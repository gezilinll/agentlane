# Color

Lorume uses a cool, low-noise palette. Color serves hierarchy, state, and product memory; it must not decorate every component.

## Active Palette

| Role | Token | Value |
|---|---|---|
| Page background | `--lorume-color-bg` | `#f7f9fb` |
| Rail background | `--lorume-color-bg-rail` | `#eef3f7` |
| Surface | `--lorume-color-surface` | `rgba(255, 255, 255, 0.88)` |
| Soft surface | `--lorume-color-surface-soft` | `#f4f7fa` |
| Blue surface | `--lorume-color-surface-blue` | `#f2f7ff` |
| Ink | `--lorume-color-ink` | `#111827` |
| Muted text | `--lorume-color-muted` | `#667587` |
| Faint text | `--lorume-color-faint` | `#94a3b5` |
| Hairline | `--lorume-color-line` | `#dce5ee` |
| Strong line | `--lorume-color-line-strong` | `#b8c5d3` |
| Primary action | `--lorume-color-action` | `#245bff` |
| Primary action bright | `--lorume-color-action-bright` | `#3d73ff` |
| Primary action dark | `--lorume-color-action-dark` | `#163fc2` |
| Operational signal | `--lorume-color-accent` | `#12a7a2` |
| Success | `--lorume-color-success` | `#1f9d68` |
| Warning | `--lorume-color-warning` | `#b7791f` |
| Danger | `--lorume-color-danger` | `#d64b55` |
| Info | `--lorume-color-info` | `#2d7ff0` |

## Usage Ratio

- 70% cool background and white surfaces.
- 20% text, lines, and structural chrome.
- 10% action, signal, and semantic state color.

If a screen feels busy, reduce accent usage before reducing useful data.

## Semantic Rules

- Action blue means primary action or active navigation.
- Teal means operational signal, sync, routing, or online context.
- Green means healthy or completed.
- Amber means attention, manual step, stale state, or pending user review.
- Red means failed, blocked, critical, or destructive.
- Source/runtime/channel badges should be neutral or info-toned unless they are expressing status.

## Contrast

- Body text, form values, and buttons must remain readable on all surfaces.
- Low-contrast grid texture and traces cannot overlap text in a way that reduces legibility.
- Badge meaning must be expressed by text and color together.

## Forbidden

- High-saturation yellow sidebars.
- Thick black borders as a primary visual language.
- Single-hue blue SaaS pages.
- Random untokenized hex values in product CSS.
- Platform source colors mapped directly to product state colors.
