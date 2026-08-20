# Tier Repackaging Spec — Starter / Growth / Audit-Ready

> **Superseded on 2026-07-03 for external accounting integrations.** QuickBooks
> sync is unavailable on every plan. Ignore all QuickBooks entitlement, sync,
> ingestion, and connector instructions below. The supported QuickBooks path is
> manual CSV/opening-balance import, kept separate from the general ledger.

**Date:** 2026-06-29
**Status:** Implemented
**Decision input:** Angel Campa
**Supersedes/extends:** `2026-06-28-pricing-packaging-realignment.md`

## Governing principle (changed)

**Starter must be a complete product that stands on its own** — enough to run
GrantPipe's whole stated objective without a consultant and without upgrading:
donors, grants, restricted funds, and compliance, in one system. Starter is not
a funnel into Growth. If a capability is _required to achieve the objective_, it
belongs in Starter even when it would make a tempting upsell lever.

That reframes the tier ladder:

- **Starter — the complete core.** Does the whole job for a small org. The
  upgrade levers are **capacity and convenience**, never "you can't do the core
  work."
- **Growth — best value, what most choose.** Removes caps and adds breadth,
  power tools, integrations, and sharing/exports. A bigger or busier org's
  default.
- **Audit-Ready — built to satisfy an external party.** Auditor, funder,
  federal reviewer, board. Evidence packages, the auditor portal, SEFA/single
  audit, subrecipient monitoring, indirect-cost rules, amendment/audit trails.
- **Enterprise — multi-entity / cross-entity only.** Unchanged.

## What Starter already includes (not obvious from the flag list)

Several core capabilities are **not** entitlement-gated, so Starter already has
them. This matters: it means Starter is closer to "complete" than the raw
`PLAN_ENTITLEMENTS` table implies.

- **Donor CRM + donor pipeline** — baseline, every tier.
- **Basic compliance reports** — `STARTER_VISIBLE_REPORT_TYPES` in
  `apps/api/src/domains/compliance/routes.ts` is everything that is _not_ a
  compliance-report-pack artifact and not SEFA. Starter can already generate the
  base reports; the "report pack" (board packets, funder templates,
  acknowledgment runs) and SEFA are the gated extras.
- **Restriction lifecycle, grant budgets + alerts, reminder/spend-down emails,
  grant opportunity search, capped AI award intake + Ask-Your-Ledger** — already
  Starter today.

So the **only** core gap that breaks "Starter stands on its own" is **program
allocation** — which the program PRD itself calls _"the biggest missing
primitive: grants fund programs."_ Fix that and Starter is genuinely complete.

## Full feature review (all 35 entitlements + caps)

Lens applied to every row: **Starter** = required for the core objective;
**Growth** = capacity/breadth/power/convenience most orgs want; **Audit-Ready**
= primarily serves an external party; **Enterprise** = multi-entity.

