# Marketing Site Visual Overhaul — Design Spec

**Date:** 2026-07-03
**Status:** Approved direction (Angel, chat 2026-07-03) — see "Decisions"
**Scope owner:** `apps/site` (Astro marketing site) + shared site chrome/tokens in `packages/ui/src/site`. Does **not** touch `apps/web` (the app) or `apps/api`.

## Goal

Raise the perceived quality of the entire GrantPipe marketing site from "competent but flat" to "distinctive and clearly a polished SaaS product," through a coordinated pass over the visual design system (typography, color, spacing, imagery), motion/interactivity, and a set of concrete per-page defects - without damaging SEO or Core Web Vitals.

## Decisions (locked)

1. **Register: refine + distinctive.** Execute the existing "rigorous, humane, earned" direction properly (fix the defects), _and_ add a distinctive expressive layer (bolder hero, activated color, page transitions). At zero paying clients the restrained aesthetic has no earned evidence, so a more memorable site is treated as a cheap experiment, not a risk to avoid.
2. **`/free/` "calculator" pages → rename to match reality.** They are email-capture forms, not interactive calculators. Rename to "worksheet"/"guide"/"kit" (whatever is truthful per page) rather than building real calculators in this effort. Removes the bait-and-switch feel immediately; building real calculators is a separate future project.
3. **Astro ViewTransitions: include.** Adopt `ClientRouter` for app-like page-to-page continuity, with the required re-initialization of vanilla scripts and PostHog on `astro:page-load`.
4. **Structure: one comprehensive overhaul** — a single sequenced effort covering the shared design system first (so every page benefits at once), then per-page-family application and the specific defect fixes.

## Non-negotiable guardrails (SEO / performance / correctness)

These are measurable constraints, not taste:

- **Content is server-rendered and static.** All copy, headings, and structured data remain in the static HTML output. Motion only changes presentation. With JS disabled the full page is present and readable.
- **Animate only `transform` and `opacity`.** These composite off-main-thread and cause zero layout shift. No animating `width`/`height`/`top`/`left`/`margin` on content. (Exception: the dashboard-mock ambient animation is allowed to animate its own decorative sub-elements since they carry no SEO content and are `aria-hidden`.)
- **No animation libraries.** No GSAP/Framer/AOS/Lottie. Reuse the existing ~1KB reveal script. Any unavoidable new client JS ships via `client:idle` or `client:visible`, never `client:load`.
- **`prefers-reduced-motion` is honored for every animated element.** Existing pattern (reveal script + a CSS `@media` block) is extended; a global reduced-motion CSS guard is added so no new animation can escape it.
- **Contract tests stay green.** ~20 test files under `apps/site/src/content-tests/` and `apps/site/src/*.test.ts` grep source literals: schema-builder call names (`buildProductSchema`, `buildSoftwareApplicationSchema`, `buildFaqPageSchema`, etc.), canonical URL strings, trailing-slash internal hrefs (`canonical-internal-links.test.ts`), responsive-prefix requirements on grid/typography utilities (`mobile-first-grid-contract.test.ts`, `mobile-first-typography-contract.test.ts`), 48×48 tap targets + 16px min input font (`mobile-hit-targets-source.test.ts`), and tier copy (`grantpipe-tier-copy-contract.test.ts`). The overhaul must keep every one passing or update them deliberately with justification.
- **CSP allowlist.** Any new third-party host (font, script, media) must be added to `apps/site/public/_headers` `script-src`/`font-src`/`connect-src`/`frame-src` or it is blocked in production. Prefer adding **no** new hosts.
- **Preserve async font loading.** The preconnect + `media="print" onload` swap pattern in `base-layout.astro` stays. If the type scale changes, it changes via tokens/`clamp()`, not by adding blocking font requests.
- **No fabricated numbers.** Animated elements (counters, dashboard mock) may only animate values that are demonstrably real or explicitly labeled "Sample data." No count-up on unverified metrics. (Repo standing rule.)
- **Images:** any new/changed `<img>` gets explicit `width`/`height`, `loading="lazy"` (below the fold), and `decoding="async"`. Prefer WebP/AVIF via `astro:assets` `<Image>` over raw PNG.

## Current-state facts (verified during discovery)

