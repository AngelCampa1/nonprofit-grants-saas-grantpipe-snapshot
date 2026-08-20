# Marketing Site Visual Unification & Elevation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the marketing site's two competing CSS systems into one token-enforced system (single type ramp, spacing scale, container), retire era-named classes, fix concrete overflow defects, and elevate the flat sections so grantpipe.com is coherent and visually striking.

**Architecture:** Enforce scales in the token layer (`packages/ui/src/site/styles/globals.css` + `apps/site/src/styles/global.css`), promote the newer class family to canonical while deleting the older family, then rename survivors off the `-redesign` suffix. Pages/components are ported to the unified vocabulary in lockstep. A Vitest guard test written first (TDD) locks the end state. Verification is via the static build (`astro build` prerenders ~1669 pages) + programmatic DOM assertions, since full-page screenshots are unreliable (the live AI-CS widget blocks network-idle).

**Tech Stack:** Astro 5, Tailwind CSS 4, custom `--gp-*`/`--text-*`/`--radius-*` design tokens, Vitest, static prerender in `dist/client`.

**Companion spec:** `docs/superpowers/specs/2026-07-03-marketing-site-visual-unification-design.md`

---

## Execution setup (before Task 1)

- Create an isolated worktree via the `superpowers:using-git-worktrees` skill, under `.worktrees/` inside the repo (e.g. `.worktrees/site-visual-unification`), branched from `master`. All work happens there.
- Run `git pull` on `master` before branching (multi-machine repo).
- Bring up verification: `pnpm --filter @grantpipe/site build` then serve `apps/site/dist/client` on a static port (`python -m http.server 4455 --directory apps/site/dist/client`) for DOM assertions. Rebuild per wave.

## File structure (what changes and why)

**Token / system layer**

- `packages/ui/src/site/styles/globals.css` — canonical `--text-*`, `--radius-*`, `--shadow-*`, `--component-gap-*` tokens; add `--gp-space-*`, `--gp-container-*`. Shared across sibling sites — change additively; do not alter non-GrantPipe tenants' resolved values.
- `packages/ui/src/site/lib/generate-theme-css.ts` — `--gp-*` alias definitions; fix `--gp-rad-lg` mismap.
- `apps/site/src/styles/global.css` — the bulk of marketing CSS (~3065 lines); where the two class families live and where retirement/rename happens.

**Shared site chrome (`packages/ui/src/site`)**

- `components/site-header.astro` — desktop nav overflow fix.
- `hubs/*.astro`, `layouts/*.astro` — inherit the unified tokens; audit for retired-class usage.

**Marketing components (`apps/site/src/components`)**

- `final-cta.astro`, `product-proof-section.astro`, `grant-recipient-category-page.astro` (shared SEO template — highest leverage), `explainer-video.astro` (poster clipping fix), `pricing-plan-cards.astro`, `dashboard-mock.astro`, `feature-comparison-matrix.astro`.

**Pages (`apps/site/src/pages`)** — consumers to port: `index.astro`, `product.astro`, `pricing.astro`, `grant-compliance-software.astro`, `grant-tracking-software.astro`, `restricted-fund-tracking-software.astro`, `nonprofit-software/index.astro`, `solutions/index.astro`, `compare/**`, `resources/**`.

**Tests**

- New: `apps/site/src/style-tests/visual-system-guard.test.ts`.
- Update selectors where class names change: `components/pricing-plan-cards-source.test.ts`, `components/comparison-table-source.test.ts`, `components/product-proof-section-source.test.ts`, `components/grant-recipient-category-page.test.ts`.

---

## WAVE 1 — Foundation

### Task 1: Visual-system guard test (write first, red)

**Files:**

