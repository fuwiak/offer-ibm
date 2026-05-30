# IBM Carbon Design System — Light & Dark Theme Reference

## Overview

This design system is a faithful implementation of **IBM Carbon Design System** — IBM's open-source enterprise design system. It covers both the **White theme** (light) and the **Gray-100 theme** (dark), which are the two primary production themes used across ibm.com and IBM product surfaces.

The defining characteristic is **flat geometry**: every CTA, card, input, and container uses square corners (`{rounded.none}` 0px) with thin 1px borders. No rounded pills, no soft shadows, no atmospheric gradients. The system is engineered, not stylized.

**IBM Plex Sans** carries the entire type hierarchy at all sizes. Display sizes (76 / 60 / 42px) run at weight **300** — IBM's signature light display treatment. Body type sits at weight 400 with `letter-spacing: 0.16px` (a Carbon precision detail) and line-height 1.50.

IBM Blue (`#0f62fe`) is the single brand accent in the light theme. In the dark theme, Blue 40 (`#78a9ff`) replaces it as the interactive accent to meet contrast ratios on dark surfaces.

---

## Themes

### White Theme (Light)

The default marketing and product surface. Dominant surface is pure white with light gray for elevation, charcoal for text.

| Role | Token | Value |
|---|---|---|
| Page background | `{colors.canvas}` | `#ffffff` |
| Layer 01 | `{colors.surface-1}` | `#f4f4f4` |
| Layer 02 | `{colors.surface-2}` | `#e0e0e0` |
| Primary text | `{colors.ink}` | `#161616` |
| Secondary text | `{colors.ink-muted}` | `#525252` |
| Disabled text | `{colors.ink-subtle}` | `#8d8d8d` |
| Primary action | `{colors.primary}` | `#0f62fe` |
| Primary hover | `{colors.primary-hover}` | `#0353e9` |
| Primary active | `{colors.primary-active}` | `#002d9c` |
| On-primary text | `{colors.on-primary}` | `#ffffff` |
| Border subtle | `{colors.hairline}` | `#e0e0e0` |
| Border strong | `{colors.hairline-strong}` | `#8d8d8d` |
| Focus ring | `{colors.focus}` | `#0f62fe` |
| Inverse background | `{colors.inverse-canvas}` | `#161616` |
| Inverse text | `{colors.inverse-ink}` | `#ffffff` |
| Inverse text muted | `{colors.inverse-ink-muted}` | `#c6c6c6` |

### Gray-100 Theme (Dark)

The full dark theme used in product UIs, dark-mode pages, and the Carbon Gray-100 palette. Every color token maps to a dark-surface equivalent. **Do not simply invert the light palette** — Carbon's dark tokens are independently calibrated for contrast.

| Role | Token | Value |
|---|---|---|
| Page background | `{colors.dark-canvas}` | `#161616` |
| Layer 01 | `{colors.dark-surface-1}` | `#262626` |
| Layer 02 | `{colors.dark-surface-2}` | `#393939` |
| Layer 03 | `{colors.dark-surface-3}` | `#525252` |
| Primary text | `{colors.dark-ink}` | `#f4f4f4` |
| Secondary text | `{colors.dark-ink-muted}` | `#c6c6c6` |
| Disabled text | `{colors.dark-ink-subtle}` | `#6f6f6f` |
| Primary action | `{colors.dark-primary}` | `#78a9ff` |
| Primary hover | `{colors.dark-primary-hover}` | `#a6c8ff` |
| Primary active | `{colors.dark-primary-active}` | `#4589ff` |
| On-primary text | `{colors.dark-on-primary}` | `#ffffff` |
| Border subtle | `{colors.dark-hairline}` | `#393939` |
| Border strong | `{colors.dark-hairline-strong}` | `#6f6f6f` |
| Focus ring | `{colors.dark-focus}` | `#ffffff` |
| Inverse background | `{colors.dark-inverse-canvas}` | `#f4f4f4` |
| Inverse text | `{colors.dark-inverse-ink}` | `#161616` |