| Entitlement                       |     Now     |   Proposed   | Why                                                                                                   |
| --------------------------------- | :---------: | :----------: | ----------------------------------------------------------------------------------------------------- |
| `activeGrantCap`                  | 10/30/100/∞ | 10/30/100/∞  | Capacity is the upgrade lever — keep                                                                  |
| `hasAutomationEmails`             |      S      |    **S**     | Never miss a deadline — core                                                                          |
| `hasGrantBudgetBasics`            |      S      |    **S**     | Grant budgets + budget-vs-actual — core                                                               |
| `hasGrantBudgetAlerts`            |      S      |    **S**     | Overspend protection — core                                                                           |
| `hasRestrictionLifecycle`         |      S      |    **S**     | Restricted-fund tracking — core                                                                       |
| `hasGrantOpportunitySearch`       |      S      |    **S**     | Find/track opportunities — keep (already S)                                                           |
| `hasAwardDocumentIntake` (cap 5)  |      S      |    **S**     | Get awards into the system — core (capped)                                                            |
| `hasAskYourLedger` (cap 20)       |      S      |    **S**     | Basic grounded reporting — core (capped)                                                              |
| `canViewProgramContext`           |      G      | **S → move** | Programs are a core fund-accounting primitive                                                         |
| `canManagePrograms`               |      A      | **S → move** | Create/manage programs — core ("grants fund programs")                                                |
| `canManageProgramAllocations`     |      A      | **S → move** | Allocate grants **and** expenses to programs — core; required for real program budget-vs-actual       |
| `hasComplianceReportPack`         |      G      |    **G**     | Board packets / funder templates / acknowledgment runs — value-add (Starter already has base reports) |
| `hasGrantBudgetExports`           |      G      |    **G**     | Sharing convenience — paid lever                                                                      |
| `canExportProgramReports`         |      A      | **G → move** | Program CSV export = sharing convenience, lives with other exports                                    |
| `hasPlannedExpenses`              |      G      |    **G**     | Forecasting depth                                                                                     |
| `hasGrantBudgetAiExtraction`      |      G      |    **G**     | AI power tool                                                                                         |
| `hasAccountingIntegrations`       |      G      |    **G**     | QuickBooks integration — classic Growth hook                                                          |
| `hasPaymentRequests`              |      G      |    **G**     | Drawdowns / reimbursement module — deeper grant ops                                                   |
| `hasPledgeTracker`                |      G      |    **G**     | Multi-year pledge depth                                                                               |
| `hasFunctionalExpenseAllocation`  |      G      |    **G**     | Functional (natural-vs-functional) 990 prep                                                           |
| `hasProposalReportDrafting`       |      G      |    **G**     | AI drafting power tool                                                                                |
| `hasOutcomeImpactMeasurement`     |      A      | **G → move** | Impact reporting most grant managers want day to day                                                  |
| `hasRecurringGiftEngine`          |   Removed   | **Removed**  | Retired with Stripe Connect; do not restore as tier work                                              |
| `awardIntakeMonthlyCap`           |    5/∞/∞    |    5/∞/∞     | Unlimited AI is the Growth lever — keep                                                               |
| `askYourLedgerMonthlyCap`         |   20/∞/∞    |    20/∞/∞    | Same — keep                                                                                           |
| `hasGuidedOnboarding`             |      A      |    **A**     | White-glove service perk                                                                              |
| `hasRestrictionEvidencePackage`   |      A      |    **A**     | Auditor evidence artifact                                                                             |
| `hasAuditorFunderPortal`          |      A      |    **A**     | Literally an external portal                                                                          |
| `hasIndirectCostRules`            |      A      |    **A**     | Federal / Uniform Guidance depth                                                                      |
| `hasPaymentEvidencePackage`       |      A      |    **A**     | Funder reimbursement evidence packets                                                                 |
| `hasGrantBudgetAmendments`        |      A      |    **A**     | Amendment history = audit trail                                                                       |
| `hasGrantBudgetAuditViews`        |      A      |    **A**     | Audit views = audit trail                                                                             |
| `hasSubrecipientMonitoring`       |      A      |    **A**     | Federal / funder pass-through obligation                                                              |
| `hasAccountingAnomalyDetector`    |      A      |    **A**     | Catch problems before the auditor does                                                                |
| SEFA / single-audit (route-gated) |      A      |    **A**     | Single-audit artifact                                                                                 |
| `hasMultiEntityConsolidation`     |      E      |    **E**     | Multi-entity                                                                                          |
| `hasCrossEntityReportBuilder`     |      E      |    **E**     | Cross-entity                                                                                          |

## The deltas (six flips, no new flags)

This is simpler than the earlier draft — no flag-splitting is needed, because
the whole program-allocation operating surface moves to Starter as one unit.

**Into Starter (was Growth/Audit-Ready):**

1. `canViewProgramContext` → `starter`
2. `canManagePrograms` → `starter`
3. `canManageProgramAllocations` → `starter` (covers grant→program **and**
   expense→program; both are needed for Starter's budget-vs-actual to show real
   actuals)

**Into Growth (was Audit-Ready):**

4. `canExportProgramReports` → `growth`
5. `hasOutcomeImpactMeasurement` → `growth`
6. `hasRecurringGiftEngine` -> removed in the Stripe Connect retirement

Starter capacity stays at 10 active grants — that, plus unlimited AI, exports,
QuickBooks, planned expenses, drafting, pledges, functional-expense studio,
and outcomes, is what drives the Growth upgrade. The core job is complete on
Starter; you upgrade for **more and faster**, not for **at all**.

