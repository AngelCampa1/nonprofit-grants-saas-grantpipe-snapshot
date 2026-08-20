# PRD: Overspend / Underspend Sentinel (Roadmap #3)

## Status

Draft → In implementation (2026-06-16)

## Strategic Thesis

Budget-vs-actual reporting tells an Executive Director what already happened.
It does not tap them on the shoulder when a grant line is on track to blow past
its approved budget, or when restricted money is going to expire unspent. Both
failures cost real money: an overspend on a federal award can become a
disallowed cost the org has to repay, and unspent restricted funds that lapse
are donor money the mission never used. This feature turns the posted ledger
GrantPipe already keeps into two forward-looking tripwires and notifies the team
while there is still time to act.

## Problem

GrantPipe already posts every expense to the GL, allocates expenses to grant
budget lines (`grant_budget_line_allocations`), and tracks restricted-fund
balances against restriction terms with end dates. `getBudgetVarianceRows`
already computes budgeted vs actual vs planned per line. But nothing watches
these continuously. Today a Development/Finance lead only sees an overspend when
they open the budget report, and only notices unspent restricted money when the
restriction has already expired. There is no surface that says "these lines will
overspend" or "this restricted balance lapses in 30 days" and no proactive
trigger that tells staff to act before the deadline.

## Target Users

- Executive Directors — accountable for not overspending awards and not letting
  restricted money lapse.
- Finance / Grants managers — own the budget lines and fund balances day to day.

## Goal

Continuously watch every active grant's approved budget lines and every
restricted-fund restriction term, classify each into a severity band, surface
them in a prioritized "Budget Sentinel" view, and fire proactive in-app + email
alerts when a line crosses into an overspend band or a restricted balance is at
risk of lapsing unspent — so the team acts before the money is lost.

## Scope — detection signals (no fabrication)

Detection reads only data GrantPipe already stores. Two independent signals:

### A. Grant budget-line overspend

For each grant with an `approved` budget version, reuse the existing
`getBudgetVarianceRowsFromData` to compute per line:

- `actualCents` — posted allocations against the line.
- `plannedCents` — committed/planned future spend.
- `approvedAmountCents` — the approved budget.

Classify each line by a **pure** function:

| Band                  | Rule                                                              | Meaning                                |
| --------------------- | ----------------------------------------------------------------- | -------------------------------------- |
| `over_budget`         | `actualCents > approvedAmountCents`                               | Already over; disallowed-cost risk now |
| `projected_overspend` | `actualCents + plannedCents > approvedAmountCents` (not over yet) | On track to overspend                  |
| `near_limit`          | `actualCents + plannedCents >= 90%` of approved (not above)       | Approaching the cap                    |
| `ok`                  | otherwise                                                         | Healthy                                |

Lines with a zero/negative approved amount are skipped (no meaningful ratio).

### B. Restricted-fund underspend / lapse

For each `restriction_terms` row with a non-null `endDate`, compute the live
balance (`beginningBalanceCents + additions − releases`). Classify by days
until the restriction `endDate` and remaining balance:

| Band             | Rule                                      | Meaning                          |
| ---------------- | ----------------------------------------- | -------------------------------- |
| `lapsed_unspent` | `endDate <= now` and balance > 0          | Restricted money already expired |
| `lapsing_soon`   | `0 < daysUntilEnd <= 30` and balance > 0  | Will lapse within a month        |
| `lapse_watch`    | `30 < daysUntilEnd <= 90` and balance > 0 | Lapse risk on the horizon        |
| `ok`             | balance <= 0, or `daysUntilEnd > 90`      | Healthy                          |

A `riskScore` (0–100) orders the unified view, blending severity band with
dollar magnitude (a $200k projected overspend outranks a $500 one; a large
restricted balance lapsing next week outranks a tiny one in 90 days). The score
is a transparent named formula, no machine learning.

**Honestly deferred (not v1):**

- **Auto-created journal entries or budget revisions** — the Sentinel detects and
  notifies; it never posts a correcting entry or moves money on its own. Remedy is
  a human decision.
- **Per-line spend-rate forecasting from historical burn** — v1 uses
  approved-vs-actual-plus-committed, not a time-series projection. A future pass
  can add burn-rate extrapolation once it is validated against real grant data.

These are written here so the deferral is explicit, not silent.

## Design

### Canonical contract (`packages/shared`)

