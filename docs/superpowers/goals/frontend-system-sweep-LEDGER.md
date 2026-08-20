# Frontend System Sweep — Live Ledger (lean)

**Goal (started 2026-05-28, "goal mode" — spans many sessions):** Find and fix EVERY frontend bug, missing/incomplete frontend feature, and missing/incorrect frontend↔backend wiring across the whole GrantPipe system. UI integration testing, UI system-integration testing, full local E2E. Sub-agent driven. Multiple review/fix cycles until nothing remains.

**This file is the source of truth across sessions. READ IT FIRST. UPDATE IT CONTINUOUSLY — but keep it lean.**

> **Why this file is short:** the full wave-by-wave history (Waves 1–242, ≈730 KB / ~182K tokens) was compacted on 2026-06-15 to stop it from blowing the context window every session. The complete verbatim history lives in **`frontend-system-sweep-ARCHIVE.md`** (same folder). Open the archive ONLY to look up a specific past wave/finding — never load it wholesale. When you complete a wave: append a one-line entry to "Recent waves" below, fold any durable lesson into the right section here, and append the full write-up to the ARCHIVE.

## Working context

- Per-wave worktree: `.worktrees/sweep-wNNN` (e.g. `.worktrees/sweep-w243`), branch off latest **local** master (`git checkout master && git pull` first — origin lags behind ff-merged parallel-agent commits). NOT the old `frontend-system-sweep` worktree.
- Prior findings spec (status was unknown at start; re-validate): `docs/superpowers/specs/2026-05-25-frontend-audit-sweep.md` (50 items).
- Canon: **all buttons are pills** (`rounded-full`) — enforced at `packages/ui` Button/IconButton base.
- Required per CLAUDE.md: TDD, 95%/file coverage (statements/branches/functions/lines) on every touched file, no `any`, no TODO, review→fix→merge→remove worktree→deploy via Wrangler.
- Local stack for live verification: `GRANTPIPE_WEB_PORT=3050 GRANTPIPE_API_PORT=5050`, `demo@grantpipe.com`.

## How a session should operate

