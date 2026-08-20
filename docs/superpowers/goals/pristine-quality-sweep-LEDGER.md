# Pristine Quality Sweep — Live Ledger

**Goal (started 2026-06-19, "goal mode" — many sessions):** Make the entire GrantPipe system pristine — functionally, UI, UX. Every screen, modal, button screenshotted and evaluated. Standard: a Gen Z says "that looks nice" AND an 80-year-old can use every part without getting stuck. Full local E2E (web 3050 / api 5050, demo@grantpipe.com). Fix + verify on the go. Sub-agent driven. Multiple review/fix cycles until nothing is left to improve. Must be sellable to big clients — cannot fail, cannot look bad.

**This file is the source of truth across sessions. READ FIRST. UPDATE CONTINUOUSLY. Keep lean.**

## Relationship to prior sweep

- `frontend-system-sweep-LEDGER.md` (262 waves) is prior art — reference it but **do not trust** it. Re-verify everything with live screenshots.
- That sweep was mostly source-grep + code-level micro-polish. THIS goal is **pixel-level taste + real E2E workflows**. Different lens.

## Stack bringup (verified working this session)

1. Docker pg up: `grantpipe-local-postgres` on 55439.
2. Apply migrations to LOCAL db first (W252 gotcha): `cd packages/db && DATABASE_URL="postgres://postgres:postgres@localhost:55439/grantpipe" pnpm exec drizzle-kit migrate`.
3. Start: `GRANTPIPE_WEB_PORT=3050 GRANTPIPE_API_PORT=5050 pnpm dev:server start all`. Stop: `... stop all`. Status: `... status all`.
4. Health gates: `curl localhost:5050/api/health` =200, `.../api/auth/better/get-session` (Origin: localhost:3050) =200, web 3050 =200.
5. Login: demo@grantpipe.com / Demo2026! (org "Heartland Senior Services", user "Sarah Mitchell"). Rich seed data.

## Method

- Main session drives the browser for **taste judgment** (must see pixels) + holds servers + ledger.
- Sub-agents (web/editor tiers) do breadth discovery, code-level triage, and TDD fixes. Smallest capable model.
- Per finding: severity (P0 blocker / P1 / P2 / P3 polish), screen, what's wrong, fix, verify.
- Quality gates per CLAUDE.md: TDD, 95%/file coverage on touched files, no `any`/TODO, buttons are pills, review→fix→merge→deploy.

## Surface inventory (status: PENDING / SCREENSHOTTED / FIXING / VERIFIED)

(to be filled as the route map is built)

## Findings backlog

| ID  | Pri | Screen | Issue | Status |
| --- | --- | ------ | ----- | ------ |

## Recent waves (one line each)

- W0 (this session) — stack stood up + verified healthy; ledger created.

**NEXT:** Build full route inventory of apps/web, then screen-by-screen visual sweep starting with the highest-traffic surfaces (dashboard, donors, grants, funds, reports), logging taste/UX/functional findings.

## Findings (live)

