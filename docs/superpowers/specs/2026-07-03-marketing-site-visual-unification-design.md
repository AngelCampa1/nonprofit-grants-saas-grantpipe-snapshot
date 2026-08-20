# Marketing Site Visual Unification & Elevation — Design Spec

> **Date:** 2026-07-03
> **Scope:** `apps/site` (grantpipe.com) marketing site + shared site styles in `packages/ui/src/site`.
> **Type:** Visual system unification + selective elevation. **Not** a copy rewrite, **not** an app (`apps/web`) change.
> **Deliverable of this spec:** the design; the itemized task plan lives in the companion plan doc.

## 1. Problem

The marketing site carries **two unmerged CSS design systems** and **no enforced type/spacing/container scales**. The recently-shipped hero (built on the newer system) looks strong, but the rest of the site does not match it, so the whole reads as incoherent — "wrong spacing, numbers overflowing, no visual hierarchy, no taste."

### 1.1 Measured evidence (rendered, static build @ 1280px)

- **No canonical hero size.** `<h1>` renders at **40.5 / 51.2 / 64 / 68px**, weights **600 and 700**, across home / category / pricing / compare.
- **No section-title standard.** `<h2>` renders in ~**4 treatments on a single page**, including semantic `<h2>` set at **16px/400 Manrope** (styled as tiny body text).
- **No card-title standard.** `<h3>` mixes **Spectral and Manrope** at 14 / 16 / 17.6 / 22px, weights 600/700/800.
- **Component-internal overflow (the "numbers overflowing"):** no page has horizontal page scroll (`docEl.scrollWidth - innerWidth == -15` everywhere), but _inside_ components:
  - **Global header nav list** overflows its container: **635px content in a 454px box** on every page.
  - **Explainer-video poster** inner grid overflows (**397px in 335px**) and clips badge labels ("Reports Queued", "Queued").
- **Pages still mix systems.** The `/grant-management-software` template shows 5 old-family class hits alongside 21 new-family hits.

### 1.2 Code-level root cause (from CSS architecture audit)

- **Three token vocabularies** alias the same values: canonical `--color-*`/`--text-*`/`--radius-*`, per-tenant `--site-*` runtime overrides, and `--gp-*` marketing aliases. Engineers must know `--color-primary-800` _and_ `--gp-emerald-700` are identical.
- **Two class families:** older (`.gp-hero-title`, `.gp-page-title`, `.gp-section-heading`, `.gp-card`, `.gp-proof-*`, `.gp-directory-*`, `.gp-generated-*`, `.gp-hub-*`) — rem/clamp, editorial, flatter; newer "redesign" (`.gp-hero-redesign`, `.gp-section-head`, `.gp-card-redesign`, `.gp-plan-card-redesign`, `.gp-dashboard-mock`, `.gp-mkt-btn`, `.gp-card-base`, `.gp-field`, `.gp-eyebrow-pill`, `.gp-wrap`, `.gp-section`) — px magic numbers, real variant contracts, closer to a system.
- **No enforced scales:** type sizes are class-local `clamp()`/flat values (≥4 hero sizes, ≥5 section-title sizes live simultaneously); spacing flips unit per family (rem vs px magic numbers `26px`/`48px`/`22px`); **three page containers** disagree (`.gp-page-shell` 1152px vs `.gp-wrap` 1240px).
- **`.gp-section-head` is the one correct pattern** — the only class binding headings to `--text-*` tokens, so H1/H2 are distinct by contract. It becomes the reference for the whole site.
- **`--gp-rad-lg` mismap:** aliases `--radius-md`, not `--radius-lg` — misleading and should be corrected during cleanup.

## 2. Goals / Non-goals

**Goals**

1. Collapse to **one** cleaned-up design system so every page reads as the same product.
2. Enforce **one type ramp, one spacing scale, one container** via tokens, not per-class values.
3. **No era-words** in permanent class names (`-redesign` retired entirely; survivors take clean semantic names).
4. Fix the concrete defects (header nav overflow, explainer-poster clipping, semantic-H2-as-body).
5. **Elevate** the flat/monotonous sections (SEO/category pages, below-fold home) with real art direction, so the site is genuinely striking, not merely consistent.
6. Preserve brand and recent work: emerald + ochre, **light-only**, **pill buttons**, Spectral/Manrope pairing, the dashboard-mock motif.

**Non-goals**

- No marketing copy rewrites (kept out of scope to avoid copy-gate churn; if a line is unavoidably touched it passes `humanizer` + `third-grade-copy` + zero-lies). Positioning work is a separate plan.
- No `apps/web` (product app) changes. No dark mode. No new brand palette. No new fonts.
- No change to page routes, SEO metadata, or machine-readable surfaces (`llms.txt`, schema) beyond incidental markup that visual components require.

## 3. Design — the unified system

### 3.1 Type ramp (single source of truth)

