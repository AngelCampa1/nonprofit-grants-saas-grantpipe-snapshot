# PRD 13 — Anomaly & Misallocation Detector (Roadmap #10)

_Status: shipped · Owner: orchestrator · Depends on trustworthy posted actuals (#3/#4/#7 shipped)._

## Problem

Posted accounting activity drifts. An expense gets charged to a restricted fund whose
restriction disallows that category. A release of restriction quietly exceeds the fund's
available balance. A donation gets entered twice. An indirect-cost line is computed at a
rate that no longer matches the org's configured rule. Each of these becomes an audit
finding or a funder clawback if nobody catches it. Today nothing watches for them after
the fact — the only guard is a hard throw at posting time (`postExpense` line 670), which
does not fire when accounting is disabled, when the restriction term was not matched, or
for donations and indirect lines at all.

## Goal

A scheduled scanner plus an on-demand view that watches posted activity for four anomaly
classes, classifies each with a transparent reason, and queues them for human review.
GrantPipe never auto-corrects — it flags, the team decides.

## Anomaly classes (V1)

| Key                      | What it detects                                                                                                                                       | Reuses                                                              | Requires                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------- |
| `category_misallocation` | Expense posted against a restricted fund whose `restrictionAllowedCategories` is non-empty and does not include the expense's `(category, accountId)` | `expenseMatchesAllowedCategory` semantics (open-set = no violation) | `hasRestrictionLifecycle`        |
| `release_over_balance`   | A restriction release whose amount exceeds the term's available balance at release date                                                               | `availableRestrictionBalanceCents` formula                          | `hasRestrictionLifecycle`        |
| `duplicate_donation`     | Two or more non-deleted donations sharing `(orgId, contactId, amountCents)` within a 3-day window                                                     | `donations_org_contact_date_idx`                                    | always (any plan with donations) |
| `indirect_rate_mismatch` | A posted indirect line whose `rateBasisPoints` / amount differs from what the active rule would produce                                               | `computeIndirectLine`                                               | `hasIndirectCostRules`           |

Severity bands per class: `info` < `warning` < `critical`. Category misallocation and
release-over-balance are `critical`; indirect mismatch is `warning`; duplicate donation is
`warning` (it may be a legitimate same-day repeat gift, so it is a review prompt, not an error).

## Architecture (mirrors Budget Sentinel)

1. **Pure classifier** — `packages/shared/src/validators/anomaly-detector.ts`. DB-free
   functions: `classifyCategoryMisallocation`, `classifyReleaseOverBalance`,
   `classifyDuplicateDonationGroup`, `classifyIndirectRateMismatch`. Each takes plain
   inputs (cents, ids, category strings, allowed-category sets) and returns
   `{ isAnomaly, severity, reason, ...detail }`. Named constants for the duplicate window
   (`DUPLICATE_DONATION_WINDOW_DAYS = 3`) and severity ordering. 100% test coverage.
2. **Detection service** — `apps/api/src/domains/accounting/anomaly.service.ts`.
   `getAnomalies(db, { orgId, now, classes?, limit? })` loads org-scoped, soft-delete-aware
   data, runs the classifiers, returns `{ asOf, items, totals }` with discriminated-union
   items keyed on `class`. Totals reflect the full population before `classes`/`limit`.
   Exports `isReviewableAnomaly(item)`.
3. **Route** — `GET /accounting/anomalies` in the accounting routes, ordered before any
   `/:id` route, `requirePermission("accounting","view")`, 402 via
   `canUseAccountingAnomalyDetector` when the plan lacks it. Validates query via a new
   `anomalyQuerySchema`.
4. **Scheduled alerts** — `apps/api/src/domains/notifications/anomaly-alerts.ts`.
   `scanAccountingAnomalies(db, env, now)`. Starter orgs skipped. Per-org try/catch +
   `captureScheduledException`. Idempotent via dedupeKey `anomaly:{class}:{entityId}` and
   `onConflictDoNothing().returning()` (email only for inserted rows). Business-hours +
   notificationPreferences gating. Registered in the `scheduledJobs` array in `app.ts`.
5. **Web** — `apps/web/src/hooks/use-anomalies.ts` (402 → `isPlanGated`, no retry on 402)
   and `apps/web/src/routes/_authenticated/accounting/anomalies.tsx` (PageShell > PageHeader
   > Card > Table; pill class-filter chips with `aria-pressed`; color-coded severity badges;
   > loading/error/empty/plan-gated StatusPanel). Nav item under Compliance.
6. **Entitlement** — add `hasAccountingAnomalyDetector` to `PlanEntitlements`,
   `PLAN_ENTITLEMENTS` (false for starter/growth, true for audit_ready/enterprise — it sits
   alongside the other ledger-integrity capabilities), `PLAN_ENTITLEMENT_LABELS`, and a
   `canUseAccountingAnomalyDetector` helper.
7. **Notification types** — add `accounting_anomaly` to `NOTIFICATION_TYPES`.

## What GrantPipe does NOT do (liability guardrails)

- No auto-correction, no reversing journal entries, no merging donations, no editing
  expenses. It flags and links to the record. The human resolves.
- Duplicate detection is a review prompt, not a block — same-day repeat gifts are legitimate.
- Indirect mismatch reports the difference; it does not re-post.

## Out of scope (deferred)

- Machine-learned outlier detection / statistical thresholds. V1 is rule-based and
  explainable, which is what an auditor trusts.
- Resolution workflow (dismiss / mark-resolved persistence). V1 surfaces and notifies;
  the existing notification read-state covers acknowledgement.

## Acceptance

- Classifier: 100% line + branch coverage; every band and open-set edge case tested.
- Service/route/alerts/hook/view: ≥95% per-file line + branch coverage.
- Plan-gating verified (starter → 402 / plan-gated empty state).
- Marketing page passes humanizer + third-grade-copy and both contract tests.
- Typecheck clean; merged to master; deployed.