1. Read this ledger. Pick the next OPEN item (or run a discovery wave if an area's inventory is stale).
2. Dispatch implementer subagent (TDD) for a non-overlapping file scope.
3. Spec-compliance review → fix. Code-quality review → fix.
4. Run relevant tests + `turbo typecheck` (Vitest/esbuild does NOT catch type errors). Mark item DONE with commit SHA.
5. Periodically run UI integration + local E2E (Playwright/preview) for cross-feature regressions.
6. When an area passes two consecutive review cycles, mark it VERIFIED.

`OPEN` not started · `WIP` in progress · `DONE` fixed+reviewed+tested · `VERIFIED` confirmed via UI/E2E · `WONTFIX` (with reason)

---

## Coverage map (each area must reach VERIFIED)

| Area                                    | Status                      | Notes                                                                                                                                    |
| --------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| apps/web — shell / routing / auth       | **VERIFIED**                | paywall, nav scoping, aria, latent typecheck all clean (W1, W148, W149)                                                                  |
| apps/web — domain pages                 | **PARTIAL** (near-verified) | filter-chrome + per-row scoping + destructive-confirm + field-parity (DEFECT-2) all closed; AUDIT-2/4/6/8/9 all resolved (W243–W250)     |
| packages/ui — components + tokens       | **VERIFIED**                | pills, token cleanup, DataTable aria, TabsList overflow, sidebar scroll-fade, file-input pill, Skeleton consistency done; UI-30 deferred |
| apps/site — marketing                   | **PARTIAL**                 | SITE-36/51/52 done; SITE-38/39 WONTFIX; SITE-47 open                                                                                     |
| Cross-cutting — frontend↔backend wiring | **VERIFIED**                | orphan-endpoint audit clean; cache-invalidation classes swept (W135–137); basepath bypass + silent-mutation-failure closed               |
| E2E / system integration                | **PARTIAL**                 | live walks through W226; AUDIT-1/2/4/6/8/9 all resolved (W242–W250); CODE-SPLIT-01 remains                                               |

---

## Verified-clean / DO NOT RE-HUNT

These defect CLASSES were swept clean across the surface. Do not re-discover them; only act if a NEW instance is introduced.

- **Pill / `rounded-full` canon** — source grep + computed-style re-walked clean (W1/cf74736, re-verified W241).
- **Empty-filter chrome** — suppressed via `hasXListChrome` on every list route (W141–145, W149).
- **Shared-mutation per-row disable scoping** — scoped to in-flight row via `mutation.variables` across all row-mapped surfaces (W131–134, W144–147, W149).
- **Ungated destructive actions** — all delete/remove/revoke route through `ConfirmDialog`; full source sweep clean (W148, W149, W160, W162).
- **Raw-anchor basepath bypass** — `RouterEmptyStateLink`; zero raw `<a href="/…">` / `window.location` nav remain (W142/81928455, W149).
- **Latent typecheck red** — repo-wide `turbo typecheck --force` = 6/6 packages, 0 errors (W148/92b83d2b, W149).
- **Silent non-Error rejection** — whole-app `instanceof Error` sweep; only 2 real (W129/9d35e1cf, W130/333fb586), both fixed.
- **Missing query-cache invalidation** — accounting/dashboard/payment/restriction/fund/funder/event-donation mutation→cache classes all swept (W135–138, W156–158, W163, W183–184).
- **Post-transaction side-effect anti-pattern** — donor-delete journal reversal moved inside txn (W231/01d94c42); codebase audit clean (W232).
- **DEFECT-2 detail field-parity** — events/subrecipients/grant-funder-reassign all editable (W218/5970eb43, W220/87b026c2, W221/90e1063a).
- **Double-submit + dialog-stays-open-on-failure** on confirm buttons (W228, W229/44fb1f5e).
- **Raw enum display** — `humanizeEnum()` applied app-wide (W236, W237/152b77ef).
- **`animate-pulse` hand-rolled skeletons** — repo-wide conversion to `<Skeleton>` complete (W238–240).
- **DataTable sort aria-label leak** (W159/b931fe24); **`aria-current` sidebar prefix leak** (W225/f18426ee).

## Open backlog

| ID            | Pri      | Item                                                                                                                                                                                                |
| ------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CODE-SPLIT-01 | LOW      | ~50 route files block code-splitting (~60 warnings/load). Template set W218; verify real bundle savings first; dedicated wave.                                                                      |
| UI-30         | P2       | Button `icon-*` sizes duplicate IconButton — migrate consumers, deprecate. Own wave.                                                                                                                |
| SITE-47       | P2       | Footer "For AI agents" group surfaces `llms.txt`/`AGENTS.md` — judgment call.                                                                                                                       |
| —             | cosmetic | List cards sparse vs dense grants table (product decision).                                                                                                                                         |
| CARD-TOOLTIP  | P3       | Entity cards (donors/funds/funders/reports) truncate titles with no consistent overflow tooltip; funder uses native `title`. Add a shared overflow-aware Shadcn tooltip if pursued (judgment call). |
| —             | chore    | ~12 orphaned `.claude/worktrees/` dirs (git-clean, harmless) — bulk-remove anytime.                                                                                                                 |

**REJECTED / WONTFIX — do not re-open:** AUDIT-3 (FAB corner-overlap = standard vendored widget), AUDIT-5 (`/app/cash` not a route; "Cash"→`/payments`), SITE-38 (SRI/consent on continuously-redeployed worker), SITE-39 (`/downloads/{slug}.pdf` is canonical contract-tested route), WIRE-REPORT-PERM (API enforces; Viewers/Auditors may generate per matrix), W236 remove-on-paid-request (intentional, backend supports).

## Key operational gotchas (don't relearn)

- **Don't trust the pre-commit green** — re-run `pnpm exec turbo typecheck test --force --filter=@grantpipe/web` (or `:coverage`) independently. Vitest/esbuild skips type errors.
- **Build before the gate** — `build-output.test.ts` reads `dist/`; run `pnpm --filter @grantpipe/web build` first in a fresh worktree.
- **Deploy from a worktree** needs `cp ../../../.env` into the worktree root, else `check:sentry-release:web` fails (loadRootDotEnv resolves to worktree root).
- **Route generation** — use the TanStack Router **vite plugin**, NOT the `tsr` CLI (that's the unrelated ts-remove-unused tool).
- **Portal auth is cookie-based** — `portal/*` routes don't use org-token headers.
- **Coverage gate = 95%×4 per touched file**; full web suite ~4300 tests, ~11–20 min; legacy baselines live in `verify-coverage-thresholds.mjs` (delete a file's entry when you bring it to ≥95×4).
- **Entry-chunk bundle ratchet** in `build-output.test.ts` — prefer lazy routes over raising it.
- **Stage explicit paths** (not `git add -A`); `.gitignore` covers `*.msg`/`*_LOG.txt`.
- **Local dev DB ≠ drizzle migrate target.** Wrangler dev reads `apps/api/.dev.vars` → local Postgres `localhost:55439/grantpipe`. But `pnpm --filter @grantpipe/db migrate` reads root `.env` → REMOTE Neon. So new migrations never reach the local DB automatically, and unrelated endpoints start returning generic 500s ("column does not exist") whenever the schema advanced. **Symptom:** a cluster of endpoints touching the same table 500 at once with bodies of just `{"error":"Internal Server Error"}` (handler hides the trace; see error-handler.ts). **Fix:** apply migrations to the local DB explicitly — `cd packages/db && DATABASE_URL="<value from apps/api/.dev.vars>" pnpm exec drizzle-kit migrate`. Probe a suspect column directly with the `pg` client against the `.dev.vars` URL before assuming a code bug. (W252)
- **ResizeObserver is a no-op mock** in `packages/ui/src/test-setup.ts` — drive fade tests with `scroll` events + manual scroll metrics. For ref-based hooks use **callback-ref + `useState`** so both null/element branches are covered.

---

## Recent waves (append one line per wave; full write-ups go to ARCHIVE.md)

- **W242** (bc644bc8, deployed) — Scroll-aware edge fades on `record` TabsList via shared `useTabsOverflow`+`RecordTabsList`; fixes AUDIT-1. All 9 record call sites benefit, zero churn.
- **W243–W249** (deployed) — accounting period-link (AUDIT-8), restriction amount+date context (AUDIT-2), Net Assets source caption (AUDIT-9; AUDIT-4 closed false), report Share gating (F1), ack-template Save dirty-gate (F4), billing CTA deep-link (F2), duplicate inline Team UI removed + redirect (F5). See per-wave write-ups below.
- **W250** (e66136d8, deployed) — Restriction-alert rows carry the restriction term title (`contextLabel` added to `RestrictionAlert`, surfaced first in `formatAlertContext`); strengthens AUDIT-2 disambiguation. api+web.
- **W251** (66900c16, deployed api `8e89b3b0`) — Radar reporting-requirement titles humanized: `buildReportingTitle()` maps enum keys (quarterly/annual/final/custom) → "Quarterly report" etc, skips duplicate "report" on free-text AI-extracted names ("Final Programmatic Report" stays), empty/whitespace → "Report". Fixes lowercase + "report report" titles. api-only; deadlines/service.ts 100%×4.
- **W252** (no code change — local-env artifact) — The two HIGH 500s from W251 discovery (`GET /api/events`, `GET /api/donors/{id}/donations`) were a **stale local DB**, NOT a prod bug. Both queries select all `donations` columns (events via relational `with`, donations via `getTableColumns`); local DB `localhost:55439/grantpipe` was missing the `designation` column (migrations 0058/0059 from `1882a697` never applied locally) → Postgres "column does not exist" → generic 500. Prod has the migration; both endpoints render fine in prod. Fixed by applying migrations to the LOCAL DB. Re-verified both → 200, data renders, 0 console errors.

- **W254** (71a2101c, deployed web) — Donor STAGE stat card rendered in tabular `font-mono` like a number, though it holds a label (e.g. "Major gift"). Switched it to the normal text font so it reads as a category, not a figure (P2-A). web-only. (Ledger commit `07a2b090` landed empty; recorded here retroactively.)
- **W253** — Reports page: three default-disabled actions (grant compliance report, acknowledgment letter, save acknowledgment template) gave NO on-screen reason they were inert, leaving 80-yo/first-time users stuck. Added a short inline hint under each, shown only when the button is disabled for its specific precondition (`complianceReportPackEnabled && !grantSelected`; `!donationSelected`; `canManageAcknowledgmentTemplate && !templateEditorDisabled && !isDirty`) so it never contradicts a plan-gate or pending-mutation disable. Each hint is `id`-linked to its button via `aria-describedby` for screen readers. Copy is plain/third-grade ("Choose a grant above to generate this report." etc.). Bumped `build-output.test.ts` entry floor 862_000 → 863_000 (route is in initial graph; strings can't be lazy-loaded). TDD: 1 new test asserts each hint shows + is associated, then clears once its precondition is met. Web coverage ≥95%/file. Merged `3d6220e7`, deployed web `2d690301-8714-4cf5-a0e8-c4dc60c3d6a1`.

- **W255** (5f000252 + a4de5161 + 43ee701d, deployed api `aa659c92` + web) — Funds list showed no per-fund balance (P2-C/P3-D). Added `summary` (allocated/expense/balance via `buildFundSummary`) to `listFunds` so each fund carries a current balance; surfaced it as a Balance line on each FundCard and a `balance` column in the Funds Ledger table. Hono RPC infers the new shape to the client (no shared-package change). Defense-in-depth follow-up (`a4de5161`): the allocation aggregate innerJoin was scoped only by grant-not-deleted, not `orgId` (unlike the sibling expense aggregate) — added `eq(grants.orgId, orgId)` per the row-level multi-tenancy canon. Rebase onto master folded in the Budget Sentinel merge (8a424d80), whose alert code grew the app-shell initial graph; bumped `build-output.test.ts` floors 864_000→870_000 (entry) and 2_110_000→2_120_000 (total initial JS), route-leak check still passes (`43ee701d`). TDD: api fund.service.test +3 (balance = allocated−expenses, zero, empty-data skip-aggregate), web funds/index +2 (card + ledger column). 95%/file. **Closes P2-C/P3-D and P2-A (W254).**

- **W256** (triage only, no code change) — Closed the remaining W251 discovery leftovers against source; **all non-defects**: P3-E "Outstanding Reimbursements $0" (query in `payments/request.service.ts:93` is correct; demo has no approved requests), P1-A "Net Assets $0" (GL/journal subsystem is independent of allocations; AUDIT-9 caption at `accounting/index.tsx:419` already explains it), P2-D grant-detail tabs (already uses `TabsList variant="record"` → `RecordTabsList` overflow fades, `grants/$grantId.tsx:1710`), P3-B event accent bar (`events/index.tsx:96`full-width`h-1.5`, not clipped), P3-A "From the start" (`accounting/periods.tsx:57`plain neutral text, not green). **P3-C re-framed:** FunderCard's native`title={funder.name}` (`funders/index.tsx:102`) is the only card giving an overflow affordance — sibling cards (donors:205, funds:128, reports:870) use plain `truncate` with none, so funder is the best-behaved, not a defect. Logged the "entity cards lack a consistent overflow tooltip" gap to the backlog (judgment call, not a bug).

- **W257** (db475d64, deployed web `a8675533-dae7-420f-9c8c-267ac874565f`) — Fresh discovery pass on settings surfaces. Fixed 4 genuine P3 polish defects: (1) `settings.team.tsx` invite + member cards used off-canon `rounded-lg`; bumped to the `rounded-2xl` card radius (PermissionMatrix inner sub-panel left `rounded-lg` intentionally). (2) `settings.portal-access.tsx` skeleton + 3 table wrappers `rounded-lg`→`rounded-2xl`; generated portal-link `Input` got an `id`/`<Label htmlFor>` association + `aria-label`. (3) `custom-fields-settings-section.tsx` field-type `SelectTrigger` got an `id`/`<Label htmlFor>` association. Source-contract tests (readFileSync) added across all three files (67 tests green). web-only. 95%/file. Closes the settings card-radius + label-association gaps.

- **W258** (3b8c19c9 + floor bump e57aa78a, deployed web `076de3a0-71c5-46e7-a026-a55d1d242b62`) — Event detail (`events/$eventId.tsx`). Volunteer Hours tab: hours + date inputs had only aria-label + placeholder (no visible `<Label>`, unlike the sibling volunteer-contact Select and attendee-donation inputs); added id/htmlFor-linked visible labels (date label reads "Volunteer date" to avoid colliding with the Overview tab's Date). Attendees tab: added a "No attendees yet." empty state matching the existing "No donations recorded yet." pattern. web-only, TDD (+28 assertions), 95%/file. Bumped `build-output.test.ts` entry floor 870_000→877_000 (master folded in the #10 Anomaly Detector merge; route-leak check still passes). **Post-merge** the total-initial-JS floor was also exceeded by sibling feature merges (measured 2,122,470); bumped 2_120_000→2_125_000 in a separate isolated worktree (`e57aa78a`), gate green (193 files / 4534 tests), ff-merged to master. No routes leaked.

- **W259** (72bdb32d, deployed web `e0c4c882-1631-4886-b69c-efa222aaae88`) — Journal-entry balance affordance. Both the JE full-page form (`accounting/journal/new.tsx`) and the JE dialog (`new-journal-entry-dialog.tsx`) showed only a generic "Unbalanced" / "Not balanced" label when debits ≠ credits, forcing the user to subtract the two totals by hand. Triaged against source (genuine gap: no difference surfaced), then replaced with the exact delta: page now shows "Off by {formatCurrency(|debits − credits|)}", dialog now shows "Not balanced · off by {…}". `formatCurrency` auto mode drops `.00` for whole dollars (so "$10", "$0.50") — consistent with the form's existing Debits/Credits totals. Also added `aria-label`s to the dialog's two number inputs (debit/credit per line; previously placeholder-only). web-only, TDD (replaced the stale "Unbalanced" assertions + added fractional-cent and off-by tests, 74 file tests green), 95%/file. Reviewed clean (sonnet). Build index chunk 874_270 < 877_000 floor (no floor bump needed). Deploy needed root `.env` copied into the worktree (Sentry `SENTRY_ORG`/`SENTRY_PROJECT_WEB` checked by `check:sentry-release:web`) — gitignored, not committed.

- **W260** (5c137da6, deployed web `ed3fa999-496f-4d20-833c-a0413b16cf5b`) — Subrecipient + program detail polish (triaged 19 sub-agent findings against source; most invalid — monitoring-log + corrective-action-due inputs already had aria-labels, budget-line inputs already labeled). Shipped: (1) `subrecipients/$subrecipientId.tsx` — corrective-action title Input had only a placeholder; added `aria-label="Corrective action title"`. (2) Removed a dead/unreachable `{!canUseMonitoring ? <Alert title='Upgrade required'>…</Alert> : null}` block (page returns TeachAndActEmptyState early when monitoring unavailable; also showed as uncovered lines); removed now-unused `Link` import. `SUBRECIPIENT_MONITORING_PLAN_LIST` still consumed by the empty-state description. (3) `programs/$programId.tsx` — replaced local `formatStatus` + two ad-hoc `charAt(0).toUpperCase()` with canonical `humanizeEnum` (preserving null→'active' via `humanizeEnum(status ?? 'active')`; identical output for active/archived/draft/approved, future-proofs multi-word enums) and converted route `errorComponent` from bare `<div className='p-8 text-destructive'>` to `<Alert variant='destructive'>` (new test asserts role='alert'). web-only, TDD (2 red→green; 113 file tests green), 95%/file (subrec 99.54, programs 99.33). Reviewed clean (sonnet). Build index chunk 874_050 < 877_000 floor (no bump). Deferred: budget-line `key={index}` (#18) → needs stable client ids; radius nits left per W257 sub-panel precedent.

- **W261** (9e37f5bf + floor bump 83000b50, deployed web `15119339-8306-4af9-8627-1f5815a446a0`) — Detail-route error-state consistency. Three TanStack Router detail routes (`reports/$reportId.tsx`, `funds/$fundId.tsx`, `donors/$contactId.tsx`) rendered their route `errorComponent` as a bare `<div className="p-8 text-destructive">…</div>` with no `role="alert"` and off-canon styling, unlike the rest of the app (and unlike the W260 program-detail fix). Converted all three to `<div className="p-4 sm:p-6 lg:p-8"><Alert variant="destructive" title="Failed to load page"><p>{error instanceof Error ? error.message : "Unknown error"}</p></Alert></div>`, giving each the accessible `role="alert"` announcement + consistent destructive panel. Also in `reports/$reportId.tsx` converted the `downloadError` bare div → `<Alert variant="destructive" title="Download failed">`. Intentionally left untouched: local `formatDisplayLabel`/`formatReportMetadataLabel` (split on `-`, IRS-990 special case — `humanizeEnum` only splits `_`, swap would regress) and cosmetic-only label nits. web-only, TDD (red→green; 200 file tests across the 3 test files; mock Alerts updated to carry `role="alert"`, downloadError asserted via `.closest('[role="alert"]')` since the full page has multiple alerts), 95%/file. Reviewed clean (haiku). Branched off a master folding in further sibling merges (pledge tracking et al.) that grew the initial graph; bumped `build-output.test.ts` entry floor 877_000→905_000 (measured 900,494) and total-initial-JS 2_125_000→2_150_000 (worktree build 2,146,604); the post-merge **master** build measured 2,150,289 (289 over), so a follow-up floor-only commit (`83000b50`) raised the total to 2_155_000 with headroom. Route-leak (modulepreload) check still passes throughout — no routes leaked.

- **W262** (76e34b63, deployed web `6fb5ba40-468b-4162-ab6e-655ea8c5d8b9`) — Donor-domain consistency: two small fixes. (1) `LogGiftDialog` (`components/dialogs/log-gift-dialog.tsx`) fund Select rendered an empty Radix listbox when the org had no funds and had no way to clear a chosen fund. Mirrored the canonical `donation-form.tsx` precedent: gated the whole fund block behind `funds.length > 0` and added a `NO_FUND_SENTINEL = "__none__"` reversible "No fund" `<SelectItem>` (`value={form.fundId || NO_FUND_SENTINEL}`, `onValueChange` maps sentinel→`""`); submit still omits `fundId` when empty. (2) Donor detail (`routes/_authenticated/donors/$contactId.tsx`) — four raw `"N/A"` empty cells (donation fundName/paymentMethod, volunteer event/program, volunteer notes) → muted em-dash `<span className="text-muted-foreground">—</span>`, matching the donors-area empty-cell convention (at-risk/pledges). web-only, TDD (red→green: updated the two empty-funds tests to assert the select is hidden, added "No fund" option + sentinel-clear round-trip tests, switched three `getAllByText("N/A")` assertions to `"—"`; 167 file tests green), 95%/file. Reviewed clean (haiku). Master unchanged at base `8536c0b1` → clean ff-merge; entry chunk held at 900,494 and build-output floors (905_000 / 2_155_000) unchanged; `turbo … --force` on master green (4684 tests). No route leak.

**NEXT (resume here):** Wave 263 — continue the fresh screen-by-screen live taste/UX/functional pass on less-audited surfaces via live E2E (web 3050 / api 5050, demo@grantpipe.com; apply local DB migrations first per W252 gotcha). Remaining low-pri backlog (re-verify against source first): BUDGET-LINE-KEY (programs budget-line `key={index}` → add stable client ids — W260 backlog), CODE-SPLIT-01 (~50 routes; measure real bundle savings before acting), UI-30 (Button icon-\* → IconButton migration), SITE-47 (footer "For AI agents" group — judgment call), CARD-TOOLTIP (entity cards lack a consistent overflow tooltip — W256 backlog). **Deploy gotcha (W259):** `pnpm run deploy:web` runs from its own REPO_ROOT and reads that tree's `.env`; a fresh worktree has none, so `check:sentry-release:web` fails on missing `SENTRY_ORG`/`SENTRY_PROJECT_WEB` — `cp <repo-root>/.env <worktree>/.env` before deploying (gitignored). **build-output floor gotcha (W261):** the floor measured in the worktree build can be a few hundred bytes UNDER the post-merge **master** build (master's dist is marginally larger), so the `turbo … --force` re-verify on master can fail the total-initial-JS assertion even after the worktree gate passed — set floors with headroom (e.g. +5_000) or be ready to land a follow-up floor-only commit on master. **Heads-up:** branch off latest **local** master and rebase before merge — parallel feature agents ff-merge into master and push the web entry-chunk floors; re-build web and bump floors if the route-leak check still passes. Registered worktrees `feat+02`/`feat+04`/`feat+05`/`feat+07`/`feat+10`/`ai-agents-integration`/`feat8-functional-expense` and branch `ads/executive-director-lps` (active in the MAIN tree) belong to other agents — leave them; never commit in the main tree.

(Superseded NEXT) Wave 257 — the W251 leftover batch is exhausted (all non-defects). Run a FRESH discovery wave on a less-recently-audited surface (candidates: settings/team/billing flows, import wizard, custom-fields, event detail, subrecipient detail, accounting journal entry form) via live E2E (web 3050 / api 5050, demo@grantpipe.com; apply local DB migrations first per W252 gotcha) to surface genuine new defects. Continue the fresh screen-by-screen live taste/UX/functional pass (web 3050 / api 5050, demo@grantpipe.com; apply migrations to local DB first per W252 gotcha). Remaining W251 discovery leftovers to triage against source on the healthy stack: P1-A Net Assets $0 contradiction on Accounting Overview (likely already mitigated by AUDIT-9 caption — verify, may be intentional); P2-B grant-table link underline/clickability; P2-D grant detail tab bar overflow/truncated final tab; P3-A fiscal periods "From the start" green; P3-B event card cropped green banner; P3-C funder name native title vs Shadcn tooltip; P3-E dashboard Outstanding Reimbursements always $0. **Heads-up:** when starting a wave, branch off latest **local** master and rebase before merge — parallel feature agents (Budget Sentinel etc.) ff-merge into master and can push the web entry-chunk floors in `build-output.test.ts`; re-build web and bump floors if the route-leak check still passes. Registered worktrees `feat+02`/`feat+04`/`feat+05`/`feat+07`/`feat+10`/`ai-agents-integration` belong to other agents — leave them.

- **W253** — Reports page: three default-disabled actions

---

## Wave 251 — Radar reporting-requirement titles humanized (deployed api `8e89b3b0`)

**Fixed: compliance Deadline Radar showed raw/duplicated report titles.** The reporting-requirement mapper built titles as `` `${row.reportType} report` ``. `report_type` is a free-text column — the create form constrains it to the `REPORT_TYPES` enum (`quarterly`/`annual`/`final`/`custom`), but the AI document-extraction path (`document-extractions/service.ts`) inserts whatever descriptive string the source PDF used. Result: enum-created rows rendered lowercase ("quarterly report") and AI rows could render "Final Programmatic Report report".

**Fix:** new `buildReportingTitle(reportType)` in `apps/api/src/domains/deadlines/service.ts`: trims; empty/whitespace → `"Report"`; known enum key → `` `${REPORT_TYPE_LABELS[key]} report` `` (Title-cased); otherwise append `" report"` only when `/\breports?\b/i` does not already match (so descriptive names that already say "report" pass through unchanged). Type-safe via `REPORT_TYPE_LABELS[normalized as ReportType]` + truthy guard (undefined for non-enum). End-to-end via Hono RPC — no web change needed; the radar feed consumes the title string directly.

**TDD:** 2 new `it()` blocks in `deadlines/service.test.ts` — enum-key humanization (all four) + free-text non-duplication (incl. case-insensitive "REPORT", whitespace trim, empty/whitespace fallback). Pre-existing `reportType: "Q2"` → "Q2 report" test still green. `service.ts` 100% stmts/branches/funcs/lines; api gate green.

**Review:** lite (haiku) sub-agent flagged the empty-string edge (`""` → `" report"`); hardened to return `"Report"` + added 2 covering assertions before merge. api-only change → ff-merge `23f44451..66900c16`, `--force` re-verify 4/4 tasks 0 cached, worktree removed (Windows "Directory not empty" → `rm -rf`), deployed `grantpipe-api` only.

## Wave 243 — Open Fiscal Period card links to period setup (deployed) — fixes AUDIT-8; AUDIT-6 already fixed

**Fixed AUDIT-8: the Accounting Overview "Open Fiscal Period" KPI card was a dead end.** When no period was open it showed a bare muted "None" with no way to act; when one was open it showed only the name. Both states now render a `<Link to="/accounting/periods">` — "Set up a period" (none) / "View periods" (open) — styled identically to the sibling "Connected Bank Accounts" card's Manage link (`text-primary underline-offset-2 hover:underline`). The card content restructured from `text-2xl font-semibold` to `space-y-1 text-sm` with the value in an inner `text-2xl font-semibold` div + a link line, matching the bank card. Route `/accounting/periods` confirmed to exist (`apps/web/src/routes/_authenticated/accounting/periods.tsx`).

**AUDIT-6 — NO ACTION NEEDED (already fixed):** re-checked the funders card grid (`funders/index.tsx:101-106`); the funder-name `<p>` already carries `title={funder.name}`, so long names already get a native tooltip. The Wave 241 finding is stale. Marking closed.

**Permission note:** the link is ungated (visible to all roles incl. viewer/auditor), consistent with the bank card's Manage link — only the "New journal entry" action is `canEdit`-gated. Auditors have read access to accounting, so the link is appropriate for them.

**TDD:** two tests added to `accounting/index.test.tsx` — "links to period setup when no open fiscal period exists" (asserts `Set up a period` link → `/accounting/periods`) and "links to period management when an open fiscal period exists" (`View periods` → `/accounting/periods`). Link text chosen to avoid `/manage/i`, so the existing bank-card "Manage link points to /accounting/bank" `getByRole` assertion stays unambiguous. 48/48 tests in the file pass; touched file `index.tsx` coverage 100% stmts/funcs/lines, 98.87% branch (only pre-existing line 78 uncovered) — above the 95% gate.

**Gate gotcha (build-output.test.ts):** first commit failed solely on `build-output.test.ts` ("Run `pnpm --filter @grantpipe/web build` first") — that test inspects `dist/` and needs a prior production build; unrelated to this change (the other 4353 tests passed). Ran `pnpm --filter @grantpipe/web build` (exit 0), re-committed → gate green.

**Review:** sub-agent code review (lite/haiku) — **No issues found** (route exists, Link already imported, styling/permission parity with bank card, no TODO/any/eslint-disable).

**Completion:** commit `8a13b2ae` gated green (full web typecheck + coverage, COMMIT_EXIT=0). ff-merged to master (`e0785c11..8a13b2ae`). Re-verified post-merge with `pnpm exec turbo typecheck test --force --filter=@grantpipe/web` (6/6 tasks, 184 files / 4354 tests, VERIFY_EXIT=0). Worktree `accounting-period-link` removed + branch deleted. `grantpipe-web` deployed via Wrangler — Version ID `c6b71b56-2146-4eae-a106-159f6b7eabdc` live on app.grantpipe.com.

(Wave 243 NEXT pointer superseded by Wave 244 below.)

## Wave 244 — Restriction-alert rows disambiguated with per-row amount+date context (deployed) — fixes AUDIT-2

**Fixed AUDIT-2: the Dashboard "Restricted balance risk" list rendered several rows with the IDENTICAL label "Release is missing evidence", leaving users unable to tell them apart.** Each row now renders a per-row context line (`amount · date`) beneath the label, derived from the `amountCents` and `date` fields the API already returns on every `RestrictionAlert` (`apps/api/src/domains/restrictions/service.ts` — `RestrictionAlert` type carries `amountCents: number` + `date: Date` for all alert types). New helper `formatAlertContext` in `dashboard.tsx` formats currency (via `formatCurrency`, "auto" cents) joined by `·` with a UTC-formatted date; it suppresses a zero amount (showing "$0.00" for a missing-evidence alert would falsely imply a zero-dollar release) and renders no context line when neither field is meaningful. Row layout changed `items-center`→`items-start` (rows are now two lines) and the type Badge gets `shrink-0`. New `RestrictionAlertRow` type replaces the three inline `{id,label,alertType}` shapes (props on `NeedsAttentionCard`, `ActionsView`, `RestrictionAlertsSection`, and the raw-data cast).

**Audit triage correction:** the audit's "one row shows a non-actionable badge while others have buttons" claim was a misobservation — every row renders a `Badge`, never a button. The real defect was the indistinguishable duplicate labels, which the amount+date context resolves.

**TDD:** added test "distinguishes same-label restriction alerts with per-row amount and date context" to `dashboard.test.tsx` — two identical-label release alerts with distinct amounts/dates (125050¢/90025¢, May 3 / Apr 12) assert `$1,250.50 · May 3, 2026` and `$900.25 · Apr 12, 2026`; an amount-only alert (5099¢, no date) asserts `$50.99`; a zero-amount/no-date missing-evidence alert asserts its `<li>` has no `<p>` context line (targeting the `<span>` in RestrictionAlertsSection since that label also appears in another section). 61/61 dashboard tests pass; `dashboard.tsx` coverage 99.85% stmts/lines, 95.45% branch — above the 95% gate.

**Review:** sub-agent code review (lite/sonnet) — **no blockers**. Two NITs: (1) zero-amount-with-date renders date only — confirmed intentional (suppressing a misleading "$0.00"); (2) strengthen the zero/no-date absence assertion — addressed by asserting `evidenceRow.querySelector("p")` is null.

**Completion:** commit `9b2e625d` gated green (full web typecheck + coverage, COMMIT_EXIT=0; needed a prior `pnpm --filter @grantpipe/web build` for `build-output.test.ts`). ff-merged to master (`8a13b2ae..9b2e625d`). Re-verified post-merge with `pnpm exec turbo test --force --filter=@grantpipe/web` (dashboard.test.tsx 61/61, VERIFY_EXIT=0). Worktree `dash-restriction-context` removed + branch deleted (Windows "Directory not empty" → manual `rm -rf` + `git worktree prune`). `grantpipe-web` deployed via Wrangler — Version ID `227a9406-7894-4e6c-a963-145be41961fd` live on app.grantpipe.com.

(Wave 244 NEXT pointer superseded by Wave 245 below.)

## Wave 245 — Net Assets source explained on accounting dashboard (deployed) — fixes AUDIT-9; closes AUDIT-4 as false-finding

**Fixed AUDIT-9: the Accounting Overview "Net Assets" KPI card read $0 / $0 / $0 with no explanation, confusing users whose fund balances are non-zero.** Root cause is two distinct accounting subsystems (confirmed via Explore agent): **Net Assets** is GL-based — `getTrialBalance()` / `getStatementOfFinancialPosition()` over `chart_of_accounts` + `journal_lines` + `journal_entries`, filtered to `account.type === "net_assets"` — so it is $0 until journal entries are posted to net-asset GL accounts. **Fund balances** are allocation-based — `buildFundSummary()` (`grants/summary.ts`), `currentBalanceCents = allocatedTotalCents - expenseTotalCents`. Both can legitimately disagree; this is a data fact, not a bug, so the fix is a UI explanation, not a data change. Added a caption inside the Net Assets card (`accounting/index.tsx`): when all three figures are exactly 0 it reads "No journal entries yet. This fills in as you post them."; otherwise "From posted journal entries." (`text-xs text-muted-foreground`). Negative balances correctly fall to the non-zero branch (strict `=== 0` on all three).

**Copy:** ran `humanizer` (clean — short, factual, no AI tells, no em dashes) then `third-grade-copy` (passes — common words, sentences <12 words; "posted journal entries" is a necessary finance term the audience knows).

**AUDIT-4 — CLOSED as false-finding (NO ACTION).** Investigated + live-verified the donors List/Board toggle at 390px: `ViewToggle` is a compact `rounded-full` radiogroup, the `FilterBar` `flex-wrap`s, and the kanban board is `hidden md:block` so it never renders on mobile (board view degrades to the single-column mobile card list). At 390px `scrollWidth === clientWidth` (no overflow). The Wave 241 audit observation was stale.

**TDD:** two tests added to `accounting/index.test.tsx` — net-asset data present asserts "From posted journal entries."; empty trial balance asserts the empty-state line renders AND the plain caption is absent. 49/49 tests in the file pass.

**Review:** sub-agent code review (lite/haiku) — **No issues found** (zero-state logic sound incl. negative balances, caption correctly inside the non-loading branch, semantic `<p>`, style parity).

**Completion:** commit `24dd82a3` gated green (full web typecheck + coverage 12m, ≥95%/file, COMMIT_EXIT=0; built web first for `build-output.test.ts`). master had advanced twice mid-flight (other agents) → rebased onto `0ffea5ba` (clean, no conflicts), ff-merged to master as `4c8da844`. Re-verified post-merge with `pnpm --filter @grantpipe/web exec vitest run ...accounting/index.test.tsx` (3/3 net-asset tests pass). Worktree `net-assets-explainer` removed (Windows "Directory not empty" → branch -D + `rm -rf` + prune). `grantpipe-web` deployed via Wrangler — Version ID `edb0fcef-aa6b-4126-a8b5-dbad8c0fa526` live on app.grantpipe.com.

(Wave 245 NEXT pointer superseded by Wave 246 below.)

## Wave 246 — Report "Share" button gated on readiness (deployed) — fixes audit Finding 1

**Fixed Finding 1: the report detail page "Share" button was always enabled.** On `reports/$reportId.tsx` the Download button is gated behind `canDownloadArtifact = artifact.status === "ready"` (and hidden otherwise, with an Alert explaining why), but the Share button rendered unconditionally. `handleShareClick` opens `QuickShareSheet` with `scopeType="generated_report"`, minting a portal reviewer link to the report — so a user could share a link to a still-generating or failed report, producing a broken/empty reviewer view. Fix: added `disabled={!canDownloadArtifact}` to the Share button so it matches the Download gating. Minimal, consistent, no copy/data change. (@grantpipe/ui Button `variant="outline"` is already pill-shaped — no geometry change.)

**Triage of the Wave 246 Explore-agent audit (8 findings; verified against source before acting):**

- **Finding 1 — REAL, FIXED** (this wave).
- **Finding 3 — FALSE (no action).** Claimed settings hash-nav items (Billing/etc.) leave the URL on a subroute so the wrong panel renders. Source disproves it: those items are `<Link to="/settings" hash={s.id}>`, which navigates the pathname to `/settings`, making `routeSection` null so the hash section renders correctly. Do not re-open.
- **Remaining backlog (each still needs re-verification against source before acting):** Finding 7 (settings.portal-access.tsx empty "Reviewer sessions" state has prose but no inline invite button → add one calling `setInviteOpen(true)`); Finding 4 (reports/index.tsx Save acknowledgment-template button not disabled when `!isDirty` → add `|| !isDirty` to `templateEditorDisabled`); Finding 2 (settings.portal-access.tsx `<Link to="/settings/billing">` uses a redirect shim → prefer `<Link to="/settings" hash="billing">`); Finding 6 (reports/$reportId.tsx preview iframe hardcodes `bg-white` → `bg-background`, nit); Finding 8 (confirm @grantpipe/ui Button default is `rounded-full` before claiming any settings button needs a pill fix — likely already pill); Finding 5 (settings.tsx duplicate inline team section vs settings.team.tsx — minor maintenance hazard).

**TDD:** added `expect(screen.getByRole("button", { name: "Share" })).toBeDisabled();` to the existing pending and failed tests in `$reportId.test.tsx`. Confirmed red (stashed source → "suppresses" tests fail) then green (26/26 in file). "Enabled when ready" path stays covered by the existing share-sheet click tests (they only pass if the button is enabled).

**Review:** sub-agent code review (lite/haiku) — **No issues found** (logic sound, matches Download gating, tests adequate, no `any`/TODO/eslint-disable, button already pill).

**Completion:** commit `cef8bdc9` gated green (full web typecheck + coverage ~12.5m, 4365/4365 tests, ≥95%/file, COMMIT_EXIT=0; first commit failed on `build-output.test.ts` because `dist/` was stale → built web, re-committed). master had advanced (other agents) → rebased onto master (clean, REBASE_EXIT=0), ff-merged as `9c5d442e`. Re-verified post-merge (26/26 in file). Worktree `reports-share-gate` removed (Windows "Directory not empty" → `rm -rf` + prune). `grantpipe-web` deployed via Wrangler — Version ID `d09152fa-fe37-4574-b4f2-cbe938adef26` live on app.grantpipe.com.

(Wave 246 NEXT pointer superseded by Wave 247 below.)

## Wave 247 — Acknowledgment-template Save gated on `isDirty` (deployed) — fixes audit Finding 4

**Fixed Finding 4: the "Save acknowledgment template" button on `reports/index.tsx` was always enabled** (`disabled={templateEditorDisabled}`), letting users fire a no-op mutation that re-saves the already-saved template. Fix: changed the Save button to `disabled={templateEditorDisabled || !isDirty}`, where `isDirty` (already defined in the file) is true only when a draft field differs from the loaded template. The three editing Textareas keep `disabled={templateEditorDisabled}` (NOT gated on `isDirty`) so the user can still type to make the form dirty.

**The audit's suggested fix was WRONG — rejected via source triage.** Finding 4 proposed adding `|| !isDirty` to `templateEditorDisabled` itself. That would also disable the Textareas, deadlocking the form: a clean form can never be edited to become dirty, so the button would never enable. Correct fix gates only the Save button. Validates the skeptical-triage discipline (an audit's recommended fix can be wrong).

**TDD:** new test asserts the Save button is disabled on load (clean) and enabled after editing a field; updated existing save tests across both report test files to edit a field before clicking Save. Confirmed green (4398/4398).

**Review:** sub-agent code review (lite/haiku) — **No issues found** (no deadlock across all states: loading/clean/dirty/error paths verified; textareas not gated on isDirty; tests adequate; no `any`/TODO/eslint-disable; button already pill).

**Completion:** commit `48825f89` gated green (full web typecheck + coverage, 4398/4398, ≥95%/file; first commit failed because 2 tests in `__tests__/reports-pages.test.tsx` clicked Save without editing — fixed and re-committed). Rebased onto master (clean), ff-merged as `2237652e`. Worktree `ack-save-dirty` removed (Windows `rm -rf` + prune + branch -D). `grantpipe-web` deployed via Wrangler — Version ID `686b86c6-19f7-4cb7-92c9-1ac48dc50aad` live on app.grantpipe.com.

(Wave 247 NEXT pointer superseded by Wave 248 below.)

## Wave 248 — Billing CTAs navigate straight to `settings#billing` (deployed) — fixes audit Finding 2

**Fixed Finding 2: nine in-app billing CTAs pointed at `/settings/billing`**, a redirect-shim route that renders a "Redirecting…" spinner before calling `navigate({to:"/settings", hash:"billing"})`. That flash is fine for external Stripe deep-links carrying `?checkout`/`?portal` (the reason the shim must stay) but wrong for internal navigation. Switched seven `<Link>`s to `to="/settings" hash="billing"` and two `TeachAndAct` `primaryAction` props to `href: "/settings#billing"`, across `settings.portal-access.tsx`, `restriction-upgrade-prompt.tsx`, `evidence-bundles/index.tsx`, `grants/$grantId.tsx` (2), `subrecipients/$subrecipientId.tsx` (2), `subrecipients/index.tsx` (2). The redirect route itself is untouched.

**Finding 7 = NON-ISSUE (triaged, not acted):** the "Reviewer sessions" section already has a persistent header "Invite a reviewer" Button calling `resetInviteSheet(); setInviteOpen(true)` directly above the empty-state prose. No inline empty-state button needed — the earlier NEXT pointer's suggestion was wrong.

**TDD:** updated each affected test file's `@tanstack/react-router` `Link` mock to honor the `hash` prop (`href = hash ? `${to}#${hash}` : to`) so assertions are meaningful, and flipped the `/settings/billing` → `/settings#billing` href assertions. Confirmed green (4398/4398 web).

**Latent master break fixed first (independent of W248).** A parallel agent's merge `926a9d31` added `restriction-aware-gl-classification.md` to `packages/shared` marketing content but (a) left the knowledge artifacts stale and (b) shipped a `seoDescription` of 220 chars (SERP-safe is 120–160) and a FAQ line "contact the GrantPipe team" that the tier-copy contract reads as the retired "GrantPipe Team" plan. This broke the site gate for **every** commit touching `packages/shared`, blocking W248's own commit. Fixed as a standalone master hotfix `05298817`: tightened the description to 147 chars, changed to "contact our team", regenerated knowledge artifacts. Lesson: when `pnpm knowledge:check` or the site metadata/tier-copy gates fail on a commit, suspect a recently-merged marketing-content file, not your own change.

**Review:** sub-agent code review (lite/haiku) — **CLEAN**: all 7 Links carry both `to` and `hash` (no half-edits), both primaryAction hrefs correct, zero `/settings/billing` source stragglers (only the shim route + generated routeTree), test mocks render the hash, no `any`/TODO/debug.

**Completion:** hotfix `05298817` gated green (shared+site+web+ui coverage). W248 committed `e5e867c0` (web coverage 4398/4398, ≥95%/file). ff-merged to master (`e5e867c0`). Worktree `sweep-w248` removed (branch -D + prune + `rm -rf`). Deploys: `grantpipe-web` (Version ID `30d5e80c-6f24-45c3-a986-9b25c232888c`) + `grantpipe-site` (Version ID `0e5a8cf5-76f2-4225-b438-d54beb8ca4a7`) via Wrangler. Note: site deploy needs a clean build alone — running it while a web build shares the vite cache produces a phantom `ERR_MODULE_NOT_FOUND` on a prerender chunk; remedy is `rm -rf apps/site/dist apps/site/.astro node_modules/.vite` then deploy with no concurrent build.

## Wave 249 — Removed duplicate inline Team UI; `/settings#team` redirects to canonical route (deployed) — fixes audit Finding 5

**Fixed Finding 5: `settings.tsx` carried a full duplicate inline Team section** (member list, role editor, invite-link generator, remove-member confirm dialog) that duplicated the canonical `settings.team.tsx` route. Two sources of truth for the same UI drift apart. Removed the inline `<section id="team">` block and all its now-dead support: state (`inviteRole`, `inviteLink`, `inviteError`, `inviteCopied`, `teamMutationError`, `confirmRemoveMemberId`, `memberToRemoveSettings`), handlers (`handleRemoveMember`, `handleCreateInvite`, `handleCopyInviteLink`, `handleUpdateMemberRole`), the `formatSettingsLabel` helper, the `useOrgTeam` query, the remove-member `ConfirmDialog`, and now-unused imports (`INVITABLE_ROLES`, `Role`, `buildInviteUrl`, `useOrgTeam`, `ConfirmDialog`). Added a redirect effect so legacy `/settings#team` deep-links land on the canonical `/settings/team`:

```
useEffect(() => {
  if (!routeSection && activeSection === "team") {
    void navigate({ to: "/settings/team", replace: true });
  }
}, [routeSection, activeSection, navigate]);
```

The `team` sidebar entry stays (it links to `/settings/team`). `settings.team.tsx` is untouched — it remains the single source of truth and has the richer UI (separate Invite-settings and Members sections with permission matrices).

**Finding 6 = NON-ISSUE (triaged, not acted):** `reports/$reportId.tsx:274` hardcodes `bg-white` on the report-preview iframe wrapper. That is an intentional white surface matching the PDF/print output (a report preview should look like paper, not the app chrome). Left as-is; do not re-open.

**TDD:** `settings.test.tsx` went 51 → 42 tests — removed 9 inline-team tests, added 3 redirect / non-redirect tests plus a source-contract test asserting `id="team"` is absent and `/settings/team` is present. Test `Link` mock now honors the `hash` prop and mocks `useNavigate`. Coverage on `settings.tsx`: 99.16% stmts / 95.45% branch / 100% funcs (uncovered 184-186 = pre-existing `handleDeleteAccount` "Type DELETE to confirm" early-return, not introduced here).

**Review:** sub-agent code review (lite/haiku) — **CLEAN** (no dangling references to removed symbols, redirect guarded on both `routeSection` and `activeSection` so the canonical route itself never loops, imports all used, no `any`/TODO/eslint-disable).

**Completion:** commit `a9af68f4` gated green (full web typecheck + coverage, 187 files / 4404 tests, ≥95%/file; first commit failed lint-staged on a stray unused `act` import — fixed and re-committed). ff-merged to master (`a9af68f4`). Re-verified post-merge with `--force` (0 cached, 187/187, 4404/4404). Worktree `sweep-w249` removed; **also bulk-removed all orphaned `.worktrees/sweep-w*` dirs** (backlog chore — now clear). `grantpipe-web` deployed via Wrangler — Version ID `7a6d15c7-feea-4de3-bb2d-da2428cd2f7e` live on app.grantpipe.com. (Web-only change; site/api untouched.)

(Wave 249 NEXT pointer superseded by Wave 250 below.)

## Wave 250 — Restriction-alert rows now carry the restriction term title (deployed) — strengthens AUDIT-2

**Built on W244.** W244 gave each "Restricted balance risk" row an `amount · date` context line. But two release alerts under _different_ restriction terms can still share the same label AND the same amount/date, so amount+date alone does not always disambiguate. W250 surfaces the **restriction term title** as the primary context token so each row names _which_ restriction it belongs to.

**Change (Hono RPC end-to-end):** added `contextLabel: string | null` to the `RestrictionAlert` type in `apps/api/src/domains/restrictions/service.ts`. The three release/term-conflict detectors (`detectReleasesWithoutSupport`, `detectReleaseTermConflicts`, `detectExpenseTermConflicts`) now `.select` `restrictionTerms.title` and set `contextLabel` to it; the detectors whose label already embeds the term title (`detectMissingEvidence`, `detectExpiredTimeRestrictions`, `detectNegativeBalances`) set `contextLabel: null` to avoid duplicating it. The web type `RestrictionAlertRow` gained `contextLabel?: string | null`; `formatAlertContext` now prepends `contextLabel` (when present) ahead of amount and date, joined by `·`.

**TDD:** `service.test.ts` (47 tests) asserts a release-without-support alert carries `contextLabel` = term title and term-embedded alerts carry `contextLabel: null`. `dashboard.test.tsx` extended so the duplicate-label release alerts now also carry distinct `contextLabel` titles and assert both render. Coverage: service.ts 100/97.08/100; dashboard.tsx 99.77/95.02/100 — above the 95×4 gate.

**Review:** sub-agent code review (lite) — **CLEAN** on first pass (no `any`/TODO/eslint-disable; null-handling correct; no duplicate title rendering).

**Completion:** commit `e66136d8` gated green (api+web typecheck + coverage, COMMIT_EXIT=0; web built first for `build-output.test.ts`). ff-merged to master (`282de147..e66136d8`). Re-verified post-merge `pnpm exec turbo typecheck test --filter=@grantpipe/api --filter=@grantpipe/web --force` (7/7 tasks, 0 cached, VERIFY_EXIT=0). Worktree `sweep-w250` removed + branch deleted (Windows "Directory not empty" → manual `rm -rf`). Deployed both (api changed too): `grantpipe-api` Version ID `50936821-dedb-486b-8f64-b52bfc42b9fb`, `grantpipe-web` Version ID `ca37ac5f-af07-4554-9d7c-2c7987e866dc` — both live.

**NEXT (resume here):** Wave 251 — continue the holistic per-screen taste/UX/functional sweep per the goal. The audit finding backlog (Findings 1–8 + AUDIT-1/2/4/6/8/9) is exhausted; do a FRESH screen-by-screen live pass (web 3050 / api 5050, demo@grantpipe.com) rather than draining the empty list. Remaining low-pri backlog (re-verify against source first): CODE-SPLIT-01 (~50 routes; measure real bundle savings before acting), UI-30 (Button icon-\* → IconButton migration), SITE-47 (footer "For AI agents" group — judgment call), list cards sparse vs dense grants table (product decision). Registered worktrees `feat+02-compliance-deadline-radar` / `feat+04` / `feat+05-donor-lapse-warning` / `feat+07` (under `.claude/worktrees/`) belong to other agents — leave them.