---

## Colors

### Brand & Accent

| Light (White) | Dark (Gray-100) | Use |
|---|---|---|
| `{colors.primary}` `#0f62fe` | `{colors.dark-primary}` `#78a9ff` | Primary CTAs, links, focus rings |
| `{colors.primary-hover}` `#0353e9` | `{colors.dark-primary-hover}` `#a6c8ff` | Hovered primary button, hovered link |
| `{colors.primary-active}` `#002d9c` | `{colors.dark-primary-active}` `#4589ff` | Pressed primary button |

### Surface

| Light | Dark | Use |
|---|---|---|
| `{colors.canvas}` `#ffffff` | `{colors.dark-canvas}` `#161616` | Default page background |
| `{colors.surface-1}` `#f4f4f4` | `{colors.dark-surface-1}` `#262626` | Layer 01 — inputs, alternate section bands |
| `{colors.surface-2}` `#e0e0e0` | `{colors.dark-surface-2}` `#393939` | Layer 02 — disabled fields, separator fills |
| `{colors.hairline}` `#e0e0e0` | `{colors.dark-hairline}` `#393939` | 1px card borders, dividers |
| `{colors.hairline-strong}` `#8d8d8d` | `{colors.dark-hairline-strong}` `#6f6f6f` | Focused input underline |

### Text

| Light | Dark | Use |
|---|---|---|
| `{colors.ink}` `#161616` | `{colors.dark-ink}` `#f4f4f4` | Headlines, emphasized body |
| `{colors.ink-muted}` `#525252` | `{colors.dark-ink-muted}` `#c6c6c6` | Secondary type, meta, labels |
| `{colors.ink-subtle}` `#8d8d8d` | `{colors.dark-ink-subtle}` `#6f6f6f` | Disabled, helper text, captions |

### Semantic

| Token | Light Value | Dark Value | Use |
|---|---|---|---|
| `{colors.semantic-success}` | Carbon Green-40 `#42be65` | Carbon Green-40 `#42be65` | Success states |
| `{colors.semantic-warning}` | Carbon Yellow-30 `#f1c21b` | Carbon Yellow-30 `#f1c21b` | Warning states |
| `{colors.semantic-error}` | Carbon Red-50 `#fa4d56` | Carbon Red-40 `#ff8389` | Error states, danger buttons |
| `{colors.semantic-info}` | `#0f62fe` (= primary) | `#78a9ff` (= dark-primary) | Informational badges |

---

## Typography

### Font Family

**IBM Plex Sans** — IBM's open-source typeface (SIL OFL, available on Google Fonts). Geometric, slightly humanist, engineered for enterprise UI. Fallback: `Helvetica Neue, Arial, sans-serif`.

The same family carries display, body, and caption. Hierarchy is size + weight, never family change.

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `{typography.display-xl}` | 76px | 300 | 1.17 | -0.5px | Largest hero headline |
| `{typography.display-lg}` | 60px | 300 | 1.17 | -0.4px | Section opener headlines |
| `{typography.display-md}` | 42px | 300 | 1.20 | 0 | Sub-section headlines, hero card title |
| `{typography.headline}` | 32px | 400 | 1.25 | 0 | Card collection heading, FAQ category |
| `{typography.card-title}` | 24px | 400 | 1.33 | 0 | Feature card title |
| `{typography.subhead}` | 20px | 400 | 1.40 | 0 | Lead body next to display headlines |
| `{typography.body-lg}` | 18px | 400 | 1.50 | 0 | Hero subhead, lead paragraphs |
| `{typography.body}` | 16px | 400 | 1.50 | 0.16px | Default body |
| `{typography.body-sm}` | 14px | 400 | 1.29 | 0.16px | Card body, footer columns |
| `{typography.body-emphasis}` | 14px | 600 | 1.29 | 0.16px | Selected tab label, emphasized inline text |
| `{typography.caption}` | 12px | 400 | 1.33 | 0.32px | Captions, meta, utility bar |
| `{typography.button}` | 14px | 400 | 1.29 | 0.16px | All button labels |
| `{typography.eyebrow}` | 14px | 400 | 1.29 | 0.16px | Section eyebrows (sentence case, never all-caps) |

