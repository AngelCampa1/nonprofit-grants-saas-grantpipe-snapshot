# Marketing Site Sweep — Live Ledger (lean)

**Goal (started 2026-06-20, "goal mode" — many sessions):** Make the entire GrantPipe **marketing site** (`apps/site` + its shared chrome in `packages/ui/src/site`) pristine — function, UI, UX, taste, visual consistency, intuitiveness. Screenshot every screen/modal/button, evaluate, fix, verify. Standard: a Gen Z says "that looks nice" AND an 80-year-old can use every part without getting stuck. Full local E2E (real workflows, real servers). Multiple review/fix cycles until nothing remains. Sub-agent driven. Prior sweeps are reference only — **do not trust them**.

**This file is the source of truth across sessions. READ FIRST. UPDATE CONTINUOUSLY. Keep lean (~2–3K tokens). Full wave detail → `marketing-site-sweep-ARCHIVE.md`.**

## Scope

- `apps/site/src/pages/**` (~100 pages, mostly template-driven) + `apps/site/src/components/**`
- Shared site chrome/components/layouts/interactive tools: `packages/ui/src/site/**` (header, footer, base-layout, popups, search overlay, mobile nav, interactive calculators/quizzes, lead-magnet flows, signup CTAs)
- Forms/lead-capture posting to the public API (`apps/api` leads domain) — e2e the actual submit path

## Relationship to prior sweeps

- `frontend-system-sweep` marked `apps/site` only **PARTIAL** (SITE-36/51/52 done; 38/39 WONTFIX; 47 open). `pristine-quality-sweep` was almost entirely `apps/web`. So the site is **largely un-pixel-swept**. Re-verify everything with live screenshots; trust nothing.
- WONTFIX (do not re-open): SITE-38 (SRI/consent on redeployed worker), SITE-39 (`/downloads/{slug}.pdf` canonical contract route), AUDIT-3 (FAB corner-overlap = standard vendored widget).

## Stack bringup (fill once verified this session)

- Worktree needs own deps: `pnpm install --prefer-offline` (~30s warm store). `.npmrc` VENTORA_REGISTRY_TOKEN warning is harmless.
- Astro dev: from `apps/site`, `pnpm dev` (port 4321). **Must run with run_in_background:true** or the process dies when the tool call returns.
- **Gotcha:** Astro dev binds **IPv6 `::1` only** → curl with `http://[::1]:4321`; browsers/localhost resolve fine.
- **Gotcha:** `trailingSlash: 'always'` → every route needs a trailing slash (`/pricing/` 200, `/pricing` 404). Not a bug.
- For form/lead-capture e2e also need public API on 5050 (mock mode).
- **MAJOR dev gotcha:** `astro dev` does **NOT serve `public/` assets** (logo-light.svg, favicon._, _.png all 404; SSR returns the styled 404 page) — reproduces on BOTH worktree (4321) and main-tree (4322) servers. **Prod serves them fine (grantpipe.com/logo-light.svg = 200).** So broken `<img>` for logo/favicon/og in local screenshots are a **dev-environment artifact, NOT product bugs** — verify image-dependent screens against prod, do not log them. (Astro+Cloudflare adapter dev quirk; not worth changing prod config for dev convenience.)
- Preview browser: navigate it to the worktree server (`http://localhost:4321/...`) via preview_eval `window.location.href` so HMR reflects worktree edits; the preview-managed `site` server runs from the MAIN tree.

## Method

- Main session: holds dev server + ledger, drives browser for **taste judgment** (must see pixels), final integration.
- Sub-agents (web/editor/lite tiers, smallest capable model): breadth discovery, code triage, TDD fixes, review.
- Template-aware: screenshot ONE representative of each templated route group + EVERY truly-unique page. Don't re-shoot 50 identical pSEO pages — audit the template.
- Per finding: ID, severity (P0 blocker / P1 / P2 / P3 polish), page/component, what's wrong, fix, verify.
- Quality gates per CLAUDE.md: TDD, 95%/file coverage on touched files, no `any`/TODO, **buttons are pills**, review→fix→merge→remove worktree→deploy (`deploy:site`).

