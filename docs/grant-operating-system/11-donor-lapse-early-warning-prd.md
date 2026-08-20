# PRD: Donor Lapse Early-Warning Triggers (Roadmap #5)

## Status

Draft → In implementation (2026-06-16)

## Strategic Thesis

Retention reporting already tells a Development Director _what their retention
rate was last year_. It does not tap them on the shoulder when a specific
reliable donor is quietly slipping away. By the time a lapsed-donor report shows
the gap, the relationship is often already cold. The cheapest dollar a nonprofit
can raise is the one it keeps. This feature turns the giving history GrantPipe
already stores into a forward-looking early-warning signal: it flags donors whose
giving cadence has broken _before_ they fully lapse, and it proactively notifies
the team so a human can reach out while the relationship is still warm.

## Problem

GrantPipe records every gift with a date and amount, and `getRetentionStats`
already computes year-over-year cohort retention. But nothing watches an
individual donor's rhythm. A donor who gave every spring for four years and then
misses this spring is invisible until someone manually scans the list. There is
no surface that says "these donors are at risk right now" and no trigger that
tells staff to act.

## Target Users

- Development Directors — own donor relationships and win-back outreach.
- Executive Directors — want confidence that no reliable donor slips away unseen.

## Goal

Detect lapsing donors from existing gift history, surface them in a dedicated
prioritized "At-Risk Donors" view, and fire proactive in-app + email
notifications (the "triggers") when a donor crosses into a risk band — so the
team acts before the donor is lost.

## Scope — detection signal (no fabrication)

Detection reads only data GrantPipe already stores: a donor's gift dates and
amounts (`donations`, soft-delete aware, org-scoped). For each donor with giving
history we derive:

- **Recency** — days since last gift.
- **Cadence** — the donor's typical gap between gifts (median inter-gift interval
  over their history), used as the donor's personal baseline rather than a fixed
  global window.

We classify each donor into one risk band, computed by a **pure** function so it
is fully unit-testable without a database:

| Band       | Rule                                                                                   | Meaning                          |
| ---------- | -------------------------------------------------------------------------------------- | -------------------------------- |
| `lapsed`   | Last gift > 18 months ago                                                              | Already cold; reactivation needed |
| `at_risk`  | Days since last gift > 2× the donor's typical cadence (and not yet `lapsed`)           | Cadence clearly broken           |
| `lapsing`  | Days since last gift > 1.25× the donor's typical cadence (and not yet `at_risk`)       | Slipping; act now                |
| `none`     | Within expected cadence                                                                | Healthy                          |

Donors with only a single gift have no cadence baseline. They are classified only
by the 18-month recency rule (`lapsed` or `none`) and never as `lapsing`/`at_risk`,
because one gift is not a rhythm and guessing one would fabricate a signal.

A `riskScore` (0–100) orders the view: higher means more urgent, blending how far
past cadence the donor is with their lifetime giving value, so a lapsing major
donor outranks a lapsing one-time $10 giver.

**Honestly deferred (not v1):**

- **Auto-created pipeline tasks** — GrantPipe has no task/action-item entity yet.
  Building one is its own feature. The trigger here is the notification; a future
  task entity can subscribe to the same signal.
- **Auto-created saved segments** — `saved_segments.filters` uses an app-specific
  filter DSL the donor list consumes. Rather than guess that DSL, v1 ships a
  first-class At-Risk Donors view backed by its own endpoint. A future pass can
  persist the same query as a saved segment once the DSL is mapped.

These are written here so the deferral is explicit, not silent.

## Design

### Canonical contract (`packages/shared`)

Pure, DB-free classification in `packages/shared/src/validators/donor-lapse.ts`:

```
DONOR_LAPSE_RISK_BANDS = ["none", "lapsing", "at_risk", "lapsed"]
type DonorLapseRiskBand
classifyDonorLapseRisk({ giftDates: Date[], giftAmountsCents: number[], now })
  -> { band, daysSinceLastGift, typicalCadenceDays | null, riskScore, lifetimeGivingCents }
```

`riskScore` and band thresholds live here as named constants so the API, the
scheduled scan, and tests share one source of truth.

### Backend (`apps/api/src/domains/donors`)

- `lapse.service.ts` — `getAtRiskDonors(db, { orgId, now, bands?, limit? })`:
  loads each donor's gift history (org-scoped, soft-delete aware), runs the pure
  classifier, returns at-risk donors sorted by `riskScore` desc with contact
  identity, band, days since last gift, lifetime giving, and last gift date.
- Route `GET /api/donors/lapse-risk?bands=&limit=` under the existing donors
  routes, `requireRole("viewer")`, org-scoped, gated by `hasAutomationEmails`
  (growth+) — consistent with the feature's automation nature.

### Triggers — scheduled notification scan

- New notification type `donor_lapse_alert` added to `NOTIFICATION_TYPES`.
- `scanDonorLapseAlerts(db, env, now)` in the notifications domain, registered in
  the `scheduledJobs` array in `app.ts`. Reuses the existing recipient +
  business-hours + `notificationPreferences` + dedupe-key + `onConflictDoNothing`
  patterns from `sendScheduledGrantDeadlineReminders`. Idempotent.
- Fires when a donor crosses into `lapsing`/`at_risk`/`lapsed`. Dedupe key
  `donor_lapse:{contactId}:{band}` so a donor alerts once per band, not daily.
- Gated growth+ via `hasAutomationEmails`. Starter-tier orgs are skipped entirely
  (no donor scan, no in-app alert, no email), so the whole feature — the At-Risk
  view, in-app alerts, and email alerts — is Growth and up. This keeps starter
  users from receiving an in-app alert that links to a 402-gated view.

### Web (`apps/web`)

- New route `/_authenticated/donors/at-risk` → "At-Risk Donors" under the
  **Fundraising** nav section. Prioritized list: donor, risk band badge, days
  since last gift, lifetime giving, last gift date, link to donor detail.
- Band filter chips (pill, multi-toggle) + empty/loading/error states.
- A small risk badge on the donor detail header when a donor is at risk, linking
  back to the view. Reuse existing shell/list/badge primitives and pill buttons.

## Out of scope / non-goals

- No new task/action-item data model.
- No write actions from the view (it is a triage surface; outreach is logged on
  the donor record).
- No machine-learning scoring — the score is a transparent, explainable formula.

## Quality gates

- TDD throughout; 95%+ per-file coverage on every touched file.
- Pure classifier unit-tested exhaustively (single-gift, steady cadence, broken
  cadence, long-lapsed, no-history) without a DB.
- Service + route + scheduled scan tested with the API harness.
- Marketing page `donor-lapse-early-warning.md` (humanizer + third-grade-copy),
  passing the feature-landing-pages + entitlement contract tests. Framed around
  proactive early warning, distinct from the existing donor-retention-reporting
  page (which covers cohort reporting and scoring, not triggers).

## Rollout

Merge to master, apply migration (none expected — read-only over existing tables;
only the new `donor_lapse_alert` notification type, no schema change), deploy
api + web + site via Wrangler scripts.
