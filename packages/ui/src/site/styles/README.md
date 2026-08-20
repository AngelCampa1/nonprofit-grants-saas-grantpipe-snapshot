# CSS Conventions — GrantPipe Marketing Site

This document covers the CSS conventions, design tokens, and mobile-first patterns
used across `packages/ui/src/site/` and `apps/site/src/`. It is the reference for
anyone adding new components or modifying existing ones.

---

## Mobile-first by default

All responsive CSS is **mobile-first**. Start with the smallest viewport and layer
larger breakpoints on top.

```css
/* Correct — mobile value first, then override at larger breakpoint */
.my-component {
  flex-direction: column;
}
@media (min-width: 640px) {
  .my-component {
    flex-direction: row;
  }
}

/* Incorrect — desktop value first, then undo at small */
.my-component {
  flex-direction: row;
}
@media (max-width: 639px) {
  .my-component {
    flex-direction: column;
  }
}
```

When using Tailwind utility classes directly in `.astro` templates, use responsive
prefixes in the correct order:

```html
<!-- Correct: base class first, then sm: / md: / lg: overrides -->
<div class="flex-col sm:flex-row">...</div>

<!-- Incorrect: applying large-viewport class as base -->
<div class="flex-row max-sm:flex-col">...</div>
```

---

## Breakpoints

| Token | Value  | Use case                                  |
| ----- | ------ | ----------------------------------------- |
| `sm`  | 640px  | Form rows, CTA stacks go horizontal       |
| `md`  | 768px  | Desktop nav replaces mobile nav drawer    |
| `lg`  | 1024px | Wider content containers, sidebar layouts |
| `xl`  | 1280px | Max-width editorial shells                |

---

## Multi-column grids

Never use a bare `grid-cols-{2..6}` class without a responsive companion.
The mobile-first-grid contract test (`apps/site/src/mobile-first-grid-contract.test.ts`)
will fail if a bare grid-cols class is found without a `sm:`, `md:`, or `lg:` prefix
on the same element.

```html
<!-- Correct: single column on mobile, two columns at sm+ -->
<div class="grid grid-cols-1 sm:grid-cols-2">...</div>

<!-- Incorrect: bare two-column grid with no mobile fallback -->
<div class="grid grid-cols-2">...</div>
```

---

## Typography scale

All heading font sizes must use fluid `clamp()` scaling or have responsive
Tailwind prefix companions. The mobile-first-typography contract test
(`apps/site/src/mobile-first-typography-contract.test.ts`) enforces this for
`text-5xl`, `text-6xl`, and `text-7xl`.

```html
<!-- Correct: responsive companion -->
<h1 class="text-4xl sm:text-5xl lg:text-6xl">...</h1>

<!-- Incorrect: bare large heading with no mobile fallback -->
<h1 class="text-6xl">...</h1>
```

For components that use plain CSS (not Tailwind), use `clamp()`:

```css
.responsive-hero__heading :global(h1) {
  font-size: clamp(2.35rem, 7vw, 4.25rem);
}
```

---

## iOS safe-area insets

All components that render near screen edges on mobile must account for iOS safe
area insets (Dynamic Island, home bar, notch).

CSS custom properties are injected by `base-layout.astro`:

```css
:root {
  --safe-area-inset-top: env(safe-area-inset-top, 0px);
  --safe-area-inset-right: env(safe-area-inset-right, 0px);
  --safe-area-inset-bottom: env(safe-area-inset-bottom, 0px);
  --safe-area-inset-left: env(safe-area-inset-left, 0px);
}
```

For fixed-to-bottom components, use `padding-bottom: env(safe-area-inset-bottom)` or
the utility class `.safe-area-bottom` defined in `apps/site/src/styles/global.css`:

```css
.safe-area-bottom {
  padding-bottom: max(1rem, env(safe-area-inset-bottom));
}
```

The `viewport-fit=cover` meta tag must also be set (it is, in base-layout) for these
env() values to resolve correctly on notched devices.

---

## Tap targets

All interactive elements (links, buttons, inputs, selects) must have a minimum size
of 48x48 CSS pixels to meet WCAG 2.5.5 (Target Size).

Enforced via the `mobile-hit-targets-source.test.ts` source regression and the
Playwright `tap-target.ts` helper in `apps/site/playwright/lib/`.

```css
/* Button tap target */
.mobile-drawer-hamburger {
  min-width: 3rem; /* 48px */
  min-height: 3rem; /* 48px */
}

/* Form field tap target */
.gp-field--mobile-safe {
  min-height: 48px;
  font-size: 16px; /* prevents iOS auto-zoom */
}
```

The minimum `font-size: 16px` on form inputs is critical — iOS Safari zooms the
viewport when an input with `font-size < 16px` is focused. This is set globally in
`apps/site/src/styles/global.css` and repeated in `.gp-field--mobile-safe`.

---

## Design tokens

Design tokens are CSS custom properties defined in `packages/ui/src/globals.css` and
`packages/ui/src/site/styles/globals.css`. Use tokens for all colors, spacing, and
typography — never hardcode hex values.

| Token               | Usage                                  |
| ------------------- | -------------------------------------- |
| `--gp-paper`        | Main background (white / near-white)   |
| `--gp-paper-2`      | Subtle secondary background            |
| `--gp-ink-200`      | Border color (dividers, input borders) |
| `--gp-emerald-600`  | Brand primary / focus ring             |
| `--gp-card`         | Card surface                           |
| `--surface-overlay` | Backdrop/scrim base color (black)      |

---

## Overflow control

- `body { overflow-x: hidden }` is set globally to prevent any component leaking
  horizontal scroll. This is a last-resort guard — components should not overflow
  in the first place.
- Tables must be wrapped in `overflow-x-auto` or a custom scroll container. The
  mobile-first-table contract test enforces this.
- Absolutely-positioned elements inside layout containers must be `overflow: hidden`
  on the container to prevent widening the page.

---

## Scoped vs global styles in Astro components

Prefer **scoped styles** (`<style>`) for component-internal layout and spacing.
Use **`<style is:global>`** or **`:global()`** only when:

- You need to style slotted content (e.g. `h1` inside a heading slot)
- You need to apply a class added by a client-side script (`aria-expanded`, etc.)
- You're setting a utility class that will be used by child components

```astro
<style>
  /* Scoped: only affects this component's root element */
  .my-component { padding: 1rem; }
</style>

<style is:global>
  /* Global: applied to all matching elements — use sparingly */
  .gp-mkt-btn { min-height: 48px; }
</style>
```

---

## Table of responsive primitives

| Component              | File                           | Breakpoint behaviour                          |
| ---------------------- | ------------------------------ | --------------------------------------------- |
| `ResponsiveHero`       | `responsive-hero.astro`        | Single column → 2-column grid at 900px        |
| `ViewportAwareDetails` | `viewport-aware-details.astro` | Closed on mobile, open at 640px+              |
| `MobileNavDrawer`      | `mobile-nav-drawer.astro`      | Visible below 768px; hidden on desktop        |
| `StickyMobileCta`      | `sticky-mobile-cta.astro`      | Visible below 640px; scrolls away near footer |
| `BaseLayout`           | `base-layout.astro`            | Sets viewport-fit=cover and safe-area vars    |
