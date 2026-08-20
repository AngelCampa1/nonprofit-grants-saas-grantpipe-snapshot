# Pristine System Sweep — Master Plan (2026-06-29, fresh eyes)

> **Status:** LOCKED v1 (revised after 3 sub-agent reviews: site-recon inventory, completeness/coherence audit, feasibility/method audit). Companion live ledger: `pristine-sweep-2026-06-29-LEDGER.md` (source of truth across sessions; lean). Finding history offloads to `pristine-sweep-2026-06-29-ARCHIVE.md` once the ledger grows.

## 0. Mandate (verbatim intent)

Make the **entire** GrantPipe system — marketing site (`apps/site`) and the app (`apps/web`) — pristine and coherent in **every** aspect: functional, UI, UX. Every surface must have taste, be visually consistent, work properly, and be intuitive. Evaluate **every screen, every modal, every button, every scroll state**. Test **end-to-end locally** with real servers doing real workflows. Fix and verify on the go. Multiple review/fix cycles until nothing is left to improve.

**Dual acceptance bar (every surface must pass BOTH):**

- **Gen-Z "that looks nice"** — modern, polished, on-brand, nothing janky/dated/cramped/off.
- **80-year-old "I can use this without getting stuck"** — obvious affordances, legible, forgiving, no dead-ends, clear next step everywhere.

**Coherence test:** every part must make sense (a) as the thing it is, and (b) as a part of the whole system.

**Fresh eyes:** prior sweeps' _conclusions_ are NOT trusted. Re-capture, re-evaluate, re-verify everything. (Prior sweeps' _operational_ knowledge — stack bringup, harness, gotchas — is carried forward.)

## 1. Operating principles