- **F1** [P2] Dashboard priority-action description — robotic repetitive copy "reporting requirement is due soon, reporting requirement is overdue". FIXED on `quality/pristine-sweep-s1`: new `formatPriorityRiskSummary` in `apps/api/.../overview/service.ts` collapses subjects → "Reporting overdue and due soon" / "Budget 80% spent · Reporting overdue". TDD, api suite 4867 pass. STATUS: FIXED, pending live verify.
- **F2** [P2] Accounting Net Assets card — caption falsely said "No journal entries yet" when entries exist but no fiscal period closed (net-asset accounts legitimately $0 mid-year). FIXED on branch: mid-year case now reads "Net assets update after you close a fiscal period." TDD, web suite 5058 pass. STATUS: FIXED, pending live verify.
- **Note** `apps/web/src/hooks/use-overview.test.ts` old-format fixtures were updated by F1b agent.
- **F3** [P2] Donor detail "Average gift" card showed a bare unlabeled date. FIXED: sub now "Last gift <date>". Live-verified.
- **F4** [P2] Donor Donations tab had TWO gift-entry buttons ("Log gift"→light dialog, "Add Donation"→rich DonationForm). FIXED: consolidated to ONE "Log gift" button opening the richer DonationForm (captures restriction + goods/services); deleted `log-gift-dialog.tsx`+test. Live-verified (Restriction field present).
- **F5** [P2] Settings "Delete account" sat inside the org-profile section (thin border only). FIXED: quarantined into a tinted "Danger zone" card (border-destructive/40 bg-destructive/5). Live-verified.
- **G1** [P2] "Ask Ledger" feature had 3 spellings (sidebar "Ask Ledger" / H1 "Ask-Your-Ledger" / button "Ask ledger"). FIXED on branch: unified to "Ask Ledger" everywhere (ask-ledger.tsx + reports/index.tsx + tests). Live-verified PASS (title/button/nav all "Ask Ledger").
- **G2** NON-ISSUE: At-Risk filter pills are a multi-select that starts empty (empty=show all); active state exists (`variant="secondary"`+`aria-pressed`). The all-outline default is correct, not a missing active state. Agent misread. No change. (Re-check whether `secondary` is distinct ENOUGH only if a real interaction screenshot shows ambiguity.)
- **G3** [P1] Recurring Gifts fired 2 GET calls (active+past_due) even when plan-gated → two 403s/load. FIXED on branch: `useRecurringGifts(status, enabled)` now gated by `planAllowsRecurringGifts`. Live-verified: gated demo org makes ZERO recurring-gifts API call, no 403.
- **G4** [P2] Donor Email recipients table overflowed its card at desktop (content 634px in 469px container) → Stage column needed horizontal scroll. FIXED on branch: truncate+title on Donor (max-w-140) / Email (max-w-180) cells, nowrap Stage. Live DOM-verified: overflow 165px→0px, requiresHScroll false, Stage fully visible.
- **G5** [P3] Import: sidebar nav "Migration Studio" vs page H1 "Data Migration Studio" mismatch. FIXED on branch: H1 unified to "Migration Studio" (grep clean).
- **H1** [P1] Donors "Total Giving" column sorted as STRINGS, not numbers (desc click left $10,000 above $20,000 — top-givers view broken). ROOT CAUSE: API `SUM(amount_cents)` aggregates come back from Postgres as JS strings at runtime despite `sql<number>` type; TanStack `auto` sortingFn then compares lexicographically. FIXED on branch: (1) new reusable `numericSortingFn` exported from `packages/ui` data-table (coerces value→finite number regardless of string/number, null/NaN→0; 5 unit tests, full branch cov); (2) applied `sortingFn: numericSortingFn` to every client-sorted currency column — donors Total Giving, grants Amount, funds Balance (also switched accessorKey→accessorFn so getValue returns the numeric balance), programs Budget/Actual/Remaining, program-detail Budgeted; (3) API root-cause `.mapWith(Number)` on both `totalGivingCents` sql exprs in contact.service so the `sql<number>` contract is honest. Live-probed: desc now $20,000→$250, asc reversed. typecheck ui+web+api clean; ui 53 / api-contact 65 / web grants+funds+programs+donors+program-detail 332 tests pass. GATE-FIX: the two aggregate web suites that FULL-mock `@grantpipe/ui` (no `importOriginal`) — `src/__tests__/grants-funds-funders-pages.test.tsx` + `src/__tests__/programs-pages.test.tsx` — threw "No numericSortingFn export on the mock" for every list-render test (39 failures) because the changed routes now import it. Fixed by adding `numericSortingFn: () => 0` to both mock objects (mocked DataTable ignores sortingFn). Per-route suites use partial `importOriginal` mocks so they were unaffected. Lesson: adding a new named `@grantpipe/ui` export breaks every full-mock test that renders a consumer.
- **H2** [P2] At-Risk Donors filter pills used `variant="secondary"` (muted near-white, Δ~0.04 lightness vs outline) for the active state — too subtle to read as "selected" (fails the 80-yo test). FIXED on branch: active pill now `variant="default"` (emerald `bg-primary` fill + white text), matching the canonical `ViewToggle` selected state; inactive stays `outline`. TDD: at-risk.test asserts active chip has `bg-primary`, inactive does not. Live-probed: active "Lapsing" pill renders solid emerald, others outline — unmistakable. 15 at-risk tests pass.
- **[follow-up — API string-aggregate audit]** ~38 other `sql<number>` SUM/COUNT exprs across api (accounting, payments, grants, compliance, stats) are also runtime strings. Most feed arithmetic/formatters that coerce by luck, so no visible bug — but the type is a lie. The client `numericSortingFn` now defends ALL display sorting generically. Consider a sweep adding `.mapWith(Number)` to these for type honesty + to harden CSV/division paths. NOT a P1; logged so it isn't re-discovered as new.

## Full-pixel visual sweep (batch 3 session — real screenshots, my own eyes)

Captured 17 surfaces via `.local/sweep-shots/capture-batch.mjs` (working Playwright harness — see TOOLING below) and reviewed each. **Overall: the system looks polished and sellable.** Consistent emerald/ochre palette, pill buttons throughout, distinct active states on segmented toggles (List/Board, Cards/Ledger, Monthly/Annual), exact numbers, clean empty states + plan gates, granular RBAC, professional sign-in. No P0/P1 visual defects remain after F1–F5 + G1–G5.

Surfaces reviewed clean: sign-in, dashboard, donors list, add-donor modal, grants list, grant detail, funds list, radar, accounting (F2 caption live + reads well), reports, calendar, import (G5 "Migration Studio" live), settings → org/team/portal/accounting-integrations/billing/custom-fields.

## Discovery backlog (triaged this session)