- Create: `apps/site/src/style-tests/visual-system-guard.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SITE_SRC = join(__dirname, "..");
const GLOBAL_CSS = join(SITE_SRC, "styles/global.css");

function walk(dir: string, exts: string[], acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "node_modules" || name === "dist") continue;
    if (statSync(p).isDirectory()) walk(p, exts, acc);
    else if (exts.some((e) => name.endsWith(e))) acc.push(p);
  }
  return acc;
}

describe("visual system unification guard", () => {
  const files = walk(SITE_SRC, [".astro", ".tsx", ".ts", ".css"]).filter(
    (f) => !f.endsWith(".test.ts"),
  );

  it("has no era-word class names (`-redesign`)", () => {
    const offenders = files.filter((f) => /-redesign\b/.test(readFileSync(f, "utf8")));
    expect(offenders, `files still using -redesign: ${offenders.join(", ")}`).toEqual([]);
  });

  it("does not reference the retired .gp-page-shell container", () => {
    const offenders = files.filter((f) => /gp-page-shell/.test(readFileSync(f, "utf8")));
    expect(offenders, `files still using .gp-page-shell: ${offenders.join(", ")}`).toEqual([]);
  });

  it("does not reference retired old-family card classes", () => {
    const retired =
      /gp-(proof-card|directory-card|link-card|band-card|editorial-card|resource-card)\b/;
    const offenders = files.filter((f) => retired.test(readFileSync(f, "utf8")));
    expect(offenders, `files still using retired card classes: ${offenders.join(", ")}`).toEqual(
      [],
    );
  });

  it("defines the spacing scale and container tokens", () => {
    const css = readFileSync(GLOBAL_CSS, "utf8");
    expect(css).toMatch(/--gp-space-4:/);
    expect(css).toMatch(/--gp-container-max:/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @grantpipe/site test -- visual-system-guard`
Expected: FAIL — `-redesign` offenders present, tokens not yet defined.

- [ ] **Step 3: Commit the red test**

```bash
git add apps/site/src/style-tests/visual-system-guard.test.ts
git commit -m "test(site): add visual-system unification guard (red)"
```

### Task 2: Spacing scale + container tokens

**Files:**

- Modify: `apps/site/src/styles/global.css` (top token block, near line 34)

- [ ] **Step 1: Add the token definitions** under `body[data-site-name="GrantPipe"]` (so they scope to GrantPipe only):

```css
body[data-site-name="GrantPipe"] {
  --primary-button-radius: var(--radius-full);
  --secondary-button-radius: var(--radius-full);

  /* Single spacing scale (4px base) — every gap/padding/margin references a step. */
  --gp-space-1: 0.25rem;
  --gp-space-2: 0.5rem;
  --gp-space-3: 0.75rem;
  --gp-space-4: 1rem;
  --gp-space-5: 1.5rem;
  --gp-space-6: 2rem;
  --gp-space-7: 3rem;
  --gp-space-8: 4rem;

  /* Single container. Replaces the 1152 (.gp-page-shell) vs 1240 (.gp-wrap) drift. */
  --gp-container-max: 75rem;
  --gp-container-gutter: 1.5rem;
}
```

- [ ] **Step 2: Point `.gp-wrap` at the tokens** (replace the hardcoded `min(100% - 56px, 1240px)`):

```css
.gp-wrap {
  width: min(100% - (2 * var(--gp-container-gutter)), var(--gp-container-max));
  margin-inline: auto;
}
```

- [ ] **Step 3: Rebuild + assert token presence.** Run `pnpm --filter @grantpipe/site build` (or `test -- visual-system-guard` for the token assertion). Expected: the "defines the spacing scale and container tokens" assertion now PASSES.

- [ ] **Step 4: Commit**

```bash
git add apps/site/src/styles/global.css
git commit -m "feat(site): add single spacing scale + container tokens"
```

### Task 3: Type ramp — bind every heading to `--text-*` tokens

**Files:**

- Modify: `apps/site/src/styles/global.css` (all heading-bearing classes)

Goal: eliminate class-local hero/section/card font-sizes; route them through the shared `--text-*` tokens. `.gp-section-head` is the reference (`h1{font-size:var(--text-hero)} h2{font-size:var(--text-editorial-title)}`).

- [ ] **Step 1: Replace class-local heading sizes with tokens.** Concretely, edit these declarations (current → token):
  - `.gp-hero-title` `font-size: clamp(3rem,7vw,5.6rem)` → `font-size: var(--text-hero)`
  - `.gp-page-title` `clamp(2.5rem,5vw,4rem)` → `var(--text-hero)`
  - `.gp-section-title` `clamp(2rem,3.8vw,3.5rem)` → `var(--text-editorial-title)`
  - `.gp-section-heading` `clamp(1.8rem,2.4vw,2.5rem)` → `var(--text-heading)`
  - `.gp-band-title` `clamp(2rem,4vw,3.4rem)` → `var(--text-editorial-title)`
  - `.gp-compact-cta h2` `1.8rem` → `var(--text-heading)`
  - `.gp-shared-cta-shell h2` `clamp(1.7rem,3vw,2.25rem)` → `var(--text-heading)`
  - `.gp-card-title` `1.55rem` → `var(--text-subheading)`
  - `.gp-card-redesign h3, .gp-plan-card-redesign h3, .gp-alt-card h3, .gp-resource-redesign h3` `22px` → `var(--text-subheading)`
  - `.gp-link-card-title` `1.15rem` → `var(--text-subheading)`
  - `.gp-hero-redesign h1` `clamp(40px,5.6vw,68px)` → `var(--text-hero)`