Pure, DB-free classification in
`packages/shared/src/validators/budget-sentinel.ts`:

```
BUDGET_OVERSPEND_BANDS  = ["ok", "near_limit", "projected_overspend", "over_budget"]
FUND_UNDERSPEND_BANDS   = ["ok", "lapse_watch", "lapsing_soon", "lapsed_unspent"]
NEAR_LIMIT_RATIO        = 0.9
LAPSING_SOON_DAYS       = 30
LAPSE_WATCH_DAYS        = 90
classifyBudgetLineOverspend({ approvedAmountCents, actualCents, plannedCents })
  -> { band, projectedCents, overByCents, utilizationPercent, riskScore }
classifyFundUnderspend({ endDate, balanceCents, now })
  -> { band, daysUntilEnd, balanceCents, riskScore }
```

Thresholds and `riskScore` live here as named constants so the API, the
scheduled scan, and tests share one source of truth.

### Backend (`apps/api`)

- `apps/api/src/domains/grants/sentinel.service.ts` —
  `getBudgetSentinel(db, { orgId, now, kinds?, limit? })`: scans active grants'
  approved budget lines (reusing `getBudgetVarianceRows`) and restriction terms
  (org-scoped, soft-delete aware), runs the pure classifiers, returns a unified
  list of at-risk items sorted by `riskScore` desc, plus totals per band. The
  view shows items whose band is not `ok`.
- Route `GET /api/grants/budget-sentinel?kinds=&limit=` under the grants routes,
  `requireRole("viewer")`, org-scoped, gated by `canUseGrantBudgetAlerts`
  (Growth+) returning the existing 402 `insufficient_plan` shape. `totals` are
  computed over the full at-risk population, not the filtered/limited slice.
  `kinds` accepts only `overspend` and `underspend` tokens.

### Triggers — scheduled notification scan

- New notification types `grant_overspend_alert` and `fund_underspend_alert`
  added to `NOTIFICATION_TYPES`.
- `scanBudgetSentinelAlerts(db, env, now)` in the notifications domain,
  registered in the `scheduledJobs` array in `app.ts`. Reuses the existing
  recipient + business-hours + `notificationPreferences` + dedupe-key +
  `onConflictDoNothing` patterns from `scanDonorLapseAlerts`. Idempotent.
- Starter-tier orgs are skipped entirely (no scan, no in-app, no email) via
  `canUseGrantBudgetAlerts`, so the whole feature is Growth and up. This keeps
  starter users from getting an in-app alert that links to a 402-gated view.
- Fires when a line crosses into `projected_overspend`/`over_budget` or a fund
  crosses into `lapse_watch`/`lapsing_soon`/`lapsed_unspent`. Dedupe keys
  `grant_overspend:{budgetLineId}:{band}` and `fund_underspend:{termId}:{band}`
  so each item alerts once per band, not daily.

### Web (`apps/web`)

- New route `/_authenticated/grants/sentinel` → "Budget Sentinel" under the
  **Compliance** nav section (alongside Deadline Radar). Prioritized unified
  list: item (grant line or fund), kind, severity band badge, projected/over
  amount or balance + days to lapse, link to the grant or fund detail.
- Kind filter chips (pill, multi-toggle) + empty/loading/error/plan-gated
  states. Reuse existing shell/list/badge primitives and pill buttons.

## Out of scope / non-goals

- No write actions from the view (it is a triage surface; the fix is a budget
  revision or a spend decision made on the grant/fund record).
- No automated journal entries, budget edits, or fund transfers.
- No machine-learning forecasting — the bands and score are transparent formulas.

## Quality gates

- TDD throughout; 95%+ per-file coverage on every touched file.
- Pure classifiers unit-tested exhaustively (under/at/over budget, zero approved,
  lapsed/soon/watch/ok, zero balance, far-future end date) without a DB.
- Service + route + scheduled scan tested with the API harness.
- Marketing page `grant-budget-sentinel.md` (humanizer + third-grade-copy),
  passing the feature-landing-pages + entitlement contract tests. Framed around
  proactive overspend and lapse prevention, distinct from the existing
  grant-calendar-deadline-alerts and restricted-fund-tracking pages.

## Rollout

Merge to master, no migration expected (read-only over existing tables; only the
two new notification types, no schema change), deploy api + web + site via
Wrangler scripts.