## Exact code changes (when authorized)

### `packages/shared/src/constants/index.ts`

Flip the six flags in `PLAN_ENTITLEMENTS`:

- `starter`: `canViewProgramContext`, `canManagePrograms`,
  `canManageProgramAllocations` → `true`.
- `growth`: `canExportProgramReports`, `hasOutcomeImpactMeasurement` -> `true`
  (they're already `true` at `audit_ready`). The recurring gift engine was
  removed with Stripe Connect and should not be restored as part of this tier
  work.

### `apps/api/src/domains/programs/routes.ts`

Re-gate every program route to the new floor:

- `GET /`, `GET /:programId`, `GET /budget-vs-actual` — `growth` → `starter`.
- `POST /`, `PATCH /:programId`, `DELETE /:programId`, `POST /budgets`,
  `PATCH /budgets/:budgetId`, `PUT /grants/:grantId/allocations`,
  `PUT /expenses/:expenseId/allocations` — `audit_ready` → `starter`.
- `GET /budget-vs-actual/export` — `audit_ready` → `growth`.
  (`requirePlanTier("starter")` = available to any active plan; billing is still
  enforced by the existing `requireActiveBilling()` on the router.)

### `apps/api/src/domains/outcomes/routes.ts`

- Line 35: `.use("*", requirePlanTier("audit_ready"))` → `requirePlanTier("growth")`.

### `apps/web`

- `programs/index.tsx`: program create/edit, both allocation editors, and
  on-screen budget-vs-actual become available on Starter; **remove the empty
  "Growth preview" Alert** and its disabled "Upgrade to edit" button. Gate only
  the CSV **export** button to Growth with an inline upgrade affordance.
- `grants/$grantId.tsx`, `reports/index.tsx`, `dashboard.tsx`,
  `payments/index.tsx`: re-derive the min-plan labels from the shared helpers
  (they already call `getMinimumPlanForFeatures` / `formatMinimumPlanLabelForFeatures`,
  so labels update automatically once the flags change — verify, don't hardcode).

### `packages/shared/src/pricing.ts` + `apps/site/src/lib/marketed-capabilities.ts`

- Move program allocation to the Starter column; drop the program row's
  `{ growth: "preview" }` override.
- Move outcomes into Growth's marketed list (out of Audit-Ready).
- Reword Audit-Ready so it leads with the external-party story (evidence
  packages, portal, SEFA, subrecipient monitoring, indirect cost) now that
  program management has left it.

### Tests (TDD, 95% per-file on touched files)

- `paywall` / program route gate tests: program CRUD + both allocation editors
  allowed on Starter; export blocked on Starter, allowed on Growth.
- `outcomes` gate test: allowed on Growth.
- `packages/shared/src/constants/index.test.ts`, `pricing.test.ts`: update the
  expected matrix.
- `apps/site/src/feature-pages-entitlement-contract.test.ts`: outcomes and
  program feature pages now map to their new minimum plans.
- Keep the under-attribution contract guard green.

### Observability

No new feature surface. Verify existing PostHog program/outcome events and
Sentry paywall capture still fire after the re-gate (re-run the relevant tests;
the shared wrappers already cover these paths).

## Copy gate (mandatory before done)

Every user-facing string touched — pricing feature lists, the program upgrade
affordance, the recurring-gift message, the feature matrix, Audit-Ready
positioning — passes, in order: (1) `humanizer`, (2) `third-grade-copy`,
(3) zero-lies check against the entitlement source of truth, (4) fit check
against the page/flow/audience.

## Open question for the founder (pricing, not packaging)

Making Starter genuinely complete narrows the _functional_ gap between Starter
($329) and Growth ($539) — the difference becomes capacity + power/convenience +
unlimited AI rather than "can you do the core job." That's the intended,
honest model, but it's worth deciding consciously:

- **(a) Keep prices as-is** — Growth sells on capacity/convenience/unlimited AI.
  Simplest; recommended unless data says otherwise.
- **(b) Raise Starter** — if a complete Starter at $329 feels underpriced for
  the value.
- **(c) Re-anchor Growth** — lean its marketing harder on unlimited AI +
  integrations + breadth so the value step is obvious.

No code depends on this; it's a positioning call. Recommend (a) for now.
