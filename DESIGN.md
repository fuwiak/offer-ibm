# Cursor Design System — Light & Dark Theme Reference

## Overview

This design system follows **Cursor's marketing and product brand** — a quietly-confident developer voice that favors editorial calm over IDE-darkness. The base canvas is **warm cream** (`{colors.canvas}` — #f7f7f4) holding warm near-black ink (`{colors.ink}` — #26251e) for body and display alike. The single brand voltage is **Cursor Orange** (`{colors.primary}` — #f54e00) reserved for primary CTAs and the wordmark — used scarcely.

Type runs **CursorGothic** as the single sans family (open-source substitute: **Inter** at weight 400 with letter-spacing −1.5%). Display sits at weight 400 with negative letter-spacing — a magazine-editorial voice rather than tech-bombastic. **JetBrains Mono** carries every code surface (and code surfaces are roughly half the page).

The brand's strongest visual signature is the **AI-timeline pill palette**: five pastel pills marking AI-action stages inside in-product timeline visualizations. Used only in product UI — never as system action colors.

**Key Characteristics:**
- Warm cream canvas, not white. Ink is warm (#26251e), not pure black.
- Single CTA color: `{colors.primary}` (Cursor Orange #f54e00). Used scarcely.
- Display weight stays at 400 — never bold. Magazine voice.
- AI timeline pastels: 5 dedicated tokens for in-product agent action stages.
- Compact 8px CTA radius — developer dialect.
- Hairline-only depth; no drop shadows.
- 80px section rhythm.
- Light and dark themes are independently calibrated — never simple inversion.

---

## Themes

### Light Theme (default)

The default marketing and app surface. Warm cream canvas with white cards and warm ink text.

| Role | Token | Value |
|---|---|---|
| Page background | `{colors.canvas}` | `#f7f7f4` |
| IDE pane background | `{colors.canvas-soft}` | `#fafaf7` |
| Card surface | `{colors.surface-card}` | `#ffffff` |
| Badge / tag fill | `{colors.surface-strong}` | `#e6e5e0` |
| Primary text | `{colors.ink}` | `#26251e` |
| Body text | `{colors.body}` | `#5a5852` |
| Muted text | `{colors.muted}` | `#807d72` |
| Disabled text | `{colors.muted-soft}` | `#a09c92` |
| Primary action | `{colors.primary}` | `#f54e00` |
| Primary active | `{colors.primary-active}` | `#d04200` |
| On-primary text | `{colors.on-primary}` | `#ffffff` |
| Hairline | `{colors.hairline}` | `#e6e5e0` |
| Hairline soft | `{colors.hairline-soft}` | `#efeee8` |
| Hairline strong | `{colors.hairline-strong}` | `#cfcdc4` |

### Dark Theme

The product and IDE-adjacent surface. Warm near-black canvas with layered surfaces — **do not simply invert the light palette**.

| Role | Token | Value |
|---|---|---|
| Page background | `{colors.dark-canvas}` | `#1b1a15` |
| IDE pane background | `{colors.dark-canvas-soft}` | `#242320` |
| Card surface | `{colors.dark-surface-card}` | `#2a2924` |
| Badge / tag fill | `{colors.dark-surface-strong}` | `#3a3830` |
| Primary text | `{colors.dark-ink}` | `#f7f7f4` |
| Body text | `{colors.dark-body}` | `#a09c92` |
| Muted text | `{colors.dark-muted}` | `#807d72` |
| Disabled text | `{colors.dark-muted-soft}` | `#5a5852` |
| Primary action | `{colors.primary}` | `#f54e00` |
| Primary active | `{colors.primary-active}` | `#d04200` |
| On-primary text | `{colors.on-primary}` | `#ffffff` |
| Hairline | `{colors.dark-hairline}` | `#3a3830` |
| Hairline soft | `{colors.dark-hairline-soft}` | `#32312c` |
| Hairline strong | `{colors.dark-hairline-strong}` | `#4a4840` |

Cursor Orange stays identical in both themes — it already meets contrast on warm dark surfaces.

---

## Colors

### Brand & Accent

| Token | Light | Dark | Use |
|---|---|---|---|
| `{colors.primary}` | `#f54e00` | `#f54e00` | Primary CTAs, wordmark accent |
| `{colors.primary-active}` | `#d04200` | `#d04200` | Press state |

### Surface

| Token | Light | Dark | Use |
|---|---|---|---|
| `{colors.canvas}` | `#f7f7f4` | — | Page floor |
| `{colors.canvas-soft}` | `#fafaf7` | — | IDE pane inside mockups |
| `{colors.surface-card}` | `#ffffff` | — | White card on cream |
| `{colors.surface-strong}` | `#e6e5e0` | — | Badges, tag pills |
| `{colors.dark-canvas}` | — | `#1b1a15` | Dark page floor |
| `{colors.dark-canvas-soft}` | — | `#242320` | Dark IDE pane |
| `{colors.dark-surface-card}` | — | `#2a2924` | Dark card surface |
| `{colors.dark-surface-strong}` | — | `#3a3830` | Dark badges |

### Hairlines

| Token | Light | Dark | Use |
|---|---|---|---|
| `{colors.hairline}` | `#e6e5e0` | — | 1px divider |
| `{colors.hairline-soft}` | `#efeee8` | — | Lighter divider |
| `{colors.hairline-strong}` | `#cfcdc4` | — | Stronger panel outline |
| `{colors.dark-hairline}` | — | `#3a3830` | Dark divider |
| `{colors.dark-hairline-soft}` | — | `#32312c` | Dark lighter divider |
| `{colors.dark-hairline-strong}` | — | `#4a4840` | Dark panel outline |

### Text

| Token | Light | Dark | Use |
|---|---|---|---|
| `{colors.ink}` | `#26251e` | — | Display, body emphasis |
| `{colors.body}` | `#5a5852` | — | Default running text |
| `{colors.body-strong}` | `#26251e` | — | Same as ink |
| `{colors.muted}` | `#807d72` | — | Sub-titles |
| `{colors.muted-soft}` | `#a09c92` | — | Disabled text |
| `{colors.on-primary}` | `#ffffff` | `#ffffff` | White on Cursor Orange |
| `{colors.dark-ink}` | — | `#f7f7f4` | Dark display text |
| `{colors.dark-body}` | — | `#a09c92` | Dark body text |
| `{colors.dark-muted}` | — | `#807d72` | Dark sub-titles |
| `{colors.dark-muted-soft}` | — | `#5a5852` | Dark disabled text |

### Timeline (AI-action signature)

Used inside in-product agent timeline only — **never as system action colors**. Same values in both themes.

| Token | Value | Stage |
|---|---|---|
| `{colors.timeline-thinking}` | `#dfa88f` | Peach — Thinking |
| `{colors.timeline-grep}` | `#9fc9a2` | Mint — Grepping |
| `{colors.timeline-read}` | `#9fbbe0` | Pastel blue — Reading |
| `{colors.timeline-edit}` | `#c0a8dd` | Lavender — Editing |
| `{colors.timeline-done}` | `#c08532` | Warm gold — Done |

### Semantic

| Token | Value | Use |
|---|---|---|
| `{colors.semantic-success}` | `#1f8a65` | Confirmation indicators |
| `{colors.semantic-error}` | `#cf2d56` | Validation errors |

---

## Typography

### Font Family

**CursorGothic** is the licensed display + body family. Fallback: `system-ui, "Helvetica Neue", Helvetica, Arial, sans-serif`. Code surfaces switch to **JetBrains Mono**.

Open-source substitute: **Inter** at weight 400 with letter-spacing −1.5%. Or **GT Sectra** for a more editorial feel.

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `{typography.display-mega}` | 72px | 400 | 1.1 | −2.16px | Homepage hero h1 |
| `{typography.display-lg}` | 36px | 400 | 1.2 | −0.72px | Section heads |
| `{typography.display-md}` | 26px | 400 | 1.25 | −0.325px | Sub-section heads |
| `{typography.display-sm}` | 22px | 400 | 1.3 | −0.11px | Card group titles |
| `{typography.title-md}` | 18px | 600 | 1.4 | 0 | Component titles |
| `{typography.title-sm}` | 16px | 600 | 1.4 | 0 | List labels |
| `{typography.body-md}` | 16px | 400 | 1.5 | 0 | Default body |
| `{typography.body-tracked}` | 16px | 400 | 1.5 | 0.08px | Tracked editorial body |
| `{typography.body-sm}` | 14px | 400 | 1.5 | 0 | Footer body |
| `{typography.caption}` | 13px | 400 | 1.4 | 0 | Photo captions |
| `{typography.caption-uppercase}` | 11px | 600 | 1.4 | 0.88px | Section labels, timeline pill labels |
| `{typography.code}` | 13px | 400 | 1.5 | 0 | Code blocks — JetBrains Mono |
| `{typography.button}` | 14px | 500 | 1.0 | 0 | CTA pill labels |
| `{typography.nav-link}` | 14px | 500 | 1.4 | 0 | Top-nav menu |

### Principles

- **Display weight stays at 400.** Magazine voice, never bold.
- **Negative letter-spacing on display only.** −0.11px to −2.16px tracking.
- **JetBrains Mono on every code surface.**
- **Dark theme: same type scale.** Only color tokens change.

---

## Layout

### Spacing System

- **Base unit:** 4px.
- **Tokens:** `{spacing.xxs}` 4px · `{spacing.xs}` 8px · `{spacing.sm}` 12px · `{spacing.base}` 16px · `{spacing.md}` 20px · `{spacing.lg}` 24px · `{spacing.xl}` 32px · `{spacing.xxl}` 48px · `{spacing.section}` 80px.
- **Section padding:** 80px.

### Grid & Container

- Max content width: ~1200px.
- Editorial body: 12-column grid.
- Feature card grids: 2-up at desktop for splits, 3-up for benefits.
- Footer: 5-column at desktop.

### Whitespace Philosophy

Generous editorial pacing — closer to a print magazine than a tech site. The cream canvas has plenty of breathing room; cards within bands sit close (16–24px gap).

---

## Elevation & Depth

The system uses **hairline-only depth**. No drop shadows, no elevation tiers. Cards float above the canvas via 1px hairlines and the slight white-on-cream contrast (light) or card-on-canvas contrast (dark).

| Level | Light Treatment | Dark Treatment | Use |
|---|---|---|---|
| Flat (canvas) | `{colors.canvas}` | `{colors.dark-canvas}` | Body bands, footer |
| Card | `{colors.surface-card}` | `{colors.dark-surface-card}` | Content cards |
| Hairline border | 1px `{colors.hairline}` | 1px `{colors.dark-hairline}` | Card outlines, dividers |
| IDE pane | `{colors.canvas-soft}` | `{colors.dark-canvas-soft}` | Inside IDE mockup cards |

### Decorative Depth

- **IDE-mockup cards** are the only "elevated" element. White card on cream canvas with internal pane structure mimicking the actual Cursor editor.
- **Timeline pastel pills** add chromatic depth without surface elevation.

---

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.none}` | 0px | Reserved |
| `{rounded.xs}` | 4px | Inline tags |
| `{rounded.sm}` | 6px | Compact rows |
| `{rounded.md}` | 8px | CTA buttons, form inputs, theme switcher |
| `{rounded.lg}` | 12px | Cards, IDE panes |
| `{rounded.xl}` | 16px | Larger feature cards (rare) |
| `{rounded.pill}` | 9999px | Timeline pills, badges |
| `{rounded.full}` | 9999px | Avatars (rare) |

---

## Components

### Top Navigation

**`top-nav`** — Background `{colors.canvas}` / `{colors.dark-canvas}`, text `{colors.ink}` / `{colors.dark-ink}`, height 64px. Layout: Cursor wordmark left, primary horizontal menu, Sign In + Download primary CTA right.

### Buttons

**`button-primary`** — Cursor Orange CTA. Background `{colors.primary}`, text `{colors.on-primary}`, type `{typography.button}` (14px / 500), padding 10px × 18px, height 40px, rounded `{rounded.md}` (8px).

**`button-primary-active`** — Press state. Background `{colors.primary-active}`.

**`button-secondary`** — White card pill on cream canvas. Background `{colors.surface-card}`, text `{colors.ink}`, 1px `{colors.hairline-strong}` border.

**`button-tertiary-text`** — Inline ink text link.

**`button-download`** — Larger ink-canvas CTA. Background `{colors.ink}`, text `{colors.canvas}`, padding 12px × 20px, height 44px.

### Hero & IDE Mockups

**`hero-band`** — Background canvas, display headline in `{typography.display-mega}`, subhead in `{typography.body-md}`, two CTAs, centered IDE-mockup card below.

**`ide-mockup-card`** — White card containing multi-pane IDE mockup. Background `{colors.surface-card}`, rounded `{rounded.lg}`, 1px `{colors.hairline}` border, no padding.

**`ide-pane`** — Individual IDE pane. Background `{colors.canvas-soft}`, text `{colors.body}` in `{typography.code}`, rounded `{rounded.md}`, padding 16px.

### Cards

**`feature-card`** — Background `{colors.surface-card}`, text `{colors.ink}`, type `{typography.title-md}`, rounded `{rounded.lg}`, padding 24px, 1px `{colors.hairline}` border.

**`comparison-card`** — Side-by-side comparison. Same surface; internally split into 2 columns.

**`testimonial-card`** — Quote card. Background `{colors.surface-card}`, text `{colors.body}`, rounded `{rounded.lg}`, padding 24px.

### AI Timeline (signature)

**`timeline-pill-thinking`** — Peach pill. Background `{colors.timeline-thinking}`, text `{colors.ink}`, type `{typography.caption-uppercase}`, rounded `{rounded.pill}`, padding 4px × 10px.

**`timeline-pill-grep`** — Mint pill. Background `{colors.timeline-grep}`.

**`timeline-pill-read`** — Pastel-blue pill. Background `{colors.timeline-read}`.

**`timeline-pill-edit`** — Lavender pill. Background `{colors.timeline-edit}`.

**`timeline-pill-done`** — Gold pill. Background `{colors.timeline-done}`, text `{colors.on-primary}`.

### Code

**`code-block`** — Background `{colors.surface-card}`, text `{colors.ink}` in `{typography.code}`, rounded `{rounded.lg}`, padding 20px, 1px `{colors.hairline}` border.

### Pricing

**`pricing-tier-card`** — Background `{colors.surface-card}`, rounded `{rounded.lg}`, padding 32px, 1px `{colors.hairline}` border.

**`pricing-tier-featured`** — Featured tier inverts to ink. Background `{colors.ink}`, text `{colors.canvas}`.

### Forms & Tags

**`text-input`** — Background `{colors.surface-card}`, text `{colors.ink}`, rounded `{rounded.md}`, padding 12px × 16px, height 44px.

**`badge-pill`** — Small uppercase pill. Background `{colors.surface-strong}`, text `{colors.ink}`, type `{typography.caption-uppercase}`, rounded `{rounded.pill}`, padding 4px × 10px.

### Theme Switcher

**`theme-switcher`** — Segmented control for Light / Dark / System preference. Placed in sidebar footer, settings panel, and account modal.

| Property | Light | Dark |
|---|---|---|
| Container border | 1px `{colors.hairline}` | 1px `{colors.dark-hairline}` |
| Container radius | `{rounded.md}` 8px | `{rounded.md}` 8px |
| Segment bg (default) | `{colors.canvas}` | `{colors.dark-canvas}` |
| Segment text | `{colors.muted}` | `{colors.dark-muted}` |
| Segment bg (active) | `{colors.ink}` | `{colors.dark-ink}` |
| Segment text (active) | `{colors.canvas}` | `{colors.dark-canvas}` |
| Segment hover | `{colors.canvas-soft}` | `{colors.dark-canvas-soft}` |
| Type | `{typography.button}` 12px / 500 | same |
| Min height | 32px | 32px |
| Icons | Sun (light) · Moon (dark) · Monitor (system) | same |

Compact variant (`variant="compact"`) shows icons only in the sidebar. Labeled variant (`variant="labeled"`) shows translated text labels in settings.

### CTA / Footer

**`cta-band`** — Pre-footer band. Background canvas, centered display headline in `{typography.display-lg}`, single Cursor Orange CTA. 96px vertical padding.

**`footer`** — Closing footer. Background canvas, text `{colors.body}`. 5-column link list. 64×48px padding.

**`footer-link`** — Background transparent, text `{colors.body}`, type `{typography.body-sm}`.

---

## Theme Switching

### CSS Custom Properties Pattern

Map all design tokens to CSS custom properties scoped to `[data-theme]` on `<html>`:

```css
:root,
[data-theme="light"] {
  --color-canvas: #f7f7f4;
  --color-canvas-soft: #fafaf7;
  --color-surface-card: #ffffff;
  --color-ink: #26251e;
  --color-body: #5a5852;
  --color-muted: #807d72;
  --color-primary: #f54e00;
  --color-primary-active: #d04200;
  --color-hairline: #e6e5e0;
  /* ... all light tokens ... */
}

[data-theme="dark"] {
  --color-canvas: #1b1a15;
  --color-canvas-soft: #242320;
  --color-surface-card: #2a2924;
  --color-ink: #f7f7f4;
  --color-body: #a09c92;
  --color-muted: #807d72;
  --color-primary: #f54e00;
  --color-primary-active: #d04200;
  --color-hairline: #3a3830;
  /* ... all dark tokens ... */
}
```

Apply to the root element: `<html data-theme="light">` or `<html data-theme="dark">`.

### System Preference

Respect `prefers-color-scheme` as the default when the user selects **System**, overridable by explicit selection stored in `localStorage.theme` (`"light"` | `"dark"` | `"system"`).

### UI Integration

The `ThemeSwitcher` component (`frontend/src/components/ThemeSwitcher`) renders the segmented control and calls `setTheme()` from `useTheme()`. It appears in:

- Sidebar footer (`OfferKpSidebarExtras`, `Footer`)
- Settings → Interface (`ThemePreference`)
- Account modal

### Rules for Theme Switching

- Never hardcode hex values in component styles — always reference `var(--color-*)` or `--theme-*` app tokens.
- Cursor Orange stays the same in both themes — do not swap to a lighter orange in dark mode.
- Never infer the dark theme by applying `filter: invert()` — the dark palette is independently authored.
- Timeline pastels stay identical in both themes.
- Switch the entire token set when changing themes — not just background and text.

---

## Do's and Don'ts

### Do

- Reserve `{colors.primary}` (Cursor Orange) for primary CTAs and brand wordmark.
- Keep display weight at 400. The editorial voice depends on this.
- Use the cream `{colors.canvas}` page floor in light mode — never pure white.
- Render every code surface in JetBrains Mono.
- Use timeline pastels only inside in-product agent visualizations.
- Expose theme preference via the `theme-switcher` segmented control — not a native `<select>`.
- Calibrate dark tokens independently; warm dark canvas, not cold gray.

### Don't

- Don't introduce a secondary brand action color. Cursor Orange is the only one.
- Don't drop display to bold weights (700+). Magazine voice depends on 400.
- Don't add drop shadows. Hairlines + ink-on-cream contrast carry the depth.
- Don't use timeline pastels on non-timeline UI.
- Don't extract a CTA color from third-party widgets (cookie consent). The brand CTA is what appears on actual product CTAs.
- Don't hardcode hex values in component CSS.

---

## Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Mobile | < 640px | Hero h1 72→32px; IDE mockup collapses to single pane; feature grid 1-up; nav hamburger |
| Tablet | 640–1024px | Hero h1 56px; IDE mockup compresses; feature grid 2-up |
| Desktop | 1024–1280px | Full hero h1 72px; full multi-pane IDE mockup; feature grid 3-up |
| Wide | > 1280px | Content caps at 1200px |

### Touch Targets

- Primary CTA at 40px height — WCAG AA, padded for AAA.
- Download CTA at 44px — AAA.
- Theme switcher segments at 32px min-height.

### Collapsing Strategy

- Top nav switches to hamburger below 768px.
- IDE mockup multi-pane collapses to a single primary pane preview on mobile.
- Feature grid: 3-up → 2-up → 1-up.
- Theme switcher stays visible in sidebar footer at all breakpoints.

---

## Iteration Guide

1. Focus on a single component at a time.
2. CTAs default to `{rounded.md}` (8px). Cards use `{rounded.lg}` (12px).
3. Variants live as separate entries inside `components:`.
4. Use `{token.refs}` everywhere — never inline hex.
5. Hover state never documented.
6. CursorGothic 400 for display, 400/500/600 for body. JetBrains Mono on every code surface.
7. Cursor Orange stays scarce.
8. Timeline pastels stay scoped to in-product agent visualizations.
9. Theme switcher uses ink-on-canvas inversion for the active segment — not Cursor Orange.

---

## Known Gaps

- CursorGothic is a licensed typeface; Inter is the substitute.
- Animation timings (timeline pill entrance, IDE pane reveal) out of scope.
- In-app surfaces (code editor, chat panel, agent timeline) only partially captured via marketing IDE mockups.
- Form validation states beyond focus not visible on captured surfaces.
- App shell CSS tokens (`--theme-*` in `index.css`) are being migrated from IBM Carbon values to Cursor tokens incrementally.
