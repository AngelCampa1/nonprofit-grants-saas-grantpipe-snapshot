# Handoff: GrantPipe Marketing Site Redesign

## Overview

Full redesign of the GrantPipe marketing site — landing page, pricing page, resources hub, compare page, and 9 SEO page templates. The goal was a stronger first impression for grant managers and finance/ops staff at mid-sized nonprofits ($500K–$10M budgets).

---

## About the Design Files

The files in this bundle are **HTML design prototypes** — high-fidelity mockups showing intended look, layout, copy, and interactions. They are **not production code to ship directly**.

Your task is to **recreate these designs in the existing Astro codebase** (`apps/site`) using its established patterns, content collections, and component structure. The CSS tokens defined in the prototypes should be merged into the existing theme system (`packages/ui/src/site/lib/generate-theme-css.ts`).

---

## Fidelity

**High-fidelity.** These are pixel-level references. Colors, typography, spacing, border radii, and interaction states are all specified. Recreate them faithfully using the codebase's existing libraries and patterns.

---

## Design Files in This Bundle

| File                                  | What it is                                       |
| ------------------------------------- | ------------------------------------------------ |
| `GrantPipe Landing v2 Dashboard.html` | Main homepage                                    |
| `pricing.html`                        | Pricing page                                     |
| `resources.html`                      | Resources hub                                    |
| `compare.html`                        | Compare / alternatives overview                  |
| `seo-templates.html`                  | Design canvas with 9 SEO page templates          |
| `gp-shared.css`                       | Shared CSS used by pricing / resources / compare |

All files link to each other via relative `href`s — open any of them in a browser to navigate the full prototype.

---

## Design Tokens

These should be merged into your existing theme system. The `primary` and `accent` hex seeds are already in `apps/site/src/config/site.ts`.

### Colors

```css
/* Emerald (primary) */
--emerald-900: #033a2c;
--emerald-800: #054b39;
--emerald-700: #065f46; /* primary CTA, nav active, eyebrow */
--emerald-600: #0a7553; /* check icons, deltas */
--emerald-500: #10906a;
--emerald-100: #d4ebe1;
--emerald-50: #ecf6f1; /* eyebrow bg, tag bg */

/* Gold (accent) */
--gold-700: #8d6a1f;
--gold-600: #b88928; /* annual badge, brand accent */
--gold-500: #d6a13a;
--gold-100: #f5e8c6;
--gold-50: #faf3df; /* Drafting pill bg */

/* Ink (neutrals) */
--ink-900: #0e1a16; /* body text */
--ink-700: #2a3a33; /* secondary text */
--ink-500: #5b6e66; /* muted text */
--ink-300: #97a59f; /* placeholder, empty states */
--ink-200: #c9d2cd; /* borders (soft) */
--ink-100: #e3e9e6; /* borders (default), dividers */

/* Surface */
--paper: #fbfaf6; /* page background (warm off-white) */
--paper-2: #f4f1e9; /* alt section background */
--card: #ffffff; /* card surfaces */

/* Semantic */
--danger: #b8442d; /* overdue, urgent due dates */
--warn: #c98a2b; /* spend-down warning (78%+) */
```

### Typography

```
Heading / Display: Spectral (Google Fonts) — weights 400, 500, 600, 700
Body:              Manrope (Google Fonts) — weights 400, 500, 600, 700, 800
Mono:              JetBrains Mono (Google Fonts) — weights 400, 500, 600
```

These match the `theme.fonts` already defined in `apps/site/src/config/site.ts`:

```ts
fonts: { heading: "Spectral", body: "Manrope", mono: "JetBrains Mono" }
```

### Spacing & Radii

```css
--rad-sm: 6px; /* buttons, small chips */
--rad: 10px; /* cards, panels */
--rad-lg: 14px; /* large cards, dashboard shell */
```

### Shadows

```css
--shadow-sm: 0 1px 2px rgba(14, 26, 22, 0.04), 0 1px 1px rgba(14, 26, 22, 0.03);
--shadow: 0 1px 2px rgba(14, 26, 22, 0.05), 0 8px 24px -10px rgba(14, 26, 22, 0.12);
--shadow-lg: 0 2px 4px rgba(14, 26, 22, 0.06), 0 24px 60px -20px rgba(14, 26, 22, 0.2);
```