1. **Sub-agent driven.** Orchestrator holds context, taste judgment, the ledger, and the live servers. Sub-agents do breadth capture, code triage, TDD fixes, and reviews. Use the **smallest capable model**; escalate only on demonstrated need.
2. **Orchestrator owns taste — sub-agents own capture.** Visual/UX judgment that requires _seeing pixels_ stays with the main session (it reads the PNGs). **Sub-agents run the capture harness** (see §6.3) and return a manifest; the orchestrator never personally drives Playwright. Sub-agents gather and measure; they don't get the final taste vote.
3. **Real pixels, real workflows.** No conclusion ("looks fine") without a screenshot or a live DOM/interaction probe. No "works" without an actual local E2E run.
4. **Fix on the go, but gated.** Every fix follows repo law: TDD, 95%/file coverage on touched files, no `any`/TODO, buttons are pills, observability when adding behavior (see §4 note), spec+quality review, merge → remove worktree → deploy.
5. **Lean ledger.** Keep the live ledger ~2–3K tokens. Push completed-wave detail to the ARCHIVE file. Never bulk-load history. **Never persist screenshot file paths in the ledger** (they bloat it and don't survive sessions).
6. **Coherence is a first-class deliverable,** not a side effect. A frozen consistency snapshot (§3.7) governs every fix; a dedicated cross-surface track (Phase 5) reconciles the system.
7. **Context discipline (orchestrator).** Hard cap **≤10 screenshots read per turn**; process surfaces in batches of 8–12 per evaluate session. Session-handoff protocol in §6.5.

## 2. Taste & quality rubric (every surface scored on these)

Each captured surface is evaluated against these dimensions. A finding is logged when any dimension fails.

| #   | Dimension                  | What "pass" looks like                                                                                                                                                                                                                                                                                                                                     |
| --- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | **Visual taste**           | On-brand emerald + archival ochre, Sora/IBM Plex type hierarchy, generous-but-purposeful whitespace, subtle depth. Nothing cramped, misaligned, or dated. **Gen-Z anchor:** reads like Linear/Stripe; nothing that looks like 2015 Bootstrap; nothing cramped at 1280px; no orphaned/clipped elements.                                                     |
| B   | **Visual consistency**     | Same patterns as the rest of the system: card radius, button = pill, header/kicker pattern, stat-card style, spacing scale, icon set, color semantics (ochre=highlight never alert). Judged against §3.4 primitives + §3.7 snapshot.                                                                                                                       |
| C   | **Functional correctness** | Every control does what it says; data is exact and reconciles; no errors/403s/dead requests; sort/filter/search/pagination work; money formats correctly (cents→display); dates render right across timezone.                                                                                                                                              |
| D   | **UX / intuitiveness**     | Obvious primary action, clear affordances, forgiving validation with helpful messages, no dead-ends, always a next step. **80-yo anchor:** can locate the next action without reading every label; can recover from a validation error; can complete the core flow with no help text. (Interaction parts verified in Phase 3, scored back to the surface.) |
| E   | **Copy**                   | Clear, on-voice (rigorous/humane/earned), no AI-slop. Marketing/persuasive copy passes `humanizer` + `third-grade-copy` + zero-lies. UI labels match nav. Canonical terminology per §3.7 (no funder/grantor or grant/award drift).                                                                                                                         |
| F   | **States**                 | Empty (zero / one / many distinctly), loading (skeletons not spinners), error, success, **overflow/truncation** (long names, 200-char titles, huge numbers, 500-row pagination) all designed and sensible.                                                                                                                                                 |
| G   | **Responsive**             | Holds at the breakpoints in §3.8; sidebar→drawer; tables don't overflow their card; readable at **200% browser zoom** with no horizontal scroll.                                                                                                                                                                                                           |
| H   | **Accessibility**          | WCAG 2.1 AA: focus states, **keyboard nav (real tab-walk, focus order, no traps, ESC closes dialogs)**, semantic roles, contrast, labels, `prefers-reduced-motion` respected. Backed by an **axe snapshot** per major surface, not visual guess.                                                                                                           |

**Severity model:** **P0** broken/embarrassing/blocks sale · **P1** clear defect a user hits · **P2** taste/consistency a designer flags · **P3** subtle polish/nice-to-have.

**P0 hot-fix gate:** a P0 discovered during Capture or Evaluate **pauses the queue** and is fixed immediately (still gated/worktree/reviewed) — it does NOT wait for Phase 4.

## 3. Surface universe

> Key estimation insight: **the marketing site has hundreds of programmatically generated pages sharing ~12 templates.** Evaluate each _template_ once + a spot-check sample; do NOT screenshot all N.

### 3.1 Marketing site (`apps/site`, Astro 5 — localhost:4321)

**Static core (full capture each):** `/` (home), `/about`, `/pricing`, `/product`, `/books`, `/privacy`, `/terms`, `/unsubscribe`, `/404`, `/500`, `/signup` (redirect), `/resources` (hub), `/compare` (hub), `/integrations` (index), `/features` (index), `/solutions` (index), `/for` (index), `/workflows` (index), `/glossary` (index), `/free/*` hub, `/nonprofit-software` (index).

**Templated families (capture TEMPLATE + sample — numbered, 1 per template type × 2 viewports + 3–5 random instances each):**

1. `/compare/alternatives/[slug]` (+ paginated index)
2. `/compare/versus/[slugA]-vs-[slugB]` (+ 3 hardcoded: bloomerang/quickbooks/submittable)
3. `/compare/pricing/[slug]`
4. `/resources/guides/[slug]` (article-layout)
5. `/resources/best/[slug]` (listicle-layout)
6. `/resources/benchmarks/[slug]`, `/resources/faq/[slug]`, `/resources/topics/[slug]`
7. `/features/[slug]`, `/solutions/[slug]`, `/for/[slug]`, `/integrations/[slug]`, `/workflows/[slug]`, `/glossary/[slug]`
8. `/free/[slug]` (lead-magnet template)
9. `/nonprofit-software/[state]` + `/nonprofit-software/[state]/[city]` (geo)
10. `/ed/*` (5 funnel pages), `/grant/*`, `/donor/*`, `/restricted/*`, `/granthub/migration`, `/board/report`
11. `/lp/*` (20 paid-search landing pages — share `paid-search-landing-page.astro`; capture template + 3 instances)
12. `/grant-management-software` etc. (standalone SEO landers — share grant-recipient-category template)

**Interactive islands (React `client:*` — full functional E2E, not just screenshot):** exit-intent popup; `lead-magnet-signup`/`email-capture` (+ Turnstile); CRM cost calculator; software cost calculator; 5 assessment/quiz components (donor maturity, compliance readiness, audit readiness, financial scorecard, software needs); `gated-content`; `search-overlay`; `post-signup-survey`; AI-SDR chat widget (proxies `/api/ai-sdr/*`).

**Chrome:** site-header (+ mobile-nav-drawer), site-footer, promo-banner, social-proof-bar, trust-signals, sticky-mobile-cta, breadcrumb-nav. **7 layouts** (base/article/content/landing/comparison/listicle/pricing-breakdown) — verify each renders coherently.

**Data/meta endpoints (correctness, not taste):** `/rss.xml`, `/llms.txt`, `/llms-full.txt`, `/pricing.txt`, `/sitemap*`, `/signup-flow.json`. **OG images + meta-tags + favicon/apple-touch-icon/manifest** — verify present & correct on home, pricing, a guide, a comparison (social-share first impression).

### 3.2 Web app (`apps/web`) — TanStack file-based routes, basepath `/app/`

**Public / auth:** `/login`, `/signup` (plan-select inline), `/forgot-password`, `/reset-password`, `/invite/$token`. **Global 404 + error-boundary** (fat-finger a bad `/app/` URL; force a render error) — guaranteed entry points, must be tasteful + recoverable.

**Portal (public, external grant reviewers — DIFFERENT audience bar):** `/portal` + `/portal/{home, $token, bundles.$id, documents.$id, funds.$id, grants.$id, programs.$id, generated-reports.$id, restriction-terms.$id}`. Evaluate against the **external-reviewer** bar (no GrantPipe training, no nav chrome they know), not the ED/Dev-Director bar.

**Authenticated app shell** (`_authenticated.tsx` — sidebar + topbar + command palette + AI-CS widget + toasts):

- **Core:** dashboard, onboarding (goal-branched wizard + first-light), select-plan, confirm-plan, activity, notifications, help, calendar.
- **Donors:** index (kanban/table), `$contactId` (tabbed detail), pledges, recurring-gifts, at-risk, email.
- **Grants:** index, `$grantId` (14-tab detail), pipeline (kanban), sentinel (lazy).
- **Funds:** index, `$fundId`. **Funders:** index, `$funderId`. **Events:** index, `$eventId`.
- **Reports:** index, `$reportId`, builder (Enterprise-gated), drafts, ask-ledger.
- **Accounting:** index, ledger, chart-of-accounts, journal (index/new/`$entryId`), bank (index/`$bankAccountId`), periods, recurring, integrations, anomalies, trial-balance, reports/{activities, financial-position, functional-expenses}, studios/functional-expense-allocation.
- **Compliance:** evidence-bundles (index/`$bundleId`), award-intake/`$extractionId`, programs (index/`$programId`), subrecipients (index/`$subrecipientId`), radar.
- **Payments:** index, `$requestId`. **Import:** Migration Studio.
- **Settings:** hub (org profile), team, entities, portal-access, billing.

> **RBAC capture requirement:** Admin / Editor / Viewer / Auditor each render differently (Auditor read-only & scoped; Viewer can't create). For **core nav, dashboard, grants index, and one role-restricted section**, capture **one screenshot per role** and evaluate each. Don't assume from the Admin render.
> **Plan/trial states:** demo org "Heartland Senior Services" is **Growth** → many Audit-Ready/Enterprise surfaces render gated. Capture the **gated state AND** (via a seeded higher-tier org or the trial-resolves-to-audit_ready path) the ungated state. Treat **trial** as a distinct state on billing/upgrade surfaces.

### 3.3 Modals / dialogs / sheets / drawers

NewDonorDialog, NewGrantDialog (+ inline funder), NewEventDialog, NewFunderInlineDialog, NewJournalEntryDialog, generic ConfirmDialog (delete/destructive), VideoDialog, AIUsageCapDialog, SettingsBillingPanel (upgrade), QuickShareSheet (multi-step portal share), MobileNav drawer, command palette, plus per-list delete-confirm + inline filter dialogs. **Each modal is a capture target (open + every step + validation-error state).** Triggers enumerated in the **modal-trigger map** (built into the harness before Phase 1).

### 3.4 Design system primitives (`packages/ui`) — the consistency yardstick

Tokens in `packages/ui/src/globals.css`. **Brand:** emerald primary (`#065f46` / `--primary` oklch 0.42 0.13 165) + archival ochre accent (oklch 0.67 0.135 78, highlight-only never alert). **Light theme only.** **Type:** Sora (headings), IBM Plex Sans (body), IBM Plex Mono (figures); `--tracking-caps: 0.14em`. **Radii:** sm4/md8/lg12/xl16/2xl24; **buttons/inputs/badges/select-triggers/pagination/icon-buttons = `rounded-full` (pill, enforced)**; cards/dialogs/tables/textarea = `rounded-2xl`. **Icons:** Lucide. Primitives: button (6 variants × 4+ sizes), input, textarea, select, checkbox/radio/switch, badge (16 variants), alert, attention-banner, progress, skeleton, inline-error, card, dialog, sheet, popover, table, data-table (TanStack), pagination, breadcrumb, tabs, dropdown-menu, command, tooltip, file-picker, filter-bar, view-toggle, sonner toasts; compound: page-shell/header/sidebar/topbar, empty-state, teach-and-act-empty-state, action-panel, icon-button, avatar. **These define "consistent."**

### 3.5 Cross-cutting states (per surface where applicable)

empty **(zero / one / many)** · loading (skeleton) · error · success · **overflow/truncation** · mobile-drawer · **per-role render** · gated/trial.

### 3.6 Transactional & lifecycle emails (user-facing — own capture track)

Auth emails (invite, password reset, email verification), lead-nurture sequence, lead-magnet PDF-delivery email, billing/trial notifications. Capture rendered HTML (desktop + mobile-width), check copy (law applies), link behavior, and that signed links resolve. Some are the **first** thing a new user sees.

### 3.7 Frozen consistency snapshot (every Phase 4 fix sub-agent MUST read; spec review confirms)

- **§3.4 design tokens** are the frozen visual reference.
- **Canonical terminology glossary** (build in Phase 0.5 from code+marketing): grant vs award, funder vs grantor, restricted fund vs fund, donor vs contact, etc. — pick one, list the rest as "do not use."
- **CTA verb map:** which verb per action — "Add" (attach existing), "Create/New" (net-new entity), "Log" (record an event like a gift), "Invite", "Generate" (reports). One verb per intent across the whole app.
- **Component-use rules:** when `teach-and-act-empty-state` vs plain `empty-state`; when sheet vs dialog; toast vs inline-error.
- **`.impeccable.md` line 38 ("both light and dark modes") is STALE.** Light-only is current truth (CLAUDE.md). **No fix may introduce dark-mode CSS.**

### 3.8 Responsive breakpoint contract

- **Desktop primary:** 1280 & 1440. **Mobile:** 390 (iPhone-class). Sidebar→drawer at <768.
- **App** surfaces: desktop-first; must be _usable_ (not pixel-perfect) at 390 — no horizontal scroll, drawer works, primary actions reachable. Data-tables may scroll-within-card on mobile.
- **Marketing** surfaces: mobile is **co-primary** (paid traffic is mobile-heavy) — full taste bar at 390 and 1280.
- All surfaces: legible at **200% zoom**, no clipped content.

## 4. Phase structure (multi-session)

**Phase 0 — Foundation (this session).** Recon complete (4 inventories) ✅; master plan written + 3 sub-agent reviews + revised + locked ✅; live stack verified healthy; harness confirmed + **modal-trigger map wired in**; **demo-org seed audit** (which lists land empty; seed or document); **terminology glossary + CTA verb map drafted** (§3.7); taste rubric locked; ledger initialized with active-worktrees table.

**Phase 1 — Capture & Catalog.** Sub-agents run the harness to screenshot every distinct surface at the §3.8 breakpoints, including every modal/sheet and the per-surface states (prioritize **primary populated state first** — biggest volume reduction; then empty/loading/error/overflow as the surface warrants). One pass forces `prefers-reduced-motion`; one forces 200% zoom on a sample. Per-role captures per §3.2. Catalog each into the inventory `PENDING → SHOT`.

**Phase 2 — Evaluate (interleaved with Phase 3 per surface group).** Orchestrator reads ≤10 shots/turn, scores against §2, logs findings. Sub-agents attach an **axe snapshot** + DOM/measure probes (hover/focus via `browser_evaluate`, not screenshots). For each surface group, run its Phase-3 E2E **before** locking its findings, so interaction defects (validation, optimistic update, toast, skeleton→content) are caught pre-fix. Status `SHOT → EVALUATED`.

**Phase 3 — E2E workflow testing (per §5).** Real local workflows end-to-end. Includes timezone/currency formatting checks, multi-tenancy non-leak spot-check, offline/failed-request UX. Findings logged with the surface group.

**Phase 4 — Fix cycles (domain-batched).** Severity-ordered, subagent-driven TDD fixes. **Batching:** one worktree per **domain** (donors / grants / funds / accounting / compliance / settings / site-templates / shared-ui), not per-finding. P2/P3 in the same domain queue into that domain's open branch. **`packages/shared` + `packages/ui` changes batched separately** (they trigger the ~13min cross-app gate — minimize triggers). Per batch: implement → spec review (confirms §3.7 snapshot honored) → quality review → live-verify → merge → remove worktree → **deploy per-domain** (not per-finding). Status per finding `OPEN → FIXED → VERIFIED → SHIPPED`. (Observability law applies only to behavior/feature changes; pure CSS/copy/layout fixes are exempt — note which in the finding.)

**Phase 5 — Coherence pass.** Cross-surface audit against §3.7: terminology, CTA verbs, header patterns, stat-card language, spacing, empty-state pattern, color semantics, plan-gate tone, **marketing↔app voice continuity** (side-by-side ≥5 marketing claims vs the in-app screens they describe). Resolve system-wide divergences.

**Phase 6 — Re-review until convergence (§8).** Repeat Capture→Evaluate→Fix on changed surfaces + a fresh full sweep by a **bias-free sub-agent**, until convergence rule met. Final whole-branch review, merge, deploy.

## 5. E2E workflow catalog (Phase 3 — real local runs)

- Auth: sign-up → verify path → onboarding wizard (goal-branched) → first-light. Sign-in / forgot-password / reset / accept-invite.
- Donors: create donor → log gift → verify persistence + dashboard reflects it; pledges; recurring gifts (gated).
- Grants: create grant → allocate to fund(s) → spend-down; subrecipient (gated).
- Funds: create fund → balance reconciles across grant allocations.
- Accounting: journal entry → trial balance → net assets after period close. **Currency formatting** exact on every financial surface.
- Reports: generate report; Ask Ledger; report builder (gated); **inspect generated PDF/print output** rendering + data.
- Compliance / radar / deadlines; **deadline dates render correctly across timezone** (project tz America/Mexico_City).
- CSV import: happy path + malformed/error path (Migration Studio).
- Settings: org profile, team/invite, custom fields, billing/upgrade (incl. **trial** state), portal share.
- Form validation error states across every create/edit form; keyboard-only walk of the top 10 flows (focus order, traps, ESC).
- Sort / filter / search / pagination on every list; **overflow** with seeded long/large data.
- **Multi-tenancy:** confirm no cross-org leak in responses when scoped to demo org.
- **Offline:** API unreachable → coherent error state, not blank.
- Marketing: lead-magnet capture → email delivery; calculators; 5 quizzes; gated content; search overlay; AI-SDR chat; nav/footer links resolve; exit-intent popup.
- Emails (§3.6): trigger each, inspect rendered template + links.

## 6. Logistics

- **6.1 Worktrees:** all fix work under `.worktrees\` (per CLAUDE.md). One worktree per **domain** batch (§4).
- **6.2 Stack bringup (carried — re-verify each session):**
  1. Docker pg `grantpipe-local-postgres` on **55439**.
  2. Migrate LOCAL db first: `cd packages/db && DATABASE_URL="postgres://postgres:postgres@localhost:55439/grantpipe" pnpm exec drizzle-kit migrate`.
  3. `GRANTPIPE_WEB_PORT=3050 GRANTPIPE_API_PORT=5050 pnpm dev:server start all` (stop/status same).
  4. Health: `curl localhost:5050/api/health`=200; `/api/auth/better/get-session` (Origin localhost:3050)=200; web 3050=200.
  5. Login: **demo@grantpipe.com / Demo2026!** (org "Heartland Senior Services"). Web basepath **`/app/`**.
  6. Site: `pnpm --filter @grantpipe/site dev` → localhost:4321.
- **6.3 Capture harness (sub-agent driven):** `.local/sweep-shots/capture-batch.mjs` (Playwright via absolute `.pnpm` path, CJS default import). **Web sub-agents run it via Bash**, save PNGs to `.local/sweep-shots/{surface-id}_{viewport}_{state}.png`, and return a **manifest** (surface-id, file, viewport, state, console errors, axe count). Capture agents run **serially** (shared browser). Orchestrator reads PNGs from the manifest and judges. Broken: `preview_screenshot` (times out) — do not use. Modal-trigger map embedded in the harness before Phase 1.
- **6.4 Quality gates:** `turbo typecheck`, per-app vitest 95%/file, lint, Prettier. `packages/shared`/`ui` commit triggers the ~13min api+web+ui coverage gate (needs prior web build; esbuild can flake — retry). Poll long gates; don't passively wait.
- **6.5 Session-handoff protocol:** screenshots are ephemeral and **not** referenced by path in the ledger. At session end, update ledger: phase status, surface-inventory statuses, findings backlog (≥P2), active-worktrees table, and a one-line NEXT pointer. Next session re-verifies stack (§6.2) and re-captures as needed (fresh-eyes — never trust an old PNG).
- **6.6 Deploy:** `pnpm run deploy:web` / `deploy:site` / `deploy:api` (Wrangler only). Per-domain after its batch merges. If a merge breaks prod, the prior deploy is the rollback target — note last-good SHA per app in the ledger before each deploy.
- **6.7 Marketing copy law:** any user-facing persuasive copy edit → `humanizer` then `third-grade-copy` then zero-lies check.

## 7. Risks / watch-items

- **Scale of SEO pages** — template + numbered sample only (§3.1); log what was sampled vs skipped (no silent caps).
- **Seed gaps** — Phase-0.5 seed audit; some detail pages (payments/$id, programs/$id) need a record first; sparse demo data can hide "many" states.
- **Plan/trial gating** — capture gated AND ungated AND trial.
- **`.impeccable.md` dark-mode line is stale** — light-only is truth; no dark CSS.
- **Shared-package gate cost** — batch §3.4/shared changes; serialize-aware scheduling.
- **Coverage uplift cost** — touching low-coverage files forces 95%/file uplift alongside the fix; budget for it.
- **Deploy failure** — record last-good SHA per app before each deploy (§6.6).
- **Stale turbo cache** — re-run with `--force` after merges.
- **Don't trust prior "clean" claims** — fresh eyes mandate.

## 8. Definition of done (convergence rule — concrete)

The goal is met when **all** hold:

1. **Every surface** in the §3 inventory reaches status **VERIFIED**.
2. All logged **≥P2** findings are **SHIPPED** (FIXED → VERIFIED → deployed).
3. A **fresh full re-sweep by a bias-free sub-agent** (not the one that did the fixes) produces **zero new P0/P1 and ≤3 new P2** across the whole surface universe.
4. Cross-surface coherence audit (Phase 5) resolved; marketing↔app voice continuity checked.
5. All marketing copy passes the law (§6.7).
6. Final whole-branch review clean; all affected apps deployed; worktrees removed.

The system reads as one coherent, tasteful, intuitive product on every surface, at both acceptance bars.