Bind every heading and text role to the existing `--text-*` tokens; **delete all class-local `clamp()`/flat font-sizes** that duplicate a role. One font per role.

| Role            | Token                                          | Font     | Applied to                           |
| --------------- | ---------------------------------------------- | -------- | ------------------------------------ |
| Display / hero  | `--text-hero`                                  | Spectral | `h1` in hero / `.gp-section-head h1` |
| Section title   | `--text-editorial-title` (or `--text-heading`) | Spectral | top-level section `h2`               |
| Subsection      | `--text-subheading`                            | Spectral | secondary `h2`/lead `h3`             |
| Card title      | `--text-subheading` (card tier)                | Spectral | card `h3`                            |
| Body large      | `--text-body-lg`                               | Manrope  | lede/intro paragraphs                |
| Body            | `--text-body`                                  | Manrope  | default copy                         |
| Small / caption | `--text-caption`                               | Manrope  | meta, fine print                     |
| Label / kicker  | `--text-label` / `--text-kicker`               | Manrope  | eyebrows, badges, mono labels        |

**Rule:** `h1`→hero, `h2`→section title, `h3`→card/subsection title, **no exceptions**. Any element that needs a different visual size than its semantic level uses a role class bound to a token — never an ad-hoc size. Elements currently mis-leveled (semantic `<h2>` at 16px/400) are either re-tagged to the correct level or given the correct role token.

### 3.2 Spacing scale

Introduce a rem-based step scale (4px base) and require every `gap`/`padding`/`margin` in site CSS to reference it. Extend the existing `--component-gap-*` tokens into a named ramp:

```
--gp-space-1: 0.25rem;  --gp-space-2: 0.5rem;  --gp-space-3: 0.75rem;
--gp-space-4: 1rem;     --gp-space-5: 1.5rem;  --gp-space-6: 2rem;
--gp-space-7: 3rem;     --gp-space-8: 4rem;
```

Convert px/ad-hoc values to the nearest step (`26px`→`--gp-space-5..6`, `48px`→`--gp-space-7`, etc.). Section vertical rhythm uses a single `--gp-section-py` clamp.

### 3.3 Container

One container primitive `.gp-wrap` with tokens:

```
--gp-container-max: 75rem;      /* single canonical max — replaces 1152/1240 drift */
--gp-container-gutter: 1.5rem;  /* single gutter */
.gp-wrap { width: min(100% - (2 * var(--gp-container-gutter)), var(--gp-container-max)); margin-inline: auto; }
```

Retire `.gp-page-shell` and any bespoke width+padding container; port their pages to `.gp-wrap` + `.gp-section`.

### 3.4 Radius / shadow

Use the existing `--radius-*` and `--shadow-*` scales exclusively. Remove ad-hoc shadow strings (`0 16px 34px -28px rgba(...)` etc.) in favor of `--shadow-card` / `--shadow-md` / `--shadow-lg`. Fix `--gp-rad-lg` to alias `--radius-lg` (or rename it) so the name stops lying.

### 3.5 Component vocabulary — one family, clean names

Retire the old family; promote the new family; **remove `-redesign` from every class name** after the colliding old class is deleted.

| New canonical class                                                       | Replaces (retired)                                                                                                                  | Notes                                                |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `.gp-card` (from `.gp-card-base`) + `.feature` / `.interactive`           | old `.gp-card`, `.gp-proof-card`, `.gp-directory-card`, `.gp-link-card`, `.gp-band-card`, `.gp-editorial-card`, `.gp-resource-card` | one card surface; modifiers cover tinted + clickable |
| `.gp-hero` (from `.gp-hero-redesign`)                                     | `.gp-hero-shell`, `.gp-hero-main`, `.gp-hero-title`, `.gp-hero-aside`                                                               | one hero layout                                      |
| `.gp-section-head` (unchanged — reference)                                | `.gp-page-header`, `.gp-section-intro`, `.gp-band-title`, bespoke section headers                                                   | already token-bound                                  |
| `.gp-plan-card` (from `.gp-plan-card-redesign`)                           | `.gp-pricing-card`, `.gp-band-card` (pricing)                                                                                       | one plan card                                        |
| `.gp-mkt-btn`, `.gp-field`, `.gp-eyebrow-pill`, `.gp-wrap`, `.gp-section` | —                                                                                                                                   | already canonical; keep                              |

Rename map (applied last, after old classes are gone): `*-redesign` → `*` (`.gp-card-redesign`→`.gp-card`, `.gp-hero-redesign`→`.gp-hero`, `.gp-plan-card-redesign`→`.gp-plan-card`, `.gp-resource-redesign`→`.gp-resource`, `.gp-card-grid-redesign`→…). Update every consuming `.astro`/`.tsx` in lockstep.

### 3.6 Token naming