- [ ] **Step 2: Rebuild and assert heading consistency via DOM.** Serve the static build; run this in the preview/eval or a node+puppeteer check across home, pricing, `/grant-management-software`, `/compare/grantpipe-vs-bloomerang`:

```js
// For each page: collect distinct h1 sizes — must be ONE value site-wide.
[...document.querySelectorAll("h1")].map((h) => getComputedStyle(h).fontSize);
```

Expected: every page's `h1` resolves to the same `--text-hero` computed value (was 40.5/51.2/64/68px → now one value); no semantic `h2` renders at 16px/400.

- [ ] **Step 3: Commit**

```bash
git add apps/site/src/styles/global.css
git commit -m "feat(site): bind all headings to the shared type-scale tokens"
```

### Task 4: Retire `.gp-page-shell`; converge on `.gp-wrap` + `.gp-section`

**Files:**

- Modify: `apps/site/src/pages/nonprofit-software/index.astro`
- Modify: `apps/site/src/pages/solutions/index.astro`
- Modify: `apps/site/src/styles/global.css` (delete `.gp-page-shell` rule after consumers are ported)

- [ ] **Step 1:** In each of the two pages, replace the `.gp-page-shell` wrapper with `<div class="gp-wrap">` and wrap content sections in `<section class="gp-section">`. Preserve all inner markup and copy verbatim.
- [ ] **Step 2:** Delete the `.gp-page-shell` rule block from `global.css`.
- [ ] **Step 3:** Run `pnpm --filter @grantpipe/site test -- visual-system-guard`. Expected: "does not reference the retired .gp-page-shell container" PASSES.
- [ ] **Step 4: Commit**

```bash
git add apps/site/src/pages/nonprofit-software/index.astro apps/site/src/pages/solutions/index.astro apps/site/src/styles/global.css
git commit -m "refactor(site): retire .gp-page-shell, converge on .gp-wrap"
```

### Task 5: Radius/shadow cleanup + `--gp-rad-lg` fix

**Files:**

- Modify: `packages/ui/src/site/lib/generate-theme-css.ts`
- Modify: `apps/site/src/styles/global.css`