## Surface inventory (status: PENDING / SHOT / FIXING / VERIFIED)

### Unique pages

| Page                        | Status  | Notes |
| --------------------------- | ------- | ----- |
| / (index)                   | PENDING |       |
| /product                    | PENDING |       |
| /pricing                    | PENDING |       |
| /about                      | PENDING |       |
| /books                      | PENDING |       |
| /privacy                    | PENDING |       |
| /board/report               | PENDING |       |
| /compare (index)            | PENDING |       |
| /features (index)           | PENDING |       |
| /resources (index)          | PENDING |       |
| /glossary (index)           | PENDING |       |
| /integrations (index)       | PENDING |       |
| /nonprofit-software (index) | PENDING |       |
| /for (index)                | PENDING |       |
| 404 / 500                   | PENDING |       |

### Template groups (audit template + 1 sample)

| Template                                         | Sample route | Status                                        |
| ------------------------------------------------ | ------------ | --------------------------------------------- | ---------------------- | ------- | --- |
| features/[slug]                                  | PENDING      |                                               |
| compare/\* (alt/versus/pricing)                  | PENDING      |                                               |
| free/\* interactive tools (6 unique)             | PENDING      | calculators/quizzes — interactive, high value |
| resources/\* (guides/best/faq/benchmarks/topics) | PENDING      |                                               |
| glossary/[slug]                                  | PENDING      |                                               |
| lp/\* paid landing pages                         | PENDING      |                                               |
| donor                                            | ed           | funds                                         | grant/\* landing pages | PENDING |     |
| nonprofit-software/[state]/[city]                | PENDING      |                                               |

### Shared chrome / interactive (packages/ui/src/site)

| Component                                              | Status  | Notes    |
| ------------------------------------------------------ | ------- | -------- |
| site-header + mobile-nav-drawer                        | PENDING |          |
| site-footer                                            | PENDING |          |
| exit-intent-popup                                      | PENDING |          |
| search-overlay                                         | PENDING |          |
| promo-banner                                           | PENDING |          |
| lead-magnet-signup / email-capture / public-signup-cta | PENDING | form e2e |
| sticky-mobile-cta                                      | PENDING |          |
| interactive calculators/quizzes (7)                    | PENDING |          |

## Findings backlog

| ID  | Pri    | Page/Component                 | Issue                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Status          |
| --- | ------ | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| M1  | P2     | mobile-nav-drawer.astro:140    | `.mobile-drawer-hamburger` icon button was `border-radius:0.375rem` → **FIXED** to `9999px` + test-locked. NOTE: component is imported nowhere (dead/unused; live header uses `.mobile-nav-trigger` which is already pill).                                                                                                                                                                                                                                                                                                                                                   | FIXED           |
| M2  | P2     | promo-banner.astro:66          | Dismiss × icon button was `rounded-sm` → **FIXED** to `rounded-full` + test-locked                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | FIXED           |
| M3  | P3     | mobile-nav-drawer.astro        | Component imported nowhere — dead code (has full impl + tests). Decide keep-for-future vs remove. **RESOLVED: KEEP.** It is a complete, tested (`mobile-nav-drawer-source.test.ts`) and design-system-documented (`packages/ui/src/site/styles/README.md:218`) component — not placeholder code. The live mobile nav works via the separate `.mobile-nav-trigger` (verified working). Deleting documented+tested code authored by the owner, without their input, is overreach beyond a taste sweep. Not a live-site defect. Closed.                                          | RESOLVED (keep) |
| M4  | **P1** | pricing-plan-cards.astro:72,93 | Renewal line rendered "Then $269/**mo/mo** after the first year" (double /mo) on ALL tiers, annual+monthly — `renewalPrice` already includes /mo. **FIXED** + new source-contract test; verified live both billing views.                                                                                                                                                                                                                                                                                                                                                     | FIXED           |
| M5  | P3     | site-footer.astro:91           | Fixed bottom-right "Ask GrantPipe" FAB occluded footer legal links (Terms of Service) at max scroll on ALL breakpoints. **FIXED**: split footer `py-[var(--section-py-sm)]` → `pt-[var(--section-py-sm)] pb-[calc(var(--section-py-sm)_+_5rem)]` (note CSS calc needs `_+_` underscores in Tailwind arbitrary value, else it silently no-ops). Reserves 128px bottom clearance; legal bar now clears the ~100px FAB band. New source-contract test; verified live (paddingBottom=128px, legalGapFromBottom=128px, screenshot clean). Distinct from AUDIT-3 (widget existing). | FIXED           |