---

## Page Specs

### 1. Homepage (`/`)

**File:** `GrantPipe Landing v2 Dashboard.html`

#### Layout

- Sticky top nav (`68px` tall, blurred backdrop)
- Full-width sections, `max-width: 1240px` wrap, `padding: 0 28px`
- Alt sections use `background: var(--paper-2)`

#### Nav

- Logo: Spectral 22px/600, brand mark 28×28px emerald-700 bg, gold text "G"
- Links: Manrope 14px/500, ink-700, hover → emerald-700
- CTAs: "Sign in" (link style) + "Start free trial" (primary pill button)

#### Hero — 3 variants (toggled via Tweaks panel)

**Split (default):** `grid-template-columns: 0.85fr 1.25fr; gap: 48px; align-items: center`

Left side:

- Eyebrow pill: mono 12px, emerald-700, emerald-50 bg, 999px radius, animated dot
- H1: Spectral 600, `clamp(40px, 5.6vw, 68px)`, line-height 1.04, letter-spacing -0.02em
- `<em>` inside H1: italic, emerald-700, weight 500
- Lede: Manrope 19px/400, ink-700, max-width 580px
- CTA row: "Start 1-month free trial →" (primary pill, height 50px, padding 0 26px) + "See product walkthrough" (ghost pill)
- Fineprint: 3 check items, mono 13px, ink-500, check icons emerald-600
- Persona variants (data-persona attr): `manager` / `finance` / `ed` — swap H1 + lede copy

Right side — **Dashboard mock:**

