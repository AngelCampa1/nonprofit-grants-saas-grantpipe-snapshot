# Marketing Site Visual Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Use the smallest capable model per task (mechanical CSS/markup → cheap; ViewTransitions re-init + judgment → standard).

**Goal:** Raise the GrantPipe marketing site's perceived quality via a coordinated design-system + motion + expressive pass over `apps/site`, fixing 8 confirmed defects, without damaging SEO or Core Web Vitals.

**Architecture:** Change **shared** primitives in `packages/ui/src/site` first (type scale, color/accent, section rhythm, card, reduced-motion guard) so every page benefits at once; then wire the existing-but-unused `.scroll-in` reveal system and CSS-only entrance/ambient animation across templates; then add ViewTransitions + the expressive layer; then fix per-page defects. TDD where behavior is testable (tokens, scripts, re-init, contract tests); visual/CSS application verified in the built static site.

**Tech Stack:** Astro 6 (static), Tailwind v4 CSS-first (`@theme`), vanilla TS island scripts, existing IntersectionObserver reveal script, Vitest + Playwright contract tests.

**Design spec:** `docs/superpowers/specs/2026-07-03-marketing-site-visual-overhaul-design.md` (read for full context and guardrails).

---

## Guardrails every task must respect

- Animate only `transform`/`opacity`; content stays in static HTML.
- No animation libraries; new JS `client:idle`/`client:visible` only.
- Every animation honors `prefers-reduced-motion`.
- Keep all `apps/site` contract tests green (schema literals, trailing-slash hrefs, responsive-prefix grid/type utilities, tap targets, tier copy). Run `pnpm --filter @grantpipe/site test` before/after.
- No new CSP host in `apps/site/public/_headers`.
- Preserve async font loading.
- No fabricated numbers; only real or "Sample data"-labeled values animate.
- New/changed `<img>`: `width`/`height` + `decoding="async"`; prefer `astro:assets` `<Image>` + WebP/AVIF.
- Marketing-copy gate (`humanizer` → `third-grade-copy` → zero-lies → fit) on any changed user-facing copy.
- Buttons stay pill-shaped (`rounded-full` / `9999px`).

## Pre-flight

- [ ] **Step 0.1:** `git pull` (repo spans machines). Create worktree per `superpowers:using-git-worktrees` under `.worktrees/site-visual-overhaul`, branch `feat/site-visual-overhaul`, from current `master`. `pnpm install`.
- [ ] **Step 0.2:** Revert the stray `site-static` entry added to `.claude/launch.json` during discovery (leave the file otherwise untouched). Confirm `apps/site/dist/` is gitignored (it is) — do not commit build artifacts.
- [ ] **Step 0.3:** Baseline the gate: run `pnpm --filter @grantpipe/site test` and record which tests pass, so regressions are attributable. Build once (`pnpm --filter @grantpipe/site build`) to confirm a clean baseline and to enable static-serve visual checks.

---

## Phase 1 — Discovery (fills the section-inventory gap; no code changes)

Two structural deep-dives did not complete during planning; this phase recovers that data cheaply before touching templates.

- [ ] **Task 1.1 — Template & component census.** Dispatch a read-only exploration sub-agent (cheap model) to produce, with file:line refs: (a) every page template family under `apps/site/src/pages/` and the layout each uses; (b) the top ~8 most-reused shared section/hero/card/CTA components across templates (usage counts) — these are the highest-leverage change points; (c) which pages currently render `<img>` screenshots (candidates for `astro:assets`); (d) which FAQ pattern each page uses (animated accordion vs native `<details>`); (e) every place an H1 size is set via a `text-*` utility (targets for the type-scale migration). Save the census to `docs/superpowers/notes/2026-07-03-site-visual-census.md`. No source edits.
- [ ] **Task 1.2 — Contract-test map.** Sub-agent lists each `apps/site` contract test and the exact literals/patterns it pins (schema calls, hrefs, class patterns, copy). Append to the census file. Every later task checks its edits against this map.

---

## Phase 2 — Shared design system (lights up every page)

### Task 2.1 — Fluid heading type scale (fixes D1/D2)

**Files:**

- Modify: `packages/ui/src/site/styles/globals.css` (`@theme` + heading classes)
- Create/modify: a shared heading utility or `.gp-h1`/`.gp-h2` classes (follow existing `gp-*` convention)
- Test: `apps/site/src/mobile-first-typography-contract.test.ts` must stay green; add a new token test if a helper computes sizes.

