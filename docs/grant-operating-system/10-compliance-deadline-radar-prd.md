# PRD: Compliance Deadline Radar (Roadmap #2)

## Status

Draft → In implementation (2026-06-15)

## Strategic Thesis

Every dated obligation a nonprofit owes already lives in GrantPipe, but it is
scattered: grant application deadlines on the grant, reporting requirements and
closeout items in the compliance domain, restriction-release dates on
restriction terms, and fiscal-period closes in accounting. Staff have to open
four screens to answer one question — "what is due, and when?" The Radar unifies
every dated obligation GrantPipe already owns into one forward-looking feed,
grouped by urgency, filterable by type, with one click through to the source
record. This is the screen an Executive Director opens first each morning.

## Problem

There is no single place to see all upcoming compliance obligations. The
calendar (`/calendar`) shows only three grant-scoped kinds for one month at a
time. The dashboard shows a capped 30-day slice. Restriction-release dates and
fiscal-period closes are not surfaced anywhere proactively, so they are missed
until they are overdue.

## Target Users

- Executive Directors — want one confidence-giving "what's due" view.
- Finance / Development Directors — own the reporting, closeout, restriction,
  and period-close work the Radar tracks.

## Goal

One unified, forward-looking feed of every dated obligation, grouped into
urgency bands (Overdue, Due today, This week, This month, Later), filterable by
obligation type and status, each row linking to its source record. Plus
proactive notifications for the two obligation kinds not previously alerted
(restriction releases and fiscal-period closes).

## Scope — obligation sources (no fabrication)

The Radar aggregates only dated obligations GrantPipe already stores:

| Kind                   | Source table                  | Date column                        | Status logic                                              |
| ---------------------- | ----------------------------- | ---------------------------------- | -------------------------------------------------------- |
| `application_deadline` | `grants`                      | `applicationDeadline`              | overdue / due_today / upcoming                            |
| `reporting_requirement`| `grant_reporting_requirements`| `dueDate`                          | submitted (resolved) else derived overdue/upcoming        |
| `closeout_item`        | `grant_closeout_items`        | `dueDate`                          | completed (resolved) else overdue/upcoming                |
| `restriction_release`  | `restriction_terms`           | `endDate`                          | released (resolved, no remaining balance) else upcoming   |
| `period_close`         | `fiscal_periods`              | `endDate`                          | closed/locked (resolved) else due-to-close after endDate  |

**Honestly omitted from v1** (not modeled, would require fabricating data):
audit windows (no per-org audit-window entity; single-audit is a threshold
determination, not a scheduled date) and pledge installments (no installment
table — `donations.type = 'pledge'` has no due-date schedule). These are noted
here so a future feature can add them when the data model supports them.

## Design

### Canonical obligation contract (`packages/shared`)

A single `RadarObligation` shape all sources normalize to:

```
RadarObligation = {
  id: string;                 // stable per source row: `${kind}:${sourceId}`
  kind: RadarObligationKind;  // the 5 kinds above
  title: string;              // e.g. "Q2 Financial report"
  contextLabel: string;       // e.g. grant name / fund name / "FY2026 Q2"
  dueDate: string;            // ISO
  daysUntilDue: number;       // timezone-aware, from getDaysUntilDeadline
  status: RadarObligationStatus; // overdue | due_today | upcoming | resolved
  urgencyBand: RadarUrgencyBand; // overdue | due_today | this_week | this_month | later
  target: { type: "grant" | "fund" | "fiscal_period"; id: string };
}
```

`resolved` obligations (submitted/completed/released/closed) are excluded from
the feed by default and from notification scans; an `includeResolved` flag may
surface them for audit review.

### Backend

- New domain `apps/api/src/domains/deadlines/` with `service.ts` (collector +
  banding) and `routes.ts` (`GET /api/deadlines`).
- The collector is a set of pure per-source mapping functions plus one
  `collectObligations(db, { orgId, now, horizonDays })` that runs the source
  queries and returns `RadarObligation[]`. Timezone-aware via the org timezone
  and the existing `getDaysUntilDeadline` helper.
- Banding/sorting is a pure function (`bandObligations`) — fully unit-testable
  without a DB.
- `GET /api/deadlines?horizonDays=&kinds=&status=&includeResolved=` returns
  `{ asOf, bands: { overdue, due_today, this_week, this_month, later }, totals }`.

### Notifications (follow-up, not v1)

Grant-deadline, reporting, and closeout alerts already exist in
`sendScheduledGrantDeadlineReminders`. Adding `restriction_release` and
`period_close` notification types is a clean follow-up that reuses the same
dedupe-key + `onConflictDoNothing` + threshold-day `[0, 1, 7]` pattern. It is
intentionally out of v1 so the unified **view** ships first without destabilizing
the existing 600-line scan; v1 already makes both new obligation kinds visible in
the Radar feed. Tracked as a documented enhancement, not a blocker.

### Web

- New route `/_authenticated/radar` → "Deadline Radar" under the **Compliance**
  nav section.
- One chronological feed grouped by urgency band, with filter chips by
  obligation kind and a status filter, each row a link to its source record
  (grant detail, fund detail, fiscal periods). Empty state when nothing is due.
- Reuse existing shell/list/badge primitives and pill buttons (design canon).

## Out of scope / non-goals

- No new obligation data model (only reads existing tables).
- No write actions from the Radar (it is a read/triage surface; actions happen
  on the source record).
- No audit-window or pledge-installment kinds until those are modeled.

## Quality gates

- TDD throughout; 95%+ per-file coverage on every touched file.
- Pure banding + per-source mappers unit-tested without a DB; collector +
  routes tested with the API test harness.
- Marketing page `compliance-deadline-radar.md` (humanizer + third-grade-copy),
  passing the feature-landing-pages contract test.

## Rollout

Merge to master, apply any migration (none expected — read-only over existing
tables; only `notification_preferences` seed defaults if needed), deploy
api + web + site via Wrangler scripts.