- Browser chrome bar with traffic lights + URL bar
- 2-column: dark sidebar (164px, emerald-900 bg) + main content (paper bg)
- Sidebar: org mark, nav items, restricted fund mini-bars
- Main: page header + 3 KPI cards (`grid: repeat(3,1fr)`, display 28px) + 4-row grants list
- Grant rows: name (600/13.5px) + funder/amount sub-line (mono 11px) left, stage pill + due date right
- Stage pills: Drafting (gold-50/gold-100/gold-700), Awarded (emerald-50/100/700), Submitted (#eaf1f5/#d4dfe7/#356c8a), Reporting (#f3eaf5/#e2d3e5/#6f3f7c)

**Full-bleed:** centered copy, dashboard below at full width
**Stacked:** copy + bullet list, then dashboard below

#### Sections (in order)

1. **Logo strip** — paper-2 bg, "Built for nonprofits like" + 6 placeholder org names in Spectral/300, ink-300
2. **Features** (4 cards, 2×2 grid) — card with icon, Spectral h3, body, then a mini product screenshot. See feature card specs below.
3. **Pricing** — heading + billing toggle + 4 plan cards
4. **Final CTA** — paper-2 bg, 2-col (copy + checklist), emerald-700 primary button

#### Feature Cards

Each: card bg, border ink-100, radius 14px, padding 26px, hover lifts 1px with emerald-100 border.

| Card                  | Mini-shot content                                                                |
| --------------------- | -------------------------------------------------------------------------------- |
| Pipeline              | Mini kanban: 3 columns (Drafting/Submitted/Awarded) with real grant cards inside |
| Restricted funds      | 3 labeled progress bars with amounts (`$46k of $110k · 42%`)                     |
| Federal grants search | Search input row + 2 opportunity result rows with CFDA/amount/due                |
| Audit-ready           | 3 document rows with Ready/Draft/Due status pills + audit trail note             |

#### Buttons (pill shape — all `border-radius: 999px`)

```
Primary:  bg emerald-700, color #fff, shadow 0 1px 2px rgba(6,95,70,0.18)
Ghost:    transparent, border ink-200, color ink-900; hover bg paper-2
Link:     transparent, color emerald-700
Sizes:    default h-40px px-18px 14px; lg h-50px px-26px 15px; sm h-34px px-14px 13px
```

#### Eyebrow component

```
font: mono 12px/500, uppercase, letter-spacing 0.08em, color emerald-700
bg: emerald-50, border: 1px solid emerald-100, radius: 999px, padding: 6px 12px
dot: 6px circle, emerald-600, box-shadow 0 0 0 3px rgba(10,117,83,0.25)
```

#### Billing toggle (pricing section)

```
Wrapper: paper-2 bg, border ink-100, radius 999px, padding 4px
Options: h-36px, px-16px, mono 13px/600
Active: card bg, emerald-700 color, shadow-sm
"2 months free" badge: gold-50 bg, gold-700 color, mono 10px/600, radius 999px
```

---

### 2. Pricing page (`/pricing`)

**File:** `pricing.html`

- Page hero: centered, Spectral h1 + billing toggle
- 3-column self-serve plan grid: Starter $39/mo annual ($49 monthly), Growth $79/mo annual ($99 monthly), Audit-Ready $159/mo annual ($199 monthly). Enterprise is a custom founder-contact path below the grid, not a fourth card.
- Plan comparison matrix table (features vs plans)
- 8-question FAQ (details/summary accordion)
- Final CTA (paper-2 bg, no dark green)

**Plan card anatomy:**

- h4: Spectral 600 20px
- `.desc`: 13px ink-500, min-height 38px
- `.amt`: Spectral 600 36px, letter-spacing -0.01em
- `small` below amt: billing cadence in Manrope 13px ink-500
- `.price-alt`: mono 11px ink-500 (shows alternate billing)
- Feature list: check icon (emerald-600) + 13.5px text
- CTA button: full width, radius 999px
- "Most popular" (Growth): emerald-700 border, emerald-50 glow, badge pill at top-left

---

### 3. Resources page (`/resources`)

**File:** `resources.html`

- Page hero: left-aligned
- Category filter chips (pill shape, active = emerald-700)
- Featured row: `grid 1.4fr 1fr`
  - Left: large card, `background: var(--paper-2)`, emerald-700 eyebrow, Spectral h2 32px — **not dark green**
  - Right: 2 stacked cards (guide + video)
- 3-column resource grid: cards with type label (GUIDE/NOTE/TMPL/VIDEO in mono, no emoji), Spectral h3, body, meta row
- Templates strip: paper-2 bg, 4-col grid of downloadable template tiles
- Newsletter: dark emerald bg, email capture form with pill input + pill submit button

---

### 4. Compare page (`/compare`)

**File:** `compare.html`

- 4-column alternative cards (Spreadsheets / Donor CRMs / Salesforce / GrantPipe)
- Full feature comparison matrix (rows = features, cols = competitors + GrantPipe highlighted)
- 2 head-to-head sections: vs Spreadsheets, vs Salesforce
  - Left card: paper bg, ✗ red bullets
  - Right card: emerald-900 bg, ✓ gold bullets
- "Where GrantPipe fits" — 3-col grid with numbered why cards
- Final CTA (paper-2 bg)

---

### 5. SEO Page Templates (`/compare/alternatives/[slug]`, `/nonprofit-software/[state]`, etc.)

**File:** `seo-templates.html` (design canvas — 9 artboards)

All 9 templates share a common shell:

```
sticky topbar (52px) → breadcrumb → 2-col layout (main + 240px sidebar) → bottom CTA bar
```

**Sidebar CTA widget:**

- `background: var(--card)`, border ink-100, radius 10px, padding 16px
- h4 Spectral 16px/600, dark ink (NOT dark green)
- p body 12.5px ink-500
- Button: full width, pill, emerald-700 bg, white text
- Fineprint: mono 10px ink-300

**Bottom CTA bar:**

- `background: var(--emerald-900)`, padding 20px 24px
- Copy left (ink on dark), button right (pill, gold-600 bg, emerald-900 text)

#### Template-specific specs

| Template    | URL pattern                    | Key unique blocks                                                                              |
| ----------- | ------------------------------ | ---------------------------------------------------------------------------------------------- |
| Alternative | `/compare/alternatives/[slug]` | Pros/cons 2-col, feature comparison table, FAQ, sidebar meta (competitor name/pricing/stage)   |
| Comparison  | `/compare/versus/[slug]`       | Side-by-side verdict cards (paper vs emerald-900), 5-col feature table, when-to-choose section |
| State       | `/nonprofit-software/[state]`  | Stats ribbon (3 KPIs), compliance requirements table, dual-calendar explainer, FAQ             |
| City        | `/nonprofit-software/[city]`   | Top funders list (name/type/annual giving), compliance notes, FAQ                              |
| Vertical    | `/solutions/[sector]`          | Grant program list with type tags, compliance table, FAQ                                       |
| Persona     | `/for/[role]`                  | Numbered pain points list, feature-to-job table, stats ribbon, glossary terms                  |
| Feature     | `/features/[slug]`             | In-app mock (restricted fund bars or pipeline), capability matrix, glossary                    |
| Guide       | `/resources/guides/[slug]`     | TOC box, TL;DR bullet box, inline lead magnet CTA, related guides sidebar                      |
| Listicle    | `/resources/best/[slug]`       | Summary comparison table, ranked tool cards with pros/cons/verdict, quick-verdict sidebar      |

---

## Astro Implementation Notes

### Content collections → layouts

Each content type in `apps/site/src/content/` maps to a layout:

```
alternatives/*.md       → AlternativeLayout.astro
comparisons/*.md        → ComparisonLayout.astro
state-pages/*.md        → StateLayout.astro
city-pages/*.md         → CityLayout.astro
vertical-pages/*.md     → VerticalLayout.astro
personas/*.md           → PersonaLayout.astro
features/*.md           → FeatureLayout.astro
guides/*.md             → GuideLayout.astro
listicles/*.md          → ListicleLayout.astro
```

### Billing toggle (pricing page)

The toggle is vanilla JS. Either:

- Drop the `<script>` block directly into a `<script is:inline>` in the Astro page, or
- Wrap as a small React island with `client:load` on `<PricingToggle>`

### Dashboard mock

The dashboard mock is display-only HTML — no interactivity needed. Implement as a static Astro component `<DashboardMock />` that renders the sidebar + main content panel. No framework needed.

### Persona-conditional copy

The homepage hero has 3 copy variants toggled via `data-persona` on `<body>`. Implement as a client-side Astro island or simple JS that reads a URL param (`?for=finance`). The three variants are: `manager` (default), `finance`, `ed`.

### SEO structured data

The content frontmatter already includes `schema`, `faqs`, `answers`, `proscons`, `tableData`, `pricingStats`, and `sourceUrls`. The layout components should render these as JSON-LD structured data (`Article`, `SoftwareApplication`, `ItemList`, `FAQPage` schemas as appropriate).

---

## Interactions & Animations

| Element        | Behavior                                                                    |
| -------------- | --------------------------------------------------------------------------- |
| Nav links      | color → emerald-700 on hover (0.15s ease)                                   |
| Buttons        | translateY(1px) on active; bg darkens 0.15s                                 |
| Btn arrow (→)  | translateX(2px) on parent hover (0.15s)                                     |
| Feature cards  | translateY(-1px), shadow appears, border → emerald-100 (0.15s)              |
| Billing toggle | active option slides with bg: card + shadow-sm (0.15s)                      |
| FAQ accordion  | `<details>` native expand; `+` → `−` symbol swap; open border → emerald-100 |
| Resource cards | translateY(-1px) + shadow on hover (0.15s)                                  |

---

## Responsive Breakpoints

```
@media (max-width: 980px)  → hero split → single col; stack-cols → single col
@media (max-width: 880px)  → testimonial/final-cta → single col
@media (max-width: 760px)  → feature grid → 1 col; pricing → 2 col
@media (max-width: 560px)  → pricing → 1 col
```

---

## Copy & Content Notes

- Trial CTA copy: **"Start 1-month free trial"** — never "Book a demo"
- No fabricated social proof — no "$48M tracked" or "9 hrs saved" stats (unverified)
- Pricing: Starter $269/$329, Growth $449/$539, Audit-Ready $899/$1,079, with Enterprise as a custom path below pricing
- Annual billing framing: **"2 months free"** (not "save 17%")
- Logo strip org names are placeholders — replace with real customers when available
- Founder note: Angel Campa, solo engineer — honest framing only

---

## Files Included

```
design_handoff_grantpipe_marketing/
├── README.md                              ← this file
├── GrantPipe Landing v2 Dashboard.html    ← homepage prototype
├── pricing.html                           ← pricing page
├── resources.html                         ← resources hub
├── compare.html                           ← compare page
├── seo-templates.html                     ← 9 SEO templates (design canvas)
└── gp-shared.css                          ← shared CSS tokens + components
```

Note: `seo-templates.html` requires `design-canvas.jsx` to render (included in the project root). When opening locally, serve from a local server (`npx serve .`) rather than opening as a file:// URL.