- **Motion today:** essentially none beyond 0.15s hover transitions. No entrance animations, no page transitions.
- **The reveal system already exists and is unused.** `buildScrollRevealScript()` (`packages/ui/src/site/lib/base-layout-scripts.ts`) drives `.scroll-in` → `.visible` with IntersectionObserver, a 1200ms failsafe, and a `prefers-reduced-motion` short-circuit. CSS in `globals.css:902–929` defines the hidden/revealed states plus `:nth-child(2..5)` stagger delays, and `globals.css:1049` disables it under reduced motion. It is wired into **one** page (`paid-search-landing-page.astro`).
- **DashboardMock** (`apps/site/src/components/dashboard-mock.astro`) is fully coded HTML/CSS (`role="img"`, `aria-hidden` internals), not an image: browser chrome, sidebar with restricted-fund bars driven by `--bar: 68%/42%/81%` (CSS gradient in `global.css:1597`), KPI tiles ($1.8M / 3 / 92%), 3 grant rows with stage badges, all under a "Sample data" label. Ochre/gold accent (`--gp-gold-600`) already lives here.
- **Billing toggle** (`apps/site/src/lib/billing-toggle.ts`) swaps pre-rendered `[data-show]` panels via the `hidden` attribute and updates CTA hrefs — a price crossfade is a safe presentational add.
- **Keyframes available** in `globals.css`: `fade-in`, `slide-up`, `scale-in`, `accordion-open`, `slide-in-right`, `shake`, `cta-pulse`, `rise-in`, `drift-in`.
- **Token system** is Tailwind v4 CSS-first (no config file) with `@theme` blocks in `packages/ui/src/site/styles/globals.css`: OKLCH color ramps (`--color-primary-*`, `--color-accent-*`, neutrals), warm-tinted shadows (`--shadow-*`), radii (`--radius-*`), fonts (`--font-heading/body/mono`), button tokens. Per-site theming via `--site-*` overrides generated by `generate-theme-css.ts`.
- **Fonts:** Google Fonts, async-loaded (default Bricolage Grotesque / IBM Plex Sans / IBM Plex Mono; some pages theme to other families).
- **Images:** all PNG in `public/`, plain `<img>`, no `astro:assets` anywhere. Largest on-page screenshots ~94–127KB.
- **Base layout** `packages/ui/src/site/layouts/base-layout.astro` is where global scripts/analytics/reveal are injected — the natural home for the ViewTransitions router and the reduced-motion guard.

## Confirmed defects (from live-build critique)

| #   | Defect                                                                     | Where                  |
| --- | -------------------------------------------------------------------------- | ---------------------- |
| D1  | H1 renders at 5 different sizes across templates (68/64/56/52/38.4px)      | site-wide              |
| D2  | Inverted hierarchy: H1 (38.4px) smaller than the page's own H2s (~48–51px) | `/product/`, `/free/*` |
| D3  | Zero imagery across 8,600px of dense copy                                  | `/books/`              |
| D4  | No feature-comparison table; only two short bullet lists                   | `/compare/*`           |
| D5  | "Calculator" pages are email-capture forms                                 | `/free/*-calculator/`  |
| D6  | Alternating section tints imperceptible (0.982 vs 1.0 srgb)                | long pages             |
| D7  | Accent color barely used (~19 emerald vs ~300 gray uses)                   | site-wide              |
| D8  | Radius family inconsistent (14/18/20px)                                    | cards site-wide        |

## Design approach, by layer

### Layer 1 — Design system (shared; lights up every page)

- **Type scale:** define a fluid `clamp()`-based heading scale in tokens (`--font-size-h1` … with responsive `clamp`), collapse to 2–3 deliberate H1 sizes (primary landing ~`clamp(2.5rem, 5vw, 4.25rem)`; secondary/utility ~`clamp(2rem, 3.5vw, 3rem)`). Replace ad-hoc per-page `text-*` H1 utilities with a shared heading component/class so D1/D2 cannot recur. Must satisfy the mobile-first typography contract (responsive-prefixed or `clamp`).
- **Color activation:** promote the emerald/ochre palette into a reusable set of accent primitives — accent-tinted section eyebrows, icon chips, stat callouts, hairline rules, and list markers — so text-heavy sections have earned color moments (fixes D7). Ochre becomes a genuine secondary accent, not just a dashboard-mock detail.
- **Section rhythm:** deepen the alternating-section tint to a perceptible delta and/or add a hairline top divider token; standardize vertical section padding on a rhythm token (fixes D6).
- **Radii/cards:** unify card radius + shadow into the `--radius-*`/`--shadow-*` scale; one card primitive with consistent hover lift (fixes D8, feeds motion Layer 2).
- **Reduced-motion global guard:** add a single `@media (prefers-reduced-motion: reduce)` block that neutralizes entrance/ambient animation site-wide as a backstop.

### Layer 2 — Motion & interactivity (SEO-safe)