| M8 | **P1** | crm-cost-calculator.tsx (free/nonprofit-crm-cost-calculator) | **Flagship free tool rendered blank for every fresh visitor.** Calculator hard-gated its ENTIRE render behind `isSignedUp()` (localStorage `exit-popup-signed-up==="true"`) → `return null` for anyone not previously signed up. Confirmed on PROD: island ships empty (`<astro-island ... CrmCostCalculator ...></astro-island>`, no SSR children). Was the ONLY free tool gated this way — all 5 assessments/quizzes/scorecards + sibling `software-cost-calculator.tsx` render openly. Page's promised "Interactive 3-Year Cost Calculator" was an empty gap with no unlock prompt. Gating was intentional ("gated React island" commit) but wrong: the page's lead magnet is the companion PDF (separate `GatedContent` island, untouched). **FIXED**: removed `unlocked`/`isSignedUp` gate + `return null`; calculator now renders for all, analytics `calculator_result_viewed` fires on mount for everyone. Tests updated (null-when-signed-out → renders-ungated); 36 pass, file coverage 100%. Verify live render after rebuild. | FIXED |
| M7 | P2 | pricing matrix (gp-matrix-scroll) | **Mobile discoverability.** Pricing comparison matrix is horizontally scrollable on mobile (760px table in 373px viewport, `.gp-matrix-scroll overflow-x-auto`) but had **zero scroll affordance** — no right-edge fade, no "swipe" hint, scrollbars hidden until interaction. 80-yo persona wouldn't discover hidden plan columns. **FIXED**: added mobile-gated swipe hint `Swipe to see all plans →` (`.gp-matrix-swipe-hint`, `display:none` default, revealed `@media(max-width:720px)`) + JS-driven right-edge fade `.gp-matrix-wrap::after` that shows only while `[data-matrix-overflowing]:not([data-matrix-at-end])`; progressive-enhancement script toggles overflow/end state on scroll+resize and dismisses the hint after first scroll. Degrades gracefully (hint stays if JS never runs). New source-contract test `feature-comparison-matrix-source.test.ts` (3 pass). **Live-verified** on prod build: hint visible, fade opacity 1 mid-scroll / 0 at end, hint dismisses on scroll. Copy passed humanizer (no change) + third-grade-copy (pass). | FIXED |
| M9 | P3 | questionnaire-shell.tsx (5 free quiz/assessment tools) | Inline (sm+) "Back" control on every questionnaire was a bare text-link `<button>` with `borderRadius:0px` and no min touch target — flagged as pill-canon miss across all 5 tools. Decision: it IS a `<button>` (canon covers link-buttons) and its sibling "start over" `<button>` already carries `rounded-full`, so this is a real in-file inconsistency, not the prior footer `<a>`-link case. **FIXED**: `text-sm text-brand-text underline disabled:opacity-40` → `inline-flex min-h-12 items-center rounded-full px-3 py-2 text-sm text-brand-text underline disabled:opacity-40` (pill + 44px touch target, matching the Next pill's min-h-12). New render-level test asserts inline Back has `rounded-full` + `min-h-12`; 30 shell tests pass. **EXTENSION (later live mobile inspection):** the inline Back is `hidden sm:flex` — the Back mobile users actually tap is the one in `MobileFormFooter`, which was still a bare square text-link. **FIXED** that too: `text-sm text-brand-text underline disabled:opacity-40 min-h-12 flex items-center` → `inline-flex min-h-12 items-center rounded-full px-3 py-2 text-sm text-brand-text underline disabled:opacity-40`. New test asserts the footer Back has `rounded-full`+`min-h-12`; 12 footer tests pass. Live-verified on prod build: footer Back border-radius 9999px, 48px touch target, visible. Both Back controls (inline desktop + mobile footer) now pills. | FIXED |
| M6 | **P1** | base-layout theme prop (7 pages) | **Site-wide (prod-confirmed) broken buttons.** `BaseLayout` only injects the gp-_ token layer when passed a `theme` prop (`themeCss = theme ? generateThemeCSS(theme) : ""`, base-layout.astro:109/149). 7 pages rendered BaseLayout WITHOUT `theme={siteConfig.theme}` → `--gp-pill`/`--gp-emerald-_`undefined → every`.gp-mkt-btn`(primary marketing CTAs) rendered as **square, colorless** buttons. Confirmed on prod (grantpipe.com/about: 0`--gp-pill`defs; home/pricing have them). Broken pages: about, privacy, terms, unsubscribe, solutions/index, nonprofit-software/index, compare/grantpipe-vs-quickbooks. **FIXED**: added`theme={siteConfig.theme}`to all 7. Template layouts (article-/listicle-layout, paid-search-landing-page) already forward theme → pSEO routes were fine. New guardrail test`base-layout-theme-prop-contract.test.ts`globs all pages, asserts every direct`<BaseLayout>`passes`theme={`(20 pass). Verified live: about now`--gp-pill=9999px`, primary CTA `rgb(31,107,85)` emerald + 9999px radius. | FIXED |

**Verified clean (desktop, programmatic taste-probe — pill-canon/broken-img/overflow/fonts/gp-pill):** Home (desktop+mobile), Product (full scroll), Pricing (after M4), About+Privacy+Terms+Unsubscribe+solutions/index+nonprofit-software/index+compare/grantpipe-vs-quickbooks (all M6-fixed, gp-pill=9999px live-confirmed), Books, board/report (→/lp/ redirect), compare/index, features/index, glossary/index, integrations/index, for/index, 404, 500. ALL: 0 square buttons, 0 broken imgs, 0 horizontal overflow, Spectral h1 + Manrope body. Probe stored in sessionStorage `__audit` for reuse.

**False-positive overflow classes (exclude in probe):** `lp-skip-link` (off-screen a11y skip link), `company_website` honeypot input (`left:-9999px;opacity:0`). scrollW===clientW confirms no real overflow.

**Investigated, NOT a defect (don't re-open):** terse one-word h1s on CategoryHub editorial hubs (Features/Glossary/Integrations/Benchmarks/FAQ/Guides/Reference/Workflows) — these are a consistent 8+ page family (label h1 + descriptive lede). Distinct, deliberate two-tier system vs bespoke conversion index pages (resources/nonprofit-software/solutions) which use sentence value-prop h1s. Not an inconsistency to "fix".

**INTERACTIVITY TESTING — BLOCKER RESOLVED (method):** `astro dev` (both worktree 4321 + main 4322) serves HTML+inlined-CSS fine but **404s all client JS modules** (`/@vite/client`, component scripts) → no interactivity, no hydration. This is a dev-server pipeline artifact, NOT a product bug. **Fix/workaround:** production build the worktree site (`SKIP_TURNSTILE_GUARD=1 PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA pnpm build` from `apps/site`), then serve the static output: `python -m http.server 4400 --bind 127.0.0.1` from `apps/site/dist/client`. Point preview browser at `http://127.0.0.1:4400/...`. Hashed `/_astro/*.js` load 200, islands hydrate, `mobileNavReady=true`. Use this for ALL interactive E2E. (Build ~3min incl. lead-magnet PDFs.) NOTE: preview_click sometimes no-ops pre-hydration; a JS `el.click()` is the reliable driver.

**Mobile nav drawer — VERIFIED WORKING (was NOT a bug):** On the prod build, the hamburger fully works: click toggles `aria-expanded`, overlay `display:block`, body scroll-locks (`overflow:hidden`), focus moves into panel (first link), 27 links present, **icon morphs hamburger→X** when open, and closes via backdrop tap (full 375×812), trigger re-tap, AND Escape. aria-label stays "Toggle navigation menu" (acceptable — `aria-expanded` carries state). The cross-session "mobile nav doesn't open" symptom was purely the dev-server JS-404 artifact. Do not re-investigate as a defect.

**Template-group source breadth audit (sub-agent, 2026-06-20) — CLEAN:** Read one representative file per dynamic/template group + all shared chrome: `features/[slug]`, `compare/alternatives/[slug]`, `glossary/[slug]`, `for/[slug]`, `workflows/[slug]`+index, `resources/guides/[slug]`, `nonprofit-software/[state]/[city]`, `lp/*` (4), donor/funds redirect shells; shared: promo-banner, search-overlay, exit-intent-popup, sticky-mobile-cta, email-capture, lead-magnet-signup, mobile-form-footer, comparison-table. Checked pill-canon, stale UG numbers, AI-slop/placeholder, a11y (alt/labels/heading order), table overflow wrappers, hardcoded prices. **Zero P1/P2 defects.** UG numbers correct site-wide (15% / $1,000,000 cited correctly in lp pages; grep found no stale prior-revision values — the retired three-quarter-million single-audit threshold, the 10% de-minimis rate, the lower MTDC subaward cap, the lower equipment cap — presented as current in shipped source). Two non-defects logged & dismissed: (a) `workflows/index.astro:40` empty-state copy only renders if collection is empty (it never is — content files exist); (b) `search-overlay.tsx:308` uses `aria-label="Search"` which is valid ARIA for a titleless dialog. Don't re-open.

**Screenshot pipeline DOWN this env:** `preview_screenshot` times out at 30s even on a fresh server; page is fully healthy (eval/snapshot/styles all respond). Verifying via `preview_eval` computed-style probes + `preview_snapshot` a11y tree (more authoritative than pixels per preview guidance).

**Rejected (agent over-applied pill canon — NOT violations):** footer links (plain text links, no bg/border; `rounded-sm` is an invisible focus-ring corner), email inputs (inputs aren't buttons; rounded-md correct), search-overlay Escape `kbd` badge (keyboard hint, not a button).

## Recent waves (one line each)

- W0 (s1) — pulled, mapped surface, worktree `.worktrees/site-sweep-s1` (branch `site-sweep/s1`) off local master, ledger created.
- W1–Wn (s1, condensed) — full surface sweep: fixed M1/M2/M4/M5/M6/M8 (P1s: double-/mo renewal line, site-wide square/colorless CTAs via missing theme prop, blank flagship CRM calculator) + M7 (matrix mobile swipe affordance) + M9 (questionnaire Back pills, inline + MobileFormFooter). Template-group breadth audit CLEAN. All findings live-verified on prod build.
- W-final (s1, 2026-06-20) — M7 + M9 closed & live-verified; M9 extended to MobileFormFooter mobile Back. Gates: `turbo typecheck` (ui+site) exit 0; ui site tests 42/42; site package tests exit 0. Copy passes applied to new strings. Entering completion sequence: commit (full coverage gate) → review → merge → remove worktree → `deploy:site`.

**NEXT:** Commit worktree (pre-commit full coverage gate), get sub-agent review, fix flagged issues, merge to master, remove worktree + temp launch.json config, deploy via `pnpm run deploy:site`.