- [P3 design-call] Grant detail Overview tab is always an editable form (no read view); 14-tab rail overflows (has horizontal scroll). Recoverable — nothing saves until "Save changes". DEFER: converting to read-view-with-edit is a larger design change, not a defect.
- [P3] Fund detail stat cards outlined vs grant detail filled-gray — entity-to-entity inconsistency. (b3-07 fund-detail shot didn't capture; re-verify next session before any change.)
- [P3] Fund detail "Delete fund" under "Save changes" — apply Danger-zone quarantine like settings F5. (re-verify next session)
- [P3] Reports page dense single-scroll — but it IS carded in a 2-col layout; acceptable, NOT "one long scroll". Lower priority than thought.
- DISMISSED: Calendar "Deadline Planner vs Calendar mismatch" — this is the standard kicker(eyebrow)+title pattern used on every page (Funds=FUND ACCOUNTING+Funds, etc.). Not a defect.
- DISMISSED: Add Donor modal "narrow" — single-column is correct for a 6-field quick-add; inputs are pills; looks fine.
- [P3 open question] Calendar side-panel auto-selects nearest future deadline (Jun 30) while grid highlights today (Jun 19) — two greens may mildly confuse. Defensible for a deadline planner; consider labeling panel "Next deadline" when auto-selected. Low priority.
- [brand-voice — needs USER call] Settings→Billing "Need a custom path?" → button "Email Angel" (founder first name). Humane/founder-led touch but enterprise buyers may not know who Angel is. Do not change without user input.
- [follow-up] Verify donation-create fires a PostHog event at the mutation/hook level (local handlers fire none).
- KNOWN WONTFIX: "Get help" AI-CS FAB overlaps bottom-right table/card content on several pages (obscures e.g. a Total Giving cell). Standard vendored-widget corner behavior (see memory help-fab-overlap-defect). Leave.
- NON-ISSUE: `/app/compliance` 404 was a prompt artifact — real route is `/app/radar`.

## Session s2 — plan-gate tone + page-title casing (MERGED + DEPLOYED)

Visual-consistency pass on subscription plan gates and page headers. **Merged to master `87dbc750` (--no-ff), web deployed (version `71709d46`, DEPLOY_WEB_EXIT=0). API unchanged.** s1 was already merged earlier (master is 26 ahead of origin — push pending, not required for deploy).

- **S2-1** [P2] Plan-gate tone inconsistency — several subscription gates rendered in alarming **red/destructive** (`Alert variant="destructive"` / `StatusPanel variant="error"`, the latter also forcing `role="alert"`+`aria-live="assertive"`) while 10/13 gates already used the calm pattern. A plan gate is informational, not an error. FIXED across reports/index.tsx (compliance-pack + restriction-lifecycle Alerts → `info`) and grants/$grantId.tsx (subrecipient + spend-down StatusPanels → `empty`). Calm tone now uniform; assertive live-region (wrong for a static upgrade notice) dropped on the two StatusPanels. Explore(haiku) audit confirmed exactly 3 alarming gates; all now calm.
- **S2-2** [P2] Missing/standard billing CTA — added the canonical `Go to Billing to upgrade.` link (`/settings#billing`) to the compliance-pack, restriction-lifecycle, and spend-down gates that lacked a clear next step. Subrecipient gate keeps its existing "Review pricing" button (minor copy variation, non-blocking — logged below).
- **S2-3** [P3] Page-title casing — title-cased H1s: AI Award Intake, Evidence Bundles, Proposal and Report Drafts, Subrecipient Monitoring, Recurring Gifts (short connectors of/and/to stay lowercase; gate body sentences stay sentence case).
- TDD throughout; new/extended gate-tone tests assert `data-variant` + CTA href. Pre-commit gate green (typecheck + 95%/file). Sonnet review of the gate-tone delta returned CLEAN.
- [follow-up, non-blocking] Subrecipient gate "Review pricing" vs the standard "Go to Billing to upgrade." wording — align in a future copy pass.

## Session s12 — Funder priorities field label unified (MERGED + DEPLOYED)

Wrap-up session (goal cleared). Shipped scout2 finding F4. **Merged to master `1d0b4bac` (--no-ff), branch commit `5a6839d7`, pushed to origin, web deployed (Version `58d65170-ae17-4dec-bfad-760bdb31da4b`, DEPLOY_WEB_EXIT=0). API unchanged, no migrations.** Prod-verified auth-free: the deployed `index-*.js` (Add Funder dialog) + `_funderId-*.js` chunks both serve from app.grantpipe.com (200) containing "Funding priorities". Local 3050 dialog verify: label count=1, old "Priorities" count=0. Sub-agent (lite) review of the s11+s12 diffs returned PASS (lean, surgical, properly tested, no regressions).

- **S12-1** [P3] **funders/index.tsx** — the Add Funder dialog labeled the priorities field `"Priorities"` while the funder DETAIL edit form (`$funderId.tsx:360`) labels the same `priorities` field `"Funding priorities"`. Create-then-edit made one field look like two (fails the "is this the same field?" test). FIXED: dialog `<Label>` `"Priorities"`→`"Funding priorities"`, matching the detail form AND the dialog's own placeholder ("Funding priorities, focus areas, …"). Only field-label occurrence in the app (grep-confirmed). TDD: new test opens the dialog, asserts `getByLabelText("Funding priorities")` present + no `"Priorities"` label. Gate green (95%/file). Live-verified.
- Not persuasive marketing copy (a plain form-field noun label); "Funding priorities" is third-grade clean regardless.
- **[housekeeping]** s12 worktree removed + branch deleted.
- **[follow-up queued — scout2 batch, NOT shipped]** **F1 is INVERTED**: accounting uses `variant="workbench"` (deliberately kicker-less) across all 17 PageHeaders; `anomalies.tsx` is the LONE outlier carrying a stray `kicker="Accounting"` → the fix is to REMOVE that one kicker for section uniformity, NOT add kickers to 15 pages (which would fight the deliberate workbench design). Also open: F2/F3 (Log Gift + New Payment Request dialogs lack an explicit Cancel button alongside the X), F5 (Journal "New Entry" nav-link vs dashboard "New journal entry" modal — pattern + capitalization divergence), F6 (Log Gift submit not gated on required fields), F7 (Funders empty-search state lacks a "Clear search" action).

## Session s11 — Reports banner cards canonical radius (MERGED + DEPLOYED)

Shipped scout finding F2 from the s9 sweep. **Merged to master `80ea3074` (--no-ff), web deployed (Version `120840c5-baed-4490-8819-0b92a4d0f722`, DEPLOY_WEB_EXIT=0). API unchanged.**

- **S11-1** [P2] **reports/index.tsx** — the three top-level banner `<section>` cards ("Need a custom report?", "Grant compliance", "Acknowledgment template") used `rounded-lg` (8px) while every Card primitive in the app uses the canonical `rounded-2xl` (renders 24px in this Tailwind config). Side-by-side on the same page the banners read visibly "boxier" than the cards beneath them — a taste inconsistency a designer would flag. FIXED: `replace_all` swapped the 3 banner classNames `rounded-lg`→`rounded-2xl`; the inner sub-panels (`bg-background/60 p-4 rounded-lg`, lines ~526/572/617) are deliberately the smaller nested radius and were left untouched. TDD: new "uses the canonical card radius (rounded-2xl) on the top-level banner cards" test asserts the "Need a custom report?" section `toHaveClass("rounded-2xl")` and `not.toHaveClass("rounded-lg")`. Gate green (95%/file). Live-verified on 3050: `verify-s11.mjs` reports banner computed `border-top-left-radius=24px` (was 8px), screenshot `s11-reports-AFTER.png` shows banners matching the cards below.
- Not marketing copy (a CSS radius change, no text touched).
- **[housekeeping]** s11 worktree to be removed + branch deleted this turn. Remaining queued findings F6/F8/F1/F7 from s9 + new scout2 batch (F1 accounting-kicker, F2/F3 dialog Cancel, F4 funder label, F5 journal CTA, F6/F7) open for s12+.

## Session s10 — Pledges page title matches sidebar nav (MERGED + DEPLOYED)

Shipped scout finding F5 from the s9 sweep. **Merged to master `532aa753` (--no-ff), web deployed (Version `0d0f631d-b3b5-4879-8635-7a1604c4e91d`, DEPLOY_WEB_EXIT=0). API unchanged.**

- **S10-1** [P2] **donors/pledges.tsx** — sidebar nav labels this surface "Pledges" but the page H1 read "Pledge Tracker" (both visible at once = avoidable terminology mismatch, fails the 80-yo "am I in the right place" test). Every other Fundraising-section page (Donors, Events, Donor Email) uses a plain entity-noun H1 matching its nav label, and G5 set the precedent (unify H1→nav for Migration Studio). FIXED: H1 `title="Pledge Tracker"` → `"Pledges"`; the `kicker="Fundraising"` and ASC 958 `description` subtitle are unchanged and carry the detail. TDD: new "titles the page 'Pledges'…" test asserts `getByRole("heading",{name:"Pledges"})` present + "Pledge Tracker" absent. Gate green (5060 web tests, 95%/file). Live-verified on 3050: H1="Pledges", matches the single nav "Pledges" link, old title gone (`s10-pledges-AFTER.png`).
- Not marketing copy (a navigational entity-noun label, not persuasive text) — but "Pledges" is trivially humanizer/third-grade clean anyway.
- **[housekeeping]** s10 worktree removed + branch deleted. Remaining queued findings F6/F2/F8/F1 (see s9 entry) still open.

## Session s9 — Accounting net-asset class names spelled out (MERGED + DEPLOYED)

Sub-agent (web tier) screenshot-swept unscreened surfaces (settings tabs, deadline-radar, budget-sentinel, donor-email, reports, accounting, pledges, recurring-gifts). I reviewed the pixels and shipped the clearest fix. **Merged to master `1657883a` (--no-ff), web deployed (current Version `d3b0d9da-1a71-4241-b843-c733c1ed9838`, DEPLOY_WEB_EXIT=0). API unchanged.** (First deploy attempt used an inner `&` that looked killed at "transforming…" so I re-ran; it actually finished too — redundant Version `619db9a2` of identical code. Lesson: never inner-`&` inside a run_in_background Bash call — let the harness manage it.)

- **S9-1** [P2] **accounting/index.tsx** — the Net Assets KPI card abbreviated two of its three rows as **"Temp. restricted" / "Perm. restricted"** while showing "Unrestricted" in full directly above them. This was the **only** place in the app using the abbreviations — funds, donation-form, pledges, dashboard, and the shared `formatFundTypeLabel` helper all spell out "Temporarily restricted" / "Permanently restricted" (formal ASC 958 classifications — technical accounting terms, exempt from the humanizer/third-grade copy rule). FIXED: full labels + `whitespace-nowrap` on the values and `gap-2` on the rows so the longer labels never crowd the figures. TDD: extended the "calculates net assets" test to assert full labels present and abbreviations absent. Gate green (web 95%/file). Live-verified on 3050: card reads "Unrestricted / Temporarily restricted / Permanently restricted", each on one line, no wrapping (`s9-netassets-card.png`).
- **[scout findings queued for next iterations]** (logged so they aren't rediscovered cold; screenshots in `.local/sweep-shots/scout-*.png`):
  - **F5** [P2] Pledges — sidebar nav label "Pledges" vs page H1 "Pledge Tracker" (visible simultaneously). Other named surfaces keep nav==H1 (Budget Sentinel, Deadline Radar, Ask Ledger). NEXT UP: align to "Pledges" (matches nav + Fundraising sibling noun labels). `nav.ts:113` vs `donors/pledges.tsx:1161`.
  - **F6** [P3] Donor Email recipient table — Donor name capped at `max-w-[140px]` (and Email cell) truncates "Brightwater Legal…" / "Riverside Commu…" despite ample empty space in the card at 1280px. Widen the caps. `donors/email.tsx:154`.
  - **F2** [P3] Reports — top 3 banner cards use `rounded-lg` vs `rounded-2xl` on every financial-section card on the same scroll. `reports/index.tsx` (372/387/403 vs 437/515/730…). Subtle; verify visibility before changing.
  - **F8** [needs code verify] Recurring Gifts "Open Stripe checkout" gated only by plan, not by `isStripeConnected` — on an Audit-Ready org without Stripe connected the button may be enabled and fail at the API. Correctly disabled on Growth (plan-gated) in the screenshot. Functional, lower confidence — verify the connection-state model before acting. `donors/recurring-gifts.tsx:254`.
  - **F1/F7** [P3] Settings sidebar "Accounting integrations" link exits the Settings layout to `/accounting/integrations`; `/settings/{notifications,integrations,profile,danger}` silently fall back to the Organization view (no 404). More involved; defer.
- **[NON-FINDING]** Accounting hub omits the section kicker — but it uses `PageHeader variant="workbench"` (a deliberate header variant for the accounting workbench surfaces), not an oversight. The scout misread `/accounting` as a Compliance-section page; it's its own "Accounting" nav section. No change.
- **[housekeeping]** s9 worktree removed + branch deleted. `pristine-sweep-s3` dead dir still lingers (this shell's persistent cwd lock) — delete from a fresh shell. `feature-18-recurring-gifts-finish` is NOT mine — leave it.

## Session s8 — Event detail summary-metric style normalization (MERGED + DEPLOYED)

Screened data-rich detail surfaces (funds/events/funders detail with real seed records, via 3050 Playwright). Found the event-detail summary cards rendered their headline numbers at default body size. **Merged to master `438ae6ba` (--no-ff), web deployed (Version `fcc124a3-2fec-4d4d-91e4-5143d2852c74`, DEPLOY_WEB_EXIT=0). API unchanged. Commit `bc7e1a38`.**

- **S8-1** [P3] **events/$eventId.tsx** — the three summary cards (Attendees, Revenue, Volunteer Total) used bare `<CardContent>{value}</CardContent>`, so the headline metrics read at body size while **every other** detail/summary surface (funds, grants, donors, payments, subrecipients, accounting, dashboard — `text-2xl font-semibold` in 7 files) shows them large+bold. Events was the lone outlier. FIXED: applied `text-2xl font-semibold` to all three. Live before/after on 3050 confirms the numbers now match the funds-detail cards.
- TDD: extended the happy-path render test to assert each metric `CardContent` carries `text-2xl font-semibold`. Gotcha — the jsdom Intl renders `$5000` (no grouping separator) vs the browser's `$5,000`; the revenue assertion uses `/^\$5,?000$/` to target the metric, not ICU. Gate green (web typecheck + 95%/file coverage, 12m52s). Trivial mechanical delta (3 identical className adds matching the documented canonical pattern) — self-reviewed, no sub-agent review.
- **[other surfaces this batch, no finding]** Calendar (clean); programs & subrecipients list/detail (gated empty states for the Growth org — clean, consistent "requires Audit-Ready" cards); funds/funders detail (clean, numbers reconcile).
- **[deferred P3 still open]** Billing-CTA verb drift: subrecipients gate uses **"See plans"** (button → `/settings#billing`) while the trial upgrade card uses **"Choose a plan"** (same destination); inline prose gates use "Go to Billing to upgrade." `/help`-bound "Open help" CTAs are a different semantic (learn, not upgrade) and are fine. Unify the two billing _button_ verbs in a future copy pass (needs humanizer + third-grade-copy).
- **[deferred design candidate]** Two summary-metric visual languages coexist: **donor detail** uses a grey stat-strip (`rounded-2xl bg-muted p-4` + uppercase `tracking-caps` micro-label + `text-2xl font-semibold` value, `donors/$contactId.tsx:797`) while **funds/events/grant detail** use white `<Card>` + `CardTitle` + `text-2xl font-semibold`. Both are individually polished; unifying is a deliberate design-system decision (pick a canonical pattern, migrate 4+ pages, churn tests) — NOT a quick mechanical sweep fix. Evaluate in a dedicated design pass; logged so it isn't rediscovered cold. Donor/grant detail otherwise screened clean (values reconcile, tabs/forms consistent).
- **[housekeeping]** s8 worktree removed + branch deleted; dead `pristine-sweep-s5` leftover dir also removed. `pristine-sweep-s3` still lingers (this shell's persistent cwd lock) — delete from a fresh shell. `feature-18-recurring-gifts-finish` is NOT mine — leave it.

## Session s6 — Funder & fund create-modal footer normalization (MERGED + DEPLOYED)

The funder and fund **create** dialogs ended in a lone full-width "Save" button — off-pattern vs every other create modal, which uses the canonical `DialogFooter` (outline Cancel + right-aligned primary). Normalized both to the shared footer and, while wiring it, uncovered + fixed a real validation-UX defect on the funder form. **Merged to master `6dc26416` (--no-ff), web deployed (Version `fcef1b8d-ab29-49b1-8253-89d8c05900cb`, DEPLOY_WEB_EXIT=0). API unchanged. Commit `ac2e489d`.**

- **S6-1** [P2] **funders/index.tsx** + **funds/index.tsx** — replaced the `<Button className="w-full">Save …</Button>` with `<DialogFooter className="flex justify-end gap-2">` → outline `Cancel` (calls `handleDialogOpenChange(false)`, which resets the form) + a name-disabled primary submit. Both modals now read identically (verified side-by-side: `funder-create-dialog.png` / `fund-create-dialog.png`).
- **S6-2** [P2] **funder validation UX defect (real, browser-reproducible).** The Website field is `<Input type="url">`. jsdom _and_ real browsers run HTML5 constraint validation on submit, so an invalid URL (`not-a-url`) **silently blocked form submission** — our branded zod message never rendered; the user got an inconsistent native browser bubble (or nothing). FIXED by adding `noValidate` to the `<form>` so our `createFunderSchema.safeParse` path always runs and surfaces the branded Alert ("Enter a valid website URL, including https://"). Verified live: `funder-invalid-website.png` shows the in-dialog destructive Alert. Also removed the now-redundant hardcoded `"Funder name is required."` early-return so `createFunderSchema`'s `"Enter a funder name."` (min(1)) is the single source of truth; the disabled-submit guard + schema both still cover empty name.
- **Gate gotcha (re-confirmed):** removing the funder name early-return changed the empty-name message, so the **sibling** integration test `__tests__/grants-funds-funders-pages.test.tsx` (which `submitButtonForm`s past the disabled button) had to update its assertion from "Funder name is required." → "Enter a funder name." First gate attempt also tripped the known `build-output.test.ts` "needs prior `pnpm --filter @grantpipe/web build`" gotcha — built dist/ then re-committed (2nd attempt green).
- TDD on all touched files (funder +`noValidate`/invalid-website/Cancel-closes/disabled-until-named; fund +Cancel-closes). Sonnet review of the delta returned **CLEAN** (one non-blocking nit: minor test-strategy difference between the two Cancel tests). UI-consistency refactor of already-wired surfaces — no new PostHog/Sentry needed.
- **[housekeeping]** s6 worktree removed + branch deleted. The on-disk leftover dirs `.claude/worktrees/pristine-sweep-s3` (held by this shell's persistent cwd lock) and `pristine-sweep-s5` still linger (both unregistered in git) — delete from a genuinely fresh shell. Sibling `feature-18-recurring-gifts-finish` is NOT mine — leave it.

## Session s5 — FilePicker primitive replaces native file-input chrome (MERGED + DEPLOYED)

Every file-upload surface rendered the browser's native `<input type="file">` chrome — the unstyleable OS "Choose File / No file chosen" text that varies per browser/OS and looks nothing like the rest of the app. `Input` already carried `file:` pill styling but the OS-rendered button/label text can't be restyled. Built a reusable **`FilePicker`** UI primitive (hidden `peer sr-only` input + a `<label>` styled as a `buttonVariants({variant:"secondary",size:"sm"})` pill with an `Upload` icon + a truncating filename/placeholder span) and adopted it across all four upload sites. **Merged to master `9ea5cd60` (--no-ff), web deployed (Version `a8d13c7e`, DEPLOY_WEB_EXIT=0). API unchanged. Commit `348080c1`.**

- **S5-1** New `packages/ui/src/components/file-picker.tsx` (+ exported from `index.ts`). Accessible pattern: native input is `peer sr-only` (focusable, hidden); the label-button picks up `peer-focus-visible:`, `peer-disabled:`, `peer-aria-invalid:` variants. Handles uncontrolled use (internal filename state) and controlled display via a `fileName` prop; resets `event.target.value=""` in onChange so re-picking the same file still fires. **17 unit tests, 100% file coverage.**
- **S5-2** Adopted in: `award-intake-entry.tsx` (new-grant dialog "Create from award document"), `entity-documents-section.tsx` (entity doc upload), `accounting/bank/$bankAccountId.tsx` (statement import — also dropped an off-canon `file:rounded-lg`), and `import.tsx` (CSV Migration Studio source file). Bank + import handlers changed from `(e: ChangeEvent)` to `(file: File|null)`.
- **Gate gotcha (logged for next session):** the pre-commit gate failed once (58 tests, 1 file) — `__tests__/grants-funds-funders-pages.test.tsx` renders the _real_ Funder/Fund/Grant **detail** pages (which mount the real `EntityDocumentsSection` → real `FilePicker`) while mocking `@grantpipe/ui` as a **sync object literal** lacking a `FilePicker` export, so render threw `No "FilePicker" export is defined on the mock`. Fix: add a `FilePicker` entry to that object-literal mock (a `<input type="file">` calling `onFileChange(files?.[0] ?? null)` + `value=""`). Same fix was needed in `import.test.tsx`. **Rule: any new `@grantpipe/ui` export rendered through a real child breaks every test that mocks ui as a bare object literal (no `...importOriginal()` spread) — grep `vi.mock("@grantpipe/ui", () =>` and patch each that mounts the affected component.** Tests that spread `...actual` get the new export for free.
- Sonnet review of the FilePicker delta returned CLEAN. Pre-commit gate green (web 5056 / ui 3192 / site 1406, all pass). Visual verification via HMR on the 3050 master tree (`fp-01-import.png`, `fp-02-newgrant-dialog.png`) confirmed the pill "Choose file" + Upload icon + muted "No file selected" reads clean and on-brand on both surfaces.
- UI-consistency refactor of already-wired surfaces — no new PostHog/Sentry needed.
- **[housekeeping]** s5 worktree removed + branch deleted. The cosmetic on-disk lock on `.claude/worktrees/pristine-sweep-s3` still persists (held by the persistent shell cwd) — delete from a genuinely fresh shell.

## Session s4 — Detail-page delete-affordance normalization (MERGED + DEPLOYED)

Screenshotted + evaluated the four entity **detail** pages (funder, donor, event, grant) via `capture-b6/b7.mjs`. The delete affordance was inconsistent across them: funder buried a destructive "Delete funder" button inside the Overview-tab edit form footer (unavailable on other tabs); donor used a loud `variant="destructive"` solid-red trash icon next to a restrained outline pencil; event/grant kept delete in a sensible header spot. Normalized to one calm, on-brand pattern. **Merged to master `66eb599c` (--no-ff), web deployed (Version `5720e3a3`, DEPLOY_WEB_EXIT=0). API unchanged. Commit `a483d1a9`.**

- **S4-1** [P2] **funder/$funderId** — relocated the entire "Delete funder" `<Dialog>` from the Overview form footer into the `PageHeader` `actions` slot (beside the funder-type Badge), as a restrained `variant="outline" size="sm"` pill. Now available on every tab, not just Overview. Form footer reduced to the lone "Save changes" submit. In-dialog confirm stays destructive. TDD: added a test asserting the trigger is in `[data-slot='page-header']` and NOT inside a `<form>`.
- **S4-2** [P2] **donor/$contactId** — de-escalated the delete trigger from solid `variant="destructive"` to `variant="outline" size="icon"` with a `text-destructive` red-tinted glyph, so it pairs visually with the adjacent outline pencil-edit icon. In-dialog confirm stays destructive. TDD: asserts the trigger has `border`, lacks `bg-destructive`, and the svg carries `text-destructive`.
- Sonnet review of the delta returned CLEAN (no blockers). Pre-commit gate green; coverage ≥95%/file on both touched route files. Visual verification via HMR on the 3050 master tree (b7-funder-detail.png / b7-donor-detail.png) confirmed both affordances render as intended.
- This was a UI-consistency refactor of already-wired surfaces — no new PostHog/Sentry needed.
- **[housekeeping]** s4 worktree removed + branch deleted. The cosmetic on-disk lock on `.claude/worktrees/pristine-sweep-s3` persists from s3 (not in the git registry) — delete next session from a fresh shell.

## Session s3 — Report Builder plan gate + plan-gate consistency (MERGED + DEPLOYED)

Surface sweep of 22 not-yet-reviewed routes via `.local/sweep-shots/capture-b4.mjs` (events, funders, payments, programs, activity, notifications, help, evidence-bundles, subrecipients, donors/pledges+recurring-gifts, all accounting/\* incl. anomalies, reports/ask-ledger+builder+drafts). Most read clean (rich cash radar, proper ASC 958 COA, balanced trial balance, etc.). Three real findings fixed. **Merged to master `5ad8a84e` (--no-ff), web deployed (version `d3c3d0e2`, DEPLOY_WEB_EXIT=0). API unchanged.**

- **S3-1** [P1] **Report Builder leaked a raw error in red.** The report-builder API gates ALL routes (incl. `metadata.$get`) via middleware → HTTP **403** `{ error: "insufficient_plan" }`. `extractMessage` prefers `error` over `message`, so `ApiError.message === "insufficient_plan"`, status 403. The demo org is **Growth** (builder needs **Audit-Ready+**) so this was LIVE: the page showed a red "Unable to load report builder. / insufficient_plan". The existing `isAuditReadyPlanGate` only checks 402, so it missed the 403. FIXED: added `isPlanGated` to `useReportBuilderMetadata` (`isApiErrorStatus(err,402)||...403`, mirroring use-pledges); builder.tsx now renders a calm `info` Alert ("Audit-Ready plan required" + standard `/settings#billing` CTA) IN PLACE OF the broken builder body when gated. TDD, hook+page 100%/98.68% cov.
- **S3-2** [P2] anomalies.tsx had the only two un-hyphenated "Audit Ready" strings → "Audit-Ready" (title + body). TDD, exact-string assertions.
- **S3-3** [P3] functional-expense-allocation upgrade CTA navigated to `/settings` (no `#billing` hash) unlike every other gate → now `{ to:"/settings", hash:"billing" }`. Test tightened to `toHaveBeenCalledWith`.
- **S3-4** [P2] events/index.tsx used a bespoke titled "Search" `<section>` (h2 + helper + `max-w-sm` input) vs the canonical `<FilterBar><Input/></FilterBar>` (funders pattern) → unified. Events already had the responsive card grid.
- Sonnet review of the full delta returned CLEAN. Pre-commit gate green on 2nd attempt (1st failed only on `build-output.test.ts` — the known "needs prior `pnpm --filter @grantpipe/web build`" gotcha; built dist/ then re-committed).
- **[follow-up — DEFERRED cosmetic CTA-label unification, P3]** ~7 full-surface plan gates use varied button labels for the same "go upgrade" action: evidence-bundles "Open billing settings", subrecipients ×2 "See plans", accounting/integrations "See billing options", restriction-upgrade-prompt "Review plans", grants/$grantId payments-tab "View billing" + subrecipients-tab "Review pricing". Inline Alert/StatusPanel gates already standardized on "Go to Billing to upgrade." Keep trial-upgrade-card "Choose a plan" + programs "Upgrade to edit" (contextual). A clean isolated pass should pick ONE button label (suggest "Go to Billing") — not done in s3 to avoid a sprawling 7-file/test-churn batch.
- **[housekeeping]** s3 worktree dir `.claude/worktrees/pristine-sweep-s3` is git-clean (registry pruned, branch deleted) but the on-disk dir is held by the persistent shell cwd lock — delete it next session from a fresh shell. (Sibling orphan dir `feature-18-recurring-gifts-finish` is NOT mine — leave it.)

## NEXT SESSION

Detail-page header/delete pattern is now normalized (s4). Remaining not-yet-deeply-reviewed surfaces + the parts only reachable through REAL E2E:

- **Detail pages still unscreened at the interaction level:** payments/$requestId, programs/$programId, evidence-bundles/$bundleId, subrecipients/$subrecipientId, award-intake/$extractionId. Reach payment/program detail by _creating_ a record first (seed has none → both render empty/gated lists, so the row-click harness skips them).
- **Real E2E workflows** (user emphasized "actual workflows local"): create-donor → log-gift → verify persistence; create-grant → allocate-fund; generate-report; CSV import happy + error path; form-validation error states; sort/filter/search across every list. Drive these via the screenshot harness for taste + a `web` sub-agent for DOM/interaction (serial, shared browser).
- **Flows not yet pixel-reviewed:** portal, onboarding wizard (goal-branched welcome — see [[project_onboarding-activation-redesign]]), calendar deep-dive, settings sub-tabs (billing/team/custom-fields).
- Prefer non-destructive / soft-delete cleanup to avoid polluting the seeded demo DB.
- **[deferred P3 from s3]** CTA-label unification across ~7 full-surface plan gates (pick one label, suggest "Go to Billing") — isolated cosmetic pass.

## TOOLING

- **Screenshot harness (WORKS):** `node .local/sweep-shots/capture-batch.mjs` — logs in (demo@grantpipe.com), saves full-page PNGs to `.local/sweep-shots/`, then I Read them. Import playwright via absolute `.pnpm` path + CommonJS default import (`import pw from "file:///.../playwright/index.js"; const {chromium}=pw;`). This BYPASSES the broken `preview_screenshot` (times out) AND web sub-agents that ignore Playwright. Orchestrator-driven screenshots = reliable taste judgment. Keep `.local/` script untracked (dev tool).
- Web sub-agents tend to use `preview_*` (broken for screenshots) instead of Playwright — for screenshots, drive the harness yourself; for DOM measurements, `browser_evaluate` works fine in web agents.

## Notes

- Web app basepath is `/app/` — navigate to http://localhost:3050/app/<route>.
- Browser sweep pipeline validated via web-tier sub-agent + save-to-disk screenshots read by orchestrator. Playwright MCP only available inside `web` tier, not main session. Run browser agents SERIALLY (single shared browser).