### Principles

- **Weight 300 for display is the brand voice.** Switching to 700 makes it look like every other enterprise site.
- **`letter-spacing: 0.16px` on body** is a Carbon precision detail — do not remove it.
- **No mono on marketing surfaces.** Plex Mono lives in product/code surfaces only.
- **Eyebrows are sentence case 14px** — Carbon resists all-caps tracked eyebrows.
- **Line-heights tighten on display, relax on body**: 1.17 at `display-xl`, 1.50 at `body`.
- **Dark theme: same type scale.** Only the color tokens change — `{colors.ink}` → `{colors.dark-ink}`.

---

## Layout

### Spacing System

Base unit: **4px** (Carbon's 4-pixel grid).

| Token | Value | Common Use |
|---|---|---|
| `{spacing.xxs}` | 4px | Icon gap, tight inline padding |
| `{spacing.xs}` | 8px | Button icon offset, tag padding |
| `{spacing.sm}` | 12px | Button vertical padding |
| `{spacing.md}` | 16px | Button horizontal padding, input padding |
| `{spacing.lg}` | 24px | Feature card interior padding |
| `{spacing.xl}` | 32px | Product card interior padding |
| `{spacing.xxl}` | 48px | Hero card, CTA banner padding |
| `{spacing.section}` | 96px | Vertical gap between page sections |

### Grid & Container

- Carbon's **16-column grid** at desktop → 8-column at tablet → 4-column at mobile.
- Max content width: **1584px** (Carbon's max-grid breakpoint).
- Card grids: 4-up at desktop → 2-up at tablet → 1-up at mobile.
- Customer logo marquee: fixed-width tiles in a flex row, horizontal scroll on small viewports.

### Whitespace Philosophy

Carbon aligns to a 4-pixel grid rather than using large vertical gaps. Sections separate via thin gray rows (`surface-1` / `dark-surface-1`) — content is dense by design.

---

## Elevation & Depth

| Level | Light Treatment | Dark Treatment | Use |
|---|---|---|---|
| 0 — flat | No shadow, no border | No shadow, no border | Body text, hero text |
| 1 — hairline | 1px `{colors.hairline}` border | 1px `{colors.dark-hairline}` border | Feature cards, inputs |
| 2 — surface lift | `{colors.surface-1}` on canvas | `{colors.dark-surface-1}` on canvas | Hovered cards, alternate bands |
| 3 — focus ring | 2px `{colors.focus}` outline | 2px `{colors.dark-focus}` outline | Focused inputs, focused buttons |

Carbon marketing resists drop shadows. Depth is carried by surface change and 1px hairlines. Product surfaces (elevated panels, modals) may use Carbon's documented shadow tokens.

### Decorative Depth

- **Light theme**: faint blue-to-white wash behind hero illustrations only. No gradient panels elsewhere.
- **Dark theme**: no decorative gradients. Layering (canvas → surface-1 → surface-2) carries all elevation.

---

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.none}` | 0px | **Default** — every button, card, input, container |
| `{rounded.xs}` | 2px | Small badges (rare) |
| `{rounded.sm}` | 4px | Dropdown menus |
| `{rounded.pill}` | 9999px | Status tags in product UI (rare on marketing) |

The brand commits to 0px corners. Rounding beyond 2px is a brand deviation.

---

## Components

### Buttons

Component behavior is identical across themes — only the token values change.

**`button-primary`**
| Property | Light | Dark |
|---|---|---|
| Background | `{colors.primary}` `#0f62fe` | `{colors.dark-primary}` `#78a9ff` |
| Text | `{colors.on-primary}` `#ffffff` | `{colors.dark-on-primary}` `#161616` |
| Hover bg | `{colors.primary-hover}` | `{colors.dark-primary-hover}` |
| Active bg | `{colors.primary-active}` | `{colors.dark-primary-active}` |
| Corners | `{rounded.none}` 0px | `{rounded.none}` 0px |
| Padding | 12px 16px | 12px 16px |

**`button-secondary`** — Charcoal solid (light) / Light on dark (dark).
| Property | Light | Dark |
|---|---|---|
| Background | `{colors.ink}` `#161616` | `{colors.dark-surface-2}` `#393939` |
| Text | `{colors.on-primary}` `#ffffff` | `{colors.dark-ink}` `#f4f4f4` |
| Hover bg | `#393939` | `{colors.dark-surface-3}` `#525252` |

**`button-tertiary`** — Outlined CTA.
| Property | Light | Dark |
|---|---|---|
| Background | `{colors.canvas}` | transparent |
| Text | `{colors.primary}` | `{colors.dark-primary}` |
| Border | 1px `{colors.primary}` | 1px `{colors.dark-primary}` |

**`button-ghost`** — Text + chevron, no background until hover.
| Property | Light | Dark |
|---|---|---|
| Text | `{colors.primary}` | `{colors.dark-primary}` |
| Hover bg | `{colors.surface-1}` | `{colors.dark-surface-1}` |

**`button-danger`** — Destructive action.
| Property | Light | Dark |
|---|---|---|
| Background | `{colors.semantic-error}` `#fa4d56` | `#ff8389` |
| Text | `#ffffff` | `#161616` |

### Cards & Containers

**`feature-card`**
| Property | Light | Dark |
|---|---|---|
| Background | `{colors.canvas}` | `{colors.dark-surface-1}` |
| Text | `{colors.ink}` | `{colors.dark-ink}` |
| Border | 1px `{colors.hairline}` | 1px `{colors.dark-hairline}` |
| Padding | 24px | 24px |
| Corners | 0px | 0px |

**`feature-card-elevated`** — Recommended / highlighted variant.
| Property | Light | Dark |
|---|---|---|
| Background | `{colors.surface-1}` | `{colors.dark-surface-2}` |

**`product-card`** — Larger product showcase tile.
| Property | Light | Dark |
|---|---|---|
| Background | `{colors.canvas}` | `{colors.dark-surface-1}` |
| Padding | 32px | 32px |

**`hero-card`** — Hero composition with light-weight headline and CTA.
| Property | Light | Dark |
|---|---|---|
| Background | `{colors.canvas}` | `{colors.dark-canvas}` |
| Title type | `{typography.display-md}` | `{typography.display-md}` |
| Padding | 48px | 48px |

**`cta-banner`** — Full-width accent panel.
| Property | Light | Dark |
|---|---|---|
| Background | `{colors.primary}` `#0f62fe` | `{colors.dark-surface-1}` `#262626` |
| Text | `#ffffff` | `{colors.dark-primary}` |
| Border (dark only) | — | 1px `{colors.dark-hairline}` |
| Padding | 48px | 48px |

**`resource-tile`** — Article / case-study tile.
| Property | Light | Dark |
|---|---|---|
| Background | `{colors.canvas}` | `{colors.dark-surface-1}` |
| Text | `{colors.ink}` | `{colors.dark-ink}` |
| Padding | 16px | 16px |

**`customer-logo-tile`**
| Property | Light | Dark |
|---|---|---|
| Background | `{colors.canvas}` | `{colors.dark-surface-1}` |
| Border | 1px `{colors.hairline}` | 1px `{colors.dark-hairline}` |
| Padding | 24px | 24px |

### Inputs & Forms

**`text-input`**
| State | Light | Dark |
|---|---|---|
| Default bg | `{colors.surface-1}` `#f4f4f4` | `{colors.dark-surface-1}` `#262626` |
| Default text | `{colors.ink}` | `{colors.dark-ink}` |
| Default border | 1px bottom `{colors.hairline}` | 1px bottom `{colors.dark-hairline}` |
| Focus border | 2px bottom `{colors.focus}` | 2px bottom `{colors.dark-focus}` |
| Error border | 2px bottom `{colors.semantic-error}` | 2px bottom dark error `#ff8389` |
| Label color | `{colors.ink-muted}` | `{colors.dark-ink-muted}` |
| Padding | 11px 16px | 11px 16px |
| Corners | 0px | 0px |

Carbon's signature focus treatment: the bottom border replaces with a 2px colored underline. No outline on all four sides.

### Tabs

**`product-tab`** / **`product-tab-selected`**
| State | Light | Dark |
|---|---|---|
| Default bg | `{colors.canvas}` | `{colors.dark-canvas}` |
| Default text | `{colors.ink-muted}` | `{colors.dark-ink-muted}` |
| Default bottom | 1px `{colors.hairline}` | 1px `{colors.dark-hairline}` |
| Selected text | `{colors.ink}` | `{colors.dark-ink}` |
| Selected weight | 600 | 600 |
| Selected bottom | 2px `{colors.primary}` | 2px `{colors.dark-primary}` |
| Padding | 16px 20px | 16px 20px |
| Corners | 0px | 0px |

### Navigation

**`top-nav`**
| Property | Light | Dark |
|---|---|---|
| Background | `{colors.canvas}` | `{colors.dark-canvas}` |
| Text | `{colors.ink}` | `{colors.dark-ink}` |
| Bottom border | 1px `{colors.hairline}` | 1px `{colors.dark-hairline}` |
| Type | `{typography.body-sm}` | `{typography.body-sm}` |
| Height | 48px | 48px |

**`utility-bar`**
| Property | Light | Dark |
|---|---|---|
| Background | `{colors.surface-1}` | `{colors.dark-surface-1}` |
| Text | `{colors.ink-muted}` | `{colors.dark-ink-muted}` |
| Type | `{typography.caption}` | `{typography.caption}` |
| Height | 32px | 32px |

### Footer

**`footer`** — Charcoal surface in both themes (the footer always inverts).
| Property | Light | Dark |
|---|---|---|
| Background | `{colors.inverse-canvas}` `#161616` | `#0d0d0d` (one step deeper) |
| Text | `{colors.inverse-ink-muted}` `#c6c6c6` | `#a8a8a8` |
| Type | `{typography.body-sm}` | `{typography.body-sm}` |
| Padding | 64px 32px | 64px 32px |

---

## Theme Switching

### CSS Custom Properties Pattern

Map all design tokens to CSS custom properties scoped to `[data-theme]` attributes:

```css
:root,
[data-theme="white"] {
  --color-canvas: #ffffff;
  --color-surface-1: #f4f4f4;
  --color-ink: #161616;
  --color-ink-muted: #525252;
  --color-primary: #0f62fe;
  --color-focus: #0f62fe;
  --color-hairline: #e0e0e0;
  /* ... all white theme tokens ... */
}

[data-theme="g100"] {
  --color-canvas: #161616;
  --color-surface-1: #262626;
  --color-ink: #f4f4f4;
  --color-ink-muted: #c6c6c6;
  --color-primary: #78a9ff;
  --color-focus: #ffffff;
  --color-hairline: #393939;
  /* ... all gray-100 theme tokens ... */
}
```

Apply to the root element: `<html data-theme="white">` or `<html data-theme="g100">`.

### System Preference

Respect `prefers-color-scheme` as the default, overridable by explicit user selection:

```css
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    /* apply g100 tokens */
  }
}
```

### Rules for Theme Switching

- Never hardcode hex values in component styles — always reference `var(--color-*)` tokens.
- The footer background is **always charcoal** — do not switch it with the page theme.
- In the dark theme, `button-primary` text changes from white to charcoal (`#161616`) because the dark-primary accent `#78a9ff` is light enough to require dark text.
- Focus rings switch from blue (`#0f62fe`) to white (`#ffffff`) in the dark theme — both meet 3:1 contrast against their respective surfaces.
- Never infer the dark theme by applying `filter: invert()` or similar CSS tricks — the Carbon dark palette is independently authored.

---

## Do's and Don'ts

### Do

- Use `{rounded.none}` 0px on every CTA, card, input, and container. Flat square is the brand.
- Use Plex Sans weight 300 for display sizes (42px+). Resist the urge to bold headlines.
- Reserve primary blue for CTAs, links, focused-input underlines, and CTA banners only.
- Apply `letter-spacing: 0.16px` to all body sizes — it is part of the typographic voice.
- Use surface change and 1px hairlines for card hierarchy. Avoid drop shadows.
- Use sentence case for eyebrows and section labels.
- Switch the entire token set when changing themes — not just background and text.
- In dark theme, adjust primary button text to charcoal (`#161616`) because the light-blue accent requires dark text.

### Don't

- Don't round corners on buttons, cards, or inputs. Even 4px breaks the Carbon aesthetic.
- Don't bold display headlines. Weight 300 is the brand voice; weight 700 looks generic.
- Don't add atmospheric depth (gradient overlays, box shadows) outside the documented soft-blue hero gradient (light theme only).
- Don't introduce a second brand color. IBM Blue / Blue-40 is the only chromatic accent.
- Don't replace IBM Plex Sans without preserving `letter-spacing: 0.16px` and weight-300 display treatment.
- Don't use pill-shaped buttons. Carbon uses square corners — pills read as a different brand.
- Don't write all-caps tracked eyebrows. Carbon eyebrows are sentence case at 14px.
- Don't apply the light-theme primary (`#0f62fe`) on dark surfaces — it fails contrast. Use `#78a9ff` (Blue-40) instead.
- Don't hardcode hex values in component CSS. Always go through `var(--color-*)` tokens.

---

## Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Max | 1584px | Carbon max grid; gutters expand |
| Desktop-XL | 1312px | Default desktop layout |
| Desktop | 1056px | Card grid 4-up maintained |
| Tablet | 672px | Card grid → 2-up; nav becomes hamburger |
| Mobile | 320px | Single-column; display-xl scales toward 32px |

### Touch Targets

- Carbon spec: **48px minimum** tap target. Buttons and inputs hold 48px on touch viewports.
- Top-nav links grow to 48px tap height on touch.
- Tab strip rows hold 48px tap height.

### Collapsing Strategy

- **Top nav**: links collapse to hamburger overlay below 672px. Logomark and search icon remain.
- **Utility bar**: hides below 672px.
- **Card grid**: 4-up → 2-up at 1056px → 1-up below 672px.
- **Display type**: `display-xl` 76px scales toward 42px on mobile, preserving weight 300.
- **Footer**: 6-column → 3-column at tablet → 1-column at mobile.

---

## Iteration Guide

1. Focus on one component at a time. Reference it by its token name.
2. Default body to `{typography.body}` weight 400 with `letter-spacing: 0.16px`.
3. When adding a section, decide: `canvas` (default) or `surface-1` (alternate band). This two-surface rhythm is the page rhythm.
4. Add new component variants as separate entries (`button-primary-pressed`, `text-input-error`).
5. Treat primary blue as scarce: links, primary CTA, CTA banner, focus underline only.
6. Validate every new color combination against WCAG AA (4.5:1 for body text, 3:1 for large text and UI components).
7. When adding a dark-theme variant, verify that primary button text switches from white to charcoal to maintain contrast against the light-blue accent.

---

## Known Gaps

- IBM product surfaces (Cloud Pak, Watson, Datacap) use richer Carbon components (data tables, breadcrumbs, contextual menus) that live in Carbon's official documentation rather than in the marketing extraction here.
- Form-field error and validation styling follows Carbon docs; covered in the token table above but not pixel-verified from live marketing pages.
- The community.ibm.com subdomain uses a community-platform white-label that approximates Carbon but is not strict — this system applies to ibm.com proper.
- Carbon also defines a **Gray-10** and **Gray-90** mid-range theme. Gray-10 is functionally identical to White for marketing purposes; Gray-90 is not used on marketing surfaces.