- [ ] **Step 1:** Write/extend a failing test asserting the site exposes a single canonical H1 scale token/class and that primary vs secondary H1 sizes are defined via `clamp()` (responsive-safe). If the scale is pure CSS with no JS helper, assert via a source-content test that page templates use the shared class rather than ad-hoc `text-6xl`/`text-4xl` on H1s (extend the existing typography contract).
- [ ] **Step 2:** Run it; confirm it fails.
- [ ] **Step 3:** Add `--font-size-h1-primary: clamp(2.5rem, 5vw, 4.25rem)` and `--font-size-h1-secondary: clamp(2rem, 3.5vw, 3rem)` (tune to design), plus `.gp-h1`/`.gp-h1--secondary`/`.gp-h2` classes using them. Ensure H2 is always visually below H1.
- [ ] **Step 4:** Run test; confirm pass.
- [ ] **Step 5:** Commit.

### Task 2.2 — Migrate page H1/H2s to the scale (completes D1/D2)

**Files:** all templates found in Task 1.1(e) — notably `product.astro`, `free/*` pages, `about.astro`, `resources/*`, `books.astro`, `compare/*`.

- [ ] **Step 1:** For each template, replace ad-hoc H1/H2 sizing utilities with the shared classes. `/product/` and `/free/*` H1s must become the primary (largest) size, resolving the inversion.
- [ ] **Step 2:** Run `pnpm --filter @grantpipe/site test` (typography + canonical-links + any page contract). Fix fallout (e.g., a test pinning a bare `text-*` class → update deliberately).
- [ ] **Step 3:** Build; static-serve; spot-check H1 > H2 on `/product/` and one `/free/` page via computed styles.
- [ ] **Step 4:** Commit.

### Task 2.3 — Color/accent activation (fixes D7)

**Files:** `packages/ui/src/site/styles/globals.css`; a small set of accent primitives (eyebrow, icon chip, stat callout, hairline rule, list marker) as `gp-*` classes.

- [ ] **Step 1:** Define accent primitive classes using existing `--color-primary-*` (emerald) and `--color-accent-*` (ochre) ramps — e.g. `.gp-eyebrow--accent`, `.gp-stat-callout`, `.gp-rule--accent`, `.gp-marker--accent`. Keep contrast AA.
- [ ] **Step 2:** Apply them to text-heavy sections on homepage, `/product/`, `/books/` so accent appears beyond CTAs. No copy change.
- [ ] **Step 3:** Build; static-serve; verify accent now appears in section markers/callouts (computed color sampling). Contract tests green.
- [ ] **Step 4:** Commit.

### Task 2.4 — Section rhythm + card/radius unification (fixes D6/D8)

**Files:** `packages/ui/src/site/styles/globals.css`, `apps/site/src/styles/global.css`.

- [ ] **Step 1:** Deepen the alternating-section tint to a perceptible delta (or add a hairline top-divider token); standardize section vertical padding on a rhythm token.
- [ ] **Step 2:** Unify card radius to `--radius-lg` and shadow to a single `--shadow-card`; create/confirm one `.gp-card` primitive with a consistent hover lift (feeds Task 3.4).
- [ ] **Step 3:** Update card usages to the primitive where they diverge (14/18/20px → token).
- [ ] **Step 4:** Build; static-serve; confirm section bands are visually distinct and card radii consistent. Tests green. Commit.

### Task 2.5 — Global reduced-motion backstop

**Files:** `apps/site/src/styles/global.css` (or `globals.css`).