Keep `--gp-*` as the single marketing-scoped vocabulary for site CSS (it reads better than `--color-primary-800` in marketing components) and ensure every site rule draws from `--gp-*` or the `--text-*`/`--radius-*`/`--shadow-*` canonical scales — not a mix. Full deletion of the redundant half of the alias layer is **optional/stretch** (documented, low-risk-last), not required for the visual win.

## 4. Defect fixes (concrete)

1. **Header nav overflow (635px in 454px, every page).** Fix the desktop nav layout in the shared site header so the primary links + dropdown triggers fit without clipping — correct the flex sizing / gap / available width. Verify `navList.scrollWidth <= navList.clientWidth` at 1024/1280/1440.
2. **Explainer-video poster clipping.** Fix `.gp-explainer-video__poster-grid` (397px in 335px) and its badge cells so labels ("Reports Queued", "Queued") are not clipped — flexible columns / wrap / smaller label type bound to `--text-label`.
3. **Semantic-H2-as-16px-body.** Locate each `<h2>` rendering at 16px/400 Manrope; re-tag to the correct element or bind to the correct role token so heading order matches visual order.

## 5. Elevation (the "+elevate")

Applied after unification, so it builds on the clean system:

- **SEO/category template** (shared `grant-recipient-category-page` + software pages): break the monotonous same-size card wall. Introduce section-type variety — feature rows pairing copy with the dashboard-mock motif, a stat/proof band, an editorial pull-quote, a comparison strip — with alternating `.gp-section` / `.gp-section.alt` backgrounds and stronger `.gp-section-head` headers. Ochre accent used functionally (status/emphasis), not decoratively.
- **Below-the-fold home:** port editorial cards to the unified `.gp-card`, give the sections a clear descending hierarchy, and reuse the dashboard-mock as recurring proof.
- **Directory hubs:** even card sizing + aligned rows on `.gp-card.interactive`; consistent meta typography.
- **Whole-site rhythm:** generous space where decisions happen (hero, pricing, CTAs), density where data belongs (comparison tables, category proof) — the "rigorous, humane, earned" balance.

## 6. Guardrails & testing

- **Visual-system guard test** (Vitest, in `apps/site/src/content-tests` or a new `src/style-tests`): fails if (a) any `*-redesign` class name exists in `.astro`/`.tsx`/`.css`, (b) a heading class declares a local `font-size` instead of a `--text-*` token, (c) `.gp-page-shell` is still referenced. This locks the migration in.
- **Existing component-source tests** (`pricing-plan-cards-source.test.ts`, `comparison-table-source.test.ts`, `product-proof-section-source.test.ts`, `grant-recipient-category-page.test.ts`) must stay green; update selectors where class names change.
- **Content-quality regression tests** must stay green (no copy/positioning drift).
- **Coverage:** any touched `.ts`/`.tsx` logic keeps ≥95% per repo rule; pure CSS/`.astro` markup is exempt but must pass the guard test.
- **Verification method:** static build + programmatic DOM assertions (the reliable path — `astro build` prerenders 1669 pages; serve `dist/client`, assert heading tokens, overflow, container width via evaluated DOM). Screenshots are spot-check only (the live AI-CS widget prevents network-idle, so full-page capture is flaky).
- **Brand invariants (must not regress):** light-only, pill buttons (`--gp-pill`/`--radius-full`), emerald+ochre palette, Spectral/Manrope, no fabricated proof.

## 7. Execution shape (sub-agent-driven, in a worktree)

| Wave | Focus                                                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1   | Foundation tokens: type ramp binding, `--gp-space-*` scale, single container, radius/shadow cleanup, `--gp-rad-lg` fix + the guard test (written first, red). |
| W2   | Unify card + hero + plan-card; retire old family; port home / product / pricing; apply rename map on migrated classes.                                        |
| W3   | Port remaining templates: category/software shared template, compare, hubs (features/solutions/for/directory), resources, glossary, about, free tools.        |
| W4   | Defect fixes: header nav, explainer poster, semantic-H2 remaps.                                                                                               |
| W5   | Elevation pass on flat sections + whole-site rhythm.                                                                                                          |
| W6   | Review (code + visual), fix findings, run test/build gates, merge to master, remove worktree, `pnpm run deploy:site`.                                         |

Each wave delegates exploration/implementation/verification to sub-agents (smallest capable model; escalate on need) with the orchestrator integrating and judging.

## 8. Risks

- **Class rename breakage:** a missed consumer leaves an unstyled element. Mitigation: guard test + grep sweep for each retired class before deleting it; port-then-delete ordering.
- **Regression in prerendered SEO markup:** mitigate by keeping semantics/metadata untouched and running content-quality tests each wave.
- **Scope creep into copy:** hold the line — visual only.
- **Turbo stale-green after merge:** re-run typecheck/test with `--force` (known repo gotcha).
- **Post-deploy transient 404 on grantpipe.com:** poll 1–3 min before assuming failure (known repo gotcha).