- **Reveal wiring:** apply `.scroll-in` to section wrappers across all page templates (reuses existing machinery; no new JS). Group children so the `:nth-child` stagger reads.
- **Hero entrance:** CSS-only staggered `animation-delay` cascade (eyebrow → H1 → lede → CTAs → mock). LCP headline animates opacity only, <300ms, no transform that delays perceived paint.
- **DashboardMock ambient:** CSS-only — fund bars grow from 0 to their `--bar` targets, KPI tiles settle in, stage badges tick — on load and on first reveal, paused/neutralized under reduced motion. Optional slow state-cycle (grants → funds → reports) with crossfade, paused on hover.
- **Billing toggle:** ~200ms crossfade/slide when `[data-show]` panels switch, instead of instant snap.
- **Card hover:** consistent lift + shadow via the unified card primitive.
- **Header:** subtle shadow/border-appear on scroll; polish mobile drawer open/close easing.
- **FAQ:** unify all FAQ sections on the animated accordion pattern (retire raw snap-open `<details>` where present).
- **Comparison matrix:** row hover highlighting + sticky first column on mobile; keep the existing swipe affordance.

### Layer 3 — Distinctive / expressive

- **ViewTransitions:** add `ClientRouter` in `base-layout.astro`; cross-fade the persistent header/nav; re-init billing toggle, matrix affordance, exit-intent popup, reveal script, and PostHog pageview capture on `astro:page-load`/`astro:after-swap`. Degrades to normal MPA nav with JS off.
- **Expressive hero:** a bolder, more distinctive hero treatment (activated color field, more present motion on the mock) that breaks from generic quiet-B2B-SaaS — scoped so it stays within the CLS/LCP budget.
- **Scroll-driven feature walkthrough** on `/product/` (and optionally homepage): sticky visual column with copy scrolling beside it, the coded mock/screenshot swapping as sections enter view. All copy stays in the DOM (crawlable); only the visual swap is JS (`client:visible`).

### Per-page defect fixes

- **`/product/`:** fix H1 inversion (D2) via the new type scale; add the scroll-driven walkthrough / more visuals.
- **`/books/`:** add coded visuals reusing the dashboard-mock technique (a FASB statement card, chart-of-accounts snippet, reconciliation/audit-trail mock) to break the wall of text (D3).
- **`/compare/*`:** add a real feature-comparison table primitive (D4) with row highlighting; reuse across all vs-pages.
- **`/free/*` calculators:** rename to truthful labels (D5) — copy change; must pass the marketing-copy gate (humanizer → third-grade-copy → zero-lies → fit) and not break `content-*`/tier-copy contract tests.
- **Imagery:** migrate visible screenshots to `astro:assets` `<Image>` + WebP/AVIF + `decoding="async"` (perf; supports "looks premium").

## Cross-page consistency

Long-tail templates (resources, solutions, workflows, integrations, nonprofit-software, compare) must inherit the same shared section/card/hero primitives so they read as the same product as the homepage. The overhaul prioritizes changing **shared** components so the long tail is upgraded without per-page bespoke work wherever possible.

## Observability

Per repo policy, any new interactive capability wires PostHog + Sentry. Concretely: the ViewTransitions router must preserve PostHog pageview capture across soft navigations (verify, don't assume); new interactive elements (feature walkthrough, animated toggle) reuse existing analytics helpers if they add trackable interactions; Sentry already wraps client init. No new donor/funder/PII data enters analytics.

## Coordination / sequencing risk

The in-flight repricing + promo-removal work is actively editing `pricing.astro` and pricing copy/tokens. Any visual work touching the pricing page (billing-toggle animation, plan-card polish, comparison matrix) must land **after** that work merges, or coordinate ordering, to avoid conflicts. The tier-copy and pricing-page-SEO contract tests are the tripwire. All non-pricing layers can proceed independently first.

## Marketing-copy gate

Any user-facing copy changed or added (the `/free/` renames, new section eyebrows, any new headings) must pass, in order: `humanizer` → `third-grade-copy` → zero-lies check against product source of truth → whole-context fit. Applies to the rename and any new persuasive copy; does not apply to code identifiers or dev docs.

## Out of scope

- `apps/web` (the app) and `apps/api`.
- Building real interactive `/free/` calculators (renaming only this pass).
- Price/promo constants and Stripe (owned by the concurrent repricing effort).
- New third-party fonts or scripts that would require CSP changes (avoid unless a decision revisits it).
- Content/SEO copy rewrites beyond what a visual pass and the `/free/` rename require.

## Success criteria

- One consistent H1 scale; no page has H1 < its own H2 (D1/D2 gone).
- `/books/` and other text-only pages have credible visuals (D3).
- Compare pages have real comparison tables (D4).
- `/free/` labels are truthful (D5).
- Section rhythm and accent color are perceptible on long pages (D6/D7); card radii unified (D8).
- Scroll-reveal, hero entrance, dashboard-mock ambient, billing crossfade, and ViewTransitions live site-wide, all reduced-motion-safe.
- Lighthouse: no CLS regression, LCP not worsened, no new render-blocking resources; per-page JS not materially heavier.
- All contract tests green; CSP unchanged; deployed via Wrangler (`grantpipe-site`).