- [ ] **Step 1:** Add a `@media (prefers-reduced-motion: reduce)` block that neutralizes entrance/ambient animations site-wide (belt-and-suspenders alongside per-component guards and the reveal script's own check).
- [ ] **Step 2:** Build; verify under emulated reduced motion that animated elements are shown in final state (no motion). Commit.

---

## Phase 3 — Motion & interactivity (SEO-safe)

### Task 3.1 — Wire the existing scroll-reveal across templates

**Files:** page templates + shared section components (from Task 1.1(b)). No JS changes — `buildScrollRevealScript` already runs (`enableScrollReveal` default true).

- [ ] **Step 1:** Add `.scroll-in` to section wrappers across templates; group staggered children so the `:nth-child(2..5)` delays read. Prefer editing shared section components so many pages update at once.
- [ ] **Step 2:** Build; static-serve; scroll pages and confirm sections reveal, and that with reduced motion / JS-off everything is fully visible (the `:root.js` gating already guarantees no-JS shows content). Tests green.
- [ ] **Step 3:** Commit.

### Task 3.2 — Hero entrance stagger (CSS-only)

**Files:** homepage hero in `apps/site/src/pages/index.astro` (+ hero styles).

- [ ] **Step 1:** Add a staggered `animation-delay` cascade (eyebrow → H1 → lede → CTAs → mock) using existing `fade-in`/`slide-up` keyframes. **LCP headline animates opacity only (start ≥0.4→1), <300ms, no transform** so perceived paint isn't delayed. Guard with reduced-motion.
- [ ] **Step 2:** Build; measure with the static serve that hero content paints promptly; confirm no CLS (elements reserve space). Commit.

### Task 3.3 — DashboardMock ambient animation (CSS-only)

**Files:** `apps/site/src/components/dashboard-mock.astro`, `apps/site/src/styles/global.css` (`.gp-dashboard-*`).

- [ ] **Step 1:** Animate the `aria-hidden` internals only: fund bars grow from 0 to their `--bar` targets (animate a registered `@property --bar` or an inner width transform), KPI tiles settle in, stage badges tick. Trigger on first reveal. Values stay "Sample data"-labeled — no fabrication. Reduced-motion → render final state immediately.
- [ ] **Step 2:** Build; static-serve; confirm the mock animates once and looks intentional; reduced-motion shows the filled final state. Commit.

### Task 3.4 — Card hover + billing-toggle crossfade + header scroll + FAQ unify + matrix polish

Small, independent presentational enhancements — implement as separate commits.

- [ ] **3.4a Card hover:** apply the unified `.gp-card` hover lift everywhere. Build-verify. Commit.
- [ ] **3.4b Billing toggle:** in `billing-toggle.ts`/its CSS, add a ~200ms opacity crossfade when `[data-show]` panels switch (respect reduced motion). Keep the `hidden`-attribute logic and existing keyboard/aria behavior intact; the toggle unit tests must stay green. **Sequence after the repricing work merges (see Phase 6).** Commit.
- [ ] **3.4c Header:** shadow/border appears on scroll (tiny scroll listener or CSS `:has`/sticky technique, `client:idle` if JS). Polish mobile drawer easing. Build-verify. Commit.
- [ ] **3.4d FAQ:** unify remaining native snap-open `<details>` onto the animated accordion pattern (`accordion-open` keyframe / `ViewportAwareDetails`). Keep FAQPage schema + copy literals intact (contract tests). Commit.
- [ ] **3.4e Matrix:** add row hover highlighting + sticky first column on mobile to `feature-comparison-matrix.astro`; keep the swipe-affordance script. Build-verify at 390px. Commit.

---

## Phase 4 — Distinctive / expressive layer

### Task 4.1 — Astro ViewTransitions (ClientRouter)

**Files:** `packages/ui/src/site/layouts/base-layout.astro`; re-init wiring for island scripts + analytics.
**Test:** a script test asserting each vanilla initializer is idempotent and re-runs on `astro:page-load`.

- [ ] **Step 1:** Write a failing test that the re-init entrypoint re-runs `initBillingToggle`, matrix affordance init, exit-intent setup, and the reveal script on `astro:page-load` without double-binding (idempotency).
- [ ] **Step 2:** Run; confirm fail.
- [ ] **Step 3:** Add `<ClientRouter />` to `base-layout.astro`. Wrap all `DOMContentLoaded`-style initializers so they also fire on `astro:page-load`; ensure listeners are not duplicated across swaps (dataset guards). Ensure PostHog captures a pageview on soft navigation (`astro:after-swap` / router hook) — verify, don't assume.
- [ ] **Step 4:** Run; confirm pass.
- [ ] **Step 5:** Build; static-serve; navigate between pages: header cross-fades, no double-init, exit popup/toggle/matrix still work, no JS console errors. With JS off, navigation still works (MPA fallback). Commit.

### Task 4.2 — Expressive hero + scroll-driven feature walkthrough

**Files:** `index.astro` hero; `product.astro` (walkthrough); a `client:visible` island for the visual swap.

- [ ] **Step 1:** Elevate the hero (activated color field, more present mock motion) within CLS/LCP budget — no large raster, keep the coded mock.
- [ ] **Step 2:** Build a sticky-visual feature walkthrough on `/product/`: copy blocks stay in the DOM (crawlable), a sticky column swaps the coded mock/screenshot as each block enters view (IntersectionObserver, `client:visible`, reduced-motion → static).
- [ ] **Step 3:** Build; verify crawlable copy present in static HTML, walkthrough works, reduced-motion/no-JS shows a sensible static stack. Tests green. Commit.

---

## Phase 5 — Per-page defect fixes + imagery

### Task 5.1 — `/books/` visuals (D3)

- [ ] Add coded visuals reusing the dashboard-mock technique (FASB statement card, chart-of-accounts snippet, reconciliation/audit-trail mock), `aria-hidden` decorative, no fabricated figures (label sample data). Build-verify the wall of text is broken up. Commit.

### Task 5.2 — Compare feature-comparison table (D4)

- [ ] Create a reusable comparison-table primitive (GrantPipe vs competitor, feature rows, check/x cells, row hover) and use it across `compare/*` vs-pages. Keep each page's schema calls + canonical + copy literals intact (contract tests). Ensure responsive-prefixed grid/table classes. Build-verify at desktop + 390px. Commit.

### Task 5.3 — `/free/` truthful rename (D5) — RESOLVED: no rename; premise was false

- [x] **Verified the D5 premise against source and found it factually incorrect — no rename performed.** D5 asserted the `free/*` "calculator" pages are "email-capture forms, not interactive calculators" (bait-and-switch). Source inspection disproves this: all six pages mount live `client:load` islands that compute and **display** real results in-browser, ungated:
  - `crm-cost-calculator.tsx` — `calculateTco()` renders a full 3-year TCO table (year 1/2/3 totals, three-year total, savings) live from the input state; no email required to see it.
  - `questionnaire-shell.tsx` (the shared `<Assessment>`) — renders the scored result heading, summary, recommended next steps, and a trial CTA on the result screen; the email form is an **optional** "Get your full report by email" companion-PDF capture *below* the already-shown result, not a gate.
  - The `lead-magnets/*.md` content entries corroborate: title "Nonprofit CRM Cost Calculator", bluf "Use this alongside **the interactive calculator**…"; the PDF is a *companion guide*.
  Because the names already match reality, renaming to "worksheet/guide/kit" would (a) introduce a lie (violating the zero-lies gate) and (b) destroy the exact-match SEO target keywords (`nonprofit crm cost calculator`, etc.) that `internal-link-graph`, `lead-magnet-delivery`, `paid-landing-pages`, and `program-allocation-marketing` contract tests pin. Success criterion "/free labels are truthful" is **already satisfied**. No copy or URL change; no gate to run.

### Task 5.4 — Imagery pipeline (perf/premium)

- [ ] Migrate visible screenshot `<img>`s to `astro:assets` `<Image>` with WebP/AVIF output, explicit dimensions, `decoding="async"`, `loading="lazy"` below the fold. Do not touch OG images (crawler-only). Build; confirm smaller transfer + no CLS. Commit.

### Task 5.5 — Long-tail consistency sweep

- [ ] Confirm resources/solutions/workflows/integrations/nonprofit-software templates inherited the shared primitives (type scale, cards, reveal, accent). Fix any template still using bespoke/old styling so it matches the flagship. Build-verify a sample of each family. Commit.

---

## Phase 6 — Coordination, review, ship

- [ ] **Task 6.1 — Sequence pricing-touching work.** Anything editing `pricing.astro`/plan cards/billing toggle/matrix (Task 3.4b, 3.4e, and any pricing-page reveal wiring) lands **after** the in-flight repricing + promo-removal effort merges. Rebase the worktree onto `master` once that lands; resolve conflicts (expect `pricing.astro`). Re-run the pricing + tier-copy contract tests.
- [ ] **Task 6.2 — Full gate.** `turbo typecheck` and `pnpm --filter @grantpipe/site test` (use `--force` after the rebase to defeat stale turbo cache). All green. Build clean.
- [ ] **Task 6.3 — Perf check.** Against the static build, confirm no CLS regression, LCP not worsened, no new render-blocking resources, per-page JS not materially heavier, CSP unchanged.
- [ ] **Task 6.4 — Review.** Full review of the branch via the active runtime's permitted review path (spec-compliance then code-quality per subagent-driven-development). Fix every finding.
- [ ] **Task 6.5 — Merge & deploy.** Merge to `master`, remove the worktree, deploy `grantpipe-site` via the Wrangler script (`pnpm run deploy:site`). Watch for the known transient post-deploy 404 (poll grantpipe.com before any rollback).
- [ ] **Task 6.6 — Prod verification.** On production: H1 scale consistent and no inversion on `/product/`; `/books/` has visuals; compare pages have tables; `/free/` labels truthful; reveal/hero/mock/toggle animations run and respect reduced motion; ViewTransitions cross-fade pages without breaking toggle/popup/matrix; PostHog still records pageviews across soft nav.

---

## Self-review notes

- Spec defects D1–D8 each map to a task: D1/D2→2.1+2.2, D3→5.1, D4→5.2, D5→5.3, D6/D8→2.4, D7→2.3.
- Motion tiers map: reveal→3.1, hero→3.2/4.2, mock→3.3, toggle→3.4b, ViewTransitions→4.1, walkthrough→4.2.
- Every animated task names its reduced-motion behavior and the transform/opacity-only constraint.
- Pricing-page conflict is isolated to Phase 6 sequencing + tasks 3.4b/3.4e.
- Copy changes (5.3) route through the marketing-copy gate.