- [ ] **Step 1:** In `generate-theme-css.ts`, change `--gp-rad-lg` to alias `--radius-lg` (currently `--radius-md`). Grep for `gp-rad-lg` consumers first; if any relied on the smaller value, set them to `--gp-rad` explicitly so their rendered radius is unchanged.
- [ ] **Step 2:** In `global.css`, replace ad-hoc shadow strings on card-family classes (e.g. `0 16px 34px -28px rgba(42,31,24,0.18)` on `.gp-directory-card`, `0 18px 40px -28px …` on `.gp-stage-*`) with `--shadow-card` / `--shadow-md` / `--shadow-lg`. Keep visual weight close; prefer `--shadow-card` for resting cards, `--shadow-lg` for elevated/hover.
- [ ] **Step 3:** Rebuild; spot-check home + a category page render (no broken shadows/radii).
- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/site/lib/generate-theme-css.ts apps/site/src/styles/global.css
git commit -m "fix(ui): correct --gp-rad-lg alias; use shadow scale on marketing cards"
```

---

## WAVE 2 — Component unification + rename

### Task 6: One card primitive

**Files:**

- Modify: `apps/site/src/styles/global.css`

- [ ] **Step 1:** Make `.gp-card` the single card surface built on `.gp-card-base` (border `--gp-ink-100`, radius `--radius-lg`, background `--gp-card`, shadow `--shadow-card`, padding `var(--gp-space-6)`), with `.feature` (tinted emerald) and `.interactive` (hover-lift + focus ring) modifiers. Fold the distinct paddings/backgrounds of `.gp-proof-card`, `.gp-editorial-card`, `.gp-resource-card`, `.gp-band-card`, `.gp-directory-card`, `.gp-link-card` into `.gp-card` + modifiers.
- [ ] **Step 2:** Keep the retired class _selectors_ temporarily aliased to the new rules (e.g. `.gp-proof-card { @apply … }` or shared selector list) ONLY within this task so pages still render; consumers are ported in Wave 3, after which the aliases and old selectors are deleted (Task 12).
- [ ] **Step 3:** Rebuild; verify home proof cards + a directory hub still render correctly.
- [ ] **Step 4: Commit** `refactor(site): unify card surfaces onto .gp-card + modifiers`

### Task 7: One hero primitive

**Files:**

- Modify: `apps/site/src/styles/global.css`

- [ ] **Step 1:** Define `.gp-hero` (from `.gp-hero-redesign` rules: `.gp-hero-grid`, `.gp-hero h1`→`--text-hero`, `.gp-hero-lede`, `.gp-hero-actions`). Keep `.gp-hero-redesign` selector working via shared selector list until index.astro is ported in Task 10.
- [ ] **Step 2:** Rebuild; verify homepage hero unchanged.
- [ ] **Step 3: Commit** `refactor(site): define canonical .gp-hero`

### Task 8: One plan card

**Files:**

- Modify: `apps/site/src/styles/global.css`
- Modify: `apps/site/src/components/pricing-plan-cards.astro`
- Modify: `apps/site/src/components/pricing-plan-cards-source.test.ts`

- [ ] **Step 1:** Define `.gp-plan-card` from `.gp-plan-card-redesign` rules. Update `pricing-plan-cards.astro` markup to `.gp-plan-card` / `.gp-plan-card.is-popular`.
- [ ] **Step 2:** Update the source test's expected class strings to `.gp-plan-card`.
- [ ] **Step 3:** Run `pnpm --filter @grantpipe/site test -- pricing-plan-cards-source`. Expected: PASS.
- [ ] **Step 4: Commit** `refactor(site): canonical .gp-plan-card`

### Task 9: Port home / product / pricing to unified classes

**Files:**

- Modify: `apps/site/src/pages/index.astro`, `apps/site/src/pages/product.astro`, `apps/site/src/pages/pricing.astro`
- Modify: `apps/site/src/components/final-cta.astro`, `apps/site/src/components/product-proof-section.astro`, `apps/site/src/components/product-proof-section-source.test.ts`

- [ ] **Step 1:** In each file, replace old-family classes with the unified ones per this map: `gp-hero-title/gp-hero-shell/gp-hero-main`→`gp-hero`; `gp-proof-card/gp-editorial-card/gp-band-card`→`gp-card` (+`.feature` where tinted); `gp-section-title/gp-band-title/gp-page-header`→`gp-section-head`; `gp-card-grid`→existing grid utility on `.gp-card` set. Preserve all copy and semantics.
- [ ] **Step 2:** Update `product-proof-section-source.test.ts` selectors to match.
- [ ] **Step 3:** Rebuild; DOM-assert home/product/pricing: one `h1` size, no retired card class present (`document.querySelector('.gp-proof-card')===null`).
- [ ] **Step 4:** Run `pnpm --filter @grantpipe/site test -- product-proof-section-source`. Expected: PASS.
- [ ] **Step 5: Commit** `refactor(site): port home/product/pricing to unified system`

---

## WAVE 3 — Port remaining templates

> Porting mechanic (identical for every task below): for each listed file, (a) grep it for retired classes, (b) replace per the Wave-2 map, (c) preserve copy/semantics, (d) rebuild, (e) DOM-assert the page has no retired class and one `h1` size, (f) update any co-located `*-source.test.ts`, (g) commit.

### Task 10: Shared SEO/category template

**Files:** `apps/site/src/components/grant-recipient-category-page.astro`, `apps/site/src/components/grant-recipient-category-page.test.ts`, and the software pages that render it: `grant-compliance-software.astro`, `grant-tracking-software.astro`, `restricted-fund-tracking-software.astro`.

- [ ] Apply the porting mechanic. This template is highest-leverage (drives many pages). Update `grant-recipient-category-page.test.ts` selectors.
- [ ] Verify `/grant-management-software`, `/grant-compliance-software`, `/grant-tracking-software`, `/restricted-fund-tracking-software`, `/subrecipient-monitoring-software`, `/auditor-funder-portal-software` each: no retired class, one `h1` size.
- [ ] Commit `refactor(site): port SEO category template to unified system`

### Task 11: Compare + resources templates

**Files:** `apps/site/src/pages/compare/alternatives/[slug].astro`, `compare/pricing/[slug].astro`, `compare/versus/[slugA]-vs-[slugB].astro`, `compare/grantpipe-vs-bloomerang.astro`, `compare/grantpipe-vs-submittable.astro`, `compare/index.astro`, `resources/index.astro`, `resources/videos.astro`, `resources/benchmarks/index.astro`, `resources/best/[...page].astro`, `resources/faq/index.astro`, `resources/guides/[...page].astro`, `resources/reference.astro`, `resources/topics/[slug].astro`, `resources/topics/index.astro`, `nonprofit-software/index.astro`, `solutions/index.astro`.

- [ ] Apply the porting mechanic to each. Commit in logical groups (compare, then resources, then hubs) with `refactor(site): port <group> to unified system`.

### Task 12: Delete the old family + apply the rename map

**Files:** `apps/site/src/styles/global.css`; any remaining consumers surfaced by the guard test.

- [ ] **Step 1:** Delete the now-unused old-family rule blocks (`.gp-hero-title`, `.gp-page-title`, `.gp-section-title`, `.gp-proof-card`, `.gp-directory-card`, `.gp-link-card`, `.gp-band-card`, `.gp-editorial-card`, `.gp-resource-card`, temporary aliases from Tasks 6–7).
- [ ] **Step 2:** Rename survivors off `-redesign` across `global.css` AND all consumers: `.gp-card-redesign`→`.gp-card`, `.gp-hero-redesign`→`.gp-hero`, `.gp-plan-card-redesign`→`.gp-plan-card`, `.gp-resource-redesign`→`.gp-resource`, `.gp-card-grid-redesign`/`.gp-pricing-grid-redesign`→clean names. Use a grep-driven sweep; update every `.astro`/`.tsx` hit.
- [ ] **Step 3:** Run `pnpm --filter @grantpipe/site test -- visual-system-guard`. Expected: all four assertions PASS (no `-redesign`, no `.gp-page-shell`, no retired cards, tokens present).
- [ ] **Step 4: Commit** `refactor(site): delete old class family; rename survivors off -redesign`

---

## WAVE 4 — Defect fixes

### Task 13: Header nav overflow

**Files:** `packages/ui/src/site/components/site-header.astro`

- [ ] **Step 1:** Reproduce: build, serve, assert on any page `const n=document.querySelector('header nav ul, header .lg\\:flex'); n.scrollWidth <= n.clientWidth`. Currently 635 > 454.
- [ ] **Step 2:** Fix the desktop nav layout so primary links + dropdown triggers fit: correct the flex container's available width (it is being boxed to ~454px), reduce inter-item gap to a `--gp-space-*` step, and/or allow the nav to consume the row's free space. Do not drop nav items.
- [ ] **Step 3:** Rebuild; assert `scrollWidth <= clientWidth` at 1024 / 1280 / 1440.
- [ ] **Step 4: Commit** `fix(ui): stop desktop nav list overflowing its container`

### Task 14: Explainer-video poster clipping

**Files:** `apps/site/src/components/explainer-video.astro`

- [ ] **Step 1:** Reproduce on `/grant-management-software`: `.gp-explainer-video__poster-grid` scrollWidth 397 > clientWidth 335; badge cells clip "Reports Queued"/"Queued".
- [ ] **Step 2:** Fix the poster grid so labels fit: use `minmax(0,1fr)` columns, allow wrap, bind badge text to `--text-label`, add `min-width:0` / `overflow-wrap` on cells.
- [ ] **Step 3:** Rebuild; assert `poster-grid.scrollWidth <= clientWidth` and each badge `scrollWidth <= clientWidth`.
- [ ] **Step 4: Commit** `fix(site): explainer-video poster no longer clips labels`

### Task 15: Semantic-H2-as-body remaps

**Files:** surfaced by DOM scan (candidates: `pricing.astro`, category template, wherever an `<h2>` renders at 16px/400).

- [ ] **Step 1:** Build + scan every page: `[...document.querySelectorAll('h2')].filter(h=>parseFloat(getComputedStyle(h).fontSize)<20).map(h=>({t:h.textContent.slice(0,30),cls:h.className}))`. Record locations.
- [ ] **Step 2:** For each, either re-tag to the correct semantic level (e.g. `<p class="gp-eyebrow-pill">`/`<span>`) or bind to the correct role token — so heading order matches visual order.
- [ ] **Step 3:** Rebuild; assert no `h2` resolves below the subheading token size across pages.
- [ ] **Step 4: Commit** `fix(site): correct mis-leveled headings to match visual hierarchy`

---

## WAVE 5 — Elevation

> These are design tasks: implement, then judge the result against "rigorous, humane, earned" via rendered spot-checks. Each gets its own sub-agent with an explicit UX-critique step.

### Task 16: SEO/category template rhythm

**Files:** `apps/site/src/components/grant-recipient-category-page.astro` (+ shared partials it uses)

- [ ] **Step 1:** Replace the monotonous same-size card wall with section-type variety: (a) a feature row pairing copy with the `dashboard-mock.astro` motif, (b) a stat/proof band, (c) an editorial pull-quote, (d) a comparison strip — separated by alternating `.gp-section` / `.gp-section.alt` backgrounds with strong `.gp-section-head` headers. Use the ochre accent (`--gp-gold-*`) functionally for emphasis/status, not decoration. No copy invention — reuse existing section content; only restructure presentation.
- [ ] **Step 2:** Rebuild; spot-check 2–3 category pages render with clear descending hierarchy and varied rhythm; assert no overflow / one `h1` size preserved.
- [ ] **Step 3: UX critique** (sub-agent): does it read as intentional and striking vs template-y? Fix findings.
- [ ] **Step 4: Commit** `feat(site): give SEO category pages rhythm and art direction`

### Task 17: Below-the-fold home + directory hubs

**Files:** `apps/site/src/pages/index.astro`, directory hub pages/components.

- [ ] **Step 1:** Port below-fold editorial cards to `.gp-card`, establish a clear section hierarchy, reuse the dashboard-mock as recurring proof. Even card sizing + aligned rows on `.gp-card.interactive` for hubs; consistent meta typography.
- [ ] **Step 2:** Rebuild; spot-check home end-to-end and one directory hub.
- [ ] **Step 3: UX critique** (sub-agent); fix findings.
- [ ] **Step 4: Commit** `feat(site): elevate below-fold home + directory hubs`

---

## WAVE 6 — Review, gates, merge, deploy

### Task 18: Full review + gates

- [ ] **Step 1:** Run the full guard + affected source tests: `pnpm --filter @grantpipe/site test`. All green.
- [ ] **Step 2:** Run `pnpm --filter @grantpipe/site build` — clean, no CSS-optimizer errors.
- [ ] **Step 3:** Code review via the active review path (`/code-review` or requesting-code-review skill) over the full branch diff; fix every finding.
- [ ] **Step 4:** Visual review: build + serve static, DOM-assert across the page matrix (home, product, pricing, all 6 software pages, compare, resources, hubs, glossary, about, free): (a) one `h1` size site-wide, (b) no element with horizontal overflow in a `visible/clip` container, (c) no retired/`-redesign` class. Fix findings.
- [ ] **Step 5:** Re-run tests with `--force` (turbo stale-green gotcha): `pnpm --filter @grantpipe/site test -- --run` / `turbo test --force`.

### Task 19: Merge + deploy

- [ ] **Step 1:** Use the `finishing-a-development-branch` skill: merge to `master`, remove the worktree.
- [ ] **Step 2:** Deploy: `pnpm run deploy:site`.
- [ ] **Step 3:** Poll grantpipe.com 1–3 min (transient post-deploy 404 gotcha); verify home, `/pricing`, `/product`, `/grant-management-software`, `/compare` render with the unified system.
- [ ] **Step 4:** Update memory: mark this effort complete; supersede the `marketing-site-visual-overhaul` note.

---

## Self-review notes

- **Spec coverage:** type ramp (T3), spacing scale (T2), container (T2/T4), radius/shadow + `--gp-rad-lg` (T5), one card/hero/plan-card + rename (T6–T9,T12), defect fixes nav/poster/H2 (T13–T15), elevation (T16–T17), guard test (T1), existing-test updates (T8,T9,T10), review/merge/deploy (T18–T19). All spec sections mapped.
- **Non-goals honored:** no copy rewrites (ports preserve copy verbatim; elevation restructures presentation only), no `apps/web`, no dark mode, no palette/font change.
- **Ordering safety:** old classes are kept working via temporary shared selectors until consumers are ported, then deleted (T12) — no unstyled-element window.
- **Shared-package caution:** T5/T13 touch `packages/ui` — additive/GrantPipe-scoped only; expect the longer shared-package pre-commit gate; esbuild flake → retry.
