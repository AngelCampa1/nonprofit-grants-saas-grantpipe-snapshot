# Feature #6 — Pledge & Multi-Year Commitment Tracker (PRD)

Status: shipped. Roadmap ref: `docs/feature-opportunities-2026-06.md` Tier 2 #6 and `docs/offers/MASTER-BUILD-ROADMAP.md` 2.5.

Shipped evidence: pledge entities, installment schedules, ASC 958-605 present-value math,
recognition/accretion/payment/allowance/write-off posting, aging, pledge alerts, Growth+
entitlement gating, PostHog/Sentry coverage, and accounting-manager-only posting controls.

## Problem

`donations.type` already supports `pledge`, but there is **no pledge entity, no installment
schedule, no aging, no receivable journal entry, and no ASC 958-605 present-value discounting**.
Booking a multi-year pledge at face value overstates revenue and fails CPA/auditor review.

## Scope (V1)

Track unconditional multi-year promises to give, with a correct ASC 958-605 / 958-310 ledger:

1. Create a pledge with a face amount + installment schedule (donor, optional fund/grant link).
2. Compute present value (PV) at recognition, discounting installments due > 1 year at a
   locked rate; record the receivable gross with a discount contra and contribution revenue at PV.
3. Maintain an effective-interest amortization (accretion) schedule; post accretion catch-up to
   contribution revenue at payment time and on demand.
4. Record installment payments (cash receipt) as Dr cash / Cr pledges receivable — **never**
   re-recognize revenue (already recognized at PV at pledge date).
5. Estimate and post an allowance for uncollectible pledges; write off uncollectible pledges.
6. Aging view (current / 1-30 / 31-60 / 61-90 / 90+ days past due) + upcoming/overdue alerts.
7. Flag conditional promises (barrier + right of return) as **not bookable** — captured but no JE.

Out of scope for V1 (note in UI/marketing, do not silently drop): donor-facing payment collection
(that is Tier-4 #18), automatic monthly accretion cron (we post accretion as catch-up at payment /
on-demand recognition instead), re-measurement of the discount rate (rate is permanently locked).

## Accounting spec (ASC 958-605 / 958-310) — authoritative

Money is integer cents. All JEs go through the existing posting engine, gated on
`organizations.accountingEnabled` and an open `fiscal_periods` row covering the transaction date.

### Chart of accounts

Reuse existing `1100 Pledges Receivable` (asset). Add three accounts to `getNonprofitCoaSeed()`:

| Code | Name                                | Type    | Subtype/Class               | Parent |
| ---- | ----------------------------------- | ------- | --------------------------- | ------ |
| 1150 | Discount on Pledges Receivable      | asset   | contra_asset                | 1100   |
| 1190 | Allowance for Uncollectible Pledges | asset   | contra_asset                | 1100   |
| 6500 | Uncollectible Pledge Expense        | expense | functionalClass: management | 6000   |

Revenue uses existing `4000` (unrestricted) / `4100` (temporarily restricted) by net-asset class.
Cash uses existing `1010`.

### PV discounting

- Discount each installment due **> 1 year** from pledge date; installments ≤ 1 year use face.
- Rate is **fixed at recognition** (`discountRateBasisPoints`), never re-measured.
- `PV = Σ Cᵢ / (1+r)^tᵢ` where tᵢ = years from pledge date (round each discounted term to cents).
- `discount = face − PV` (always ≥ 0).

### Journal entries

Recognition (pledge date):

```
Dr 1100 Pledges Receivable           face
   Cr 1150 Discount on Pledges Rec       discount   (omit line if discount == 0)
   Cr 4000/4100 Contribution Revenue     PV
```

Accretion (catch-up through a date; effective-interest on carrying value at locked rate):

```
Dr 1150 Discount on Pledges Receivable   accretion
   Cr 4000/4100 Contribution Revenue        accretion
```

Installment payment (cash receipt):

```
Dr 1010 Cash                          paymentCents
   Cr 1100 Pledges Receivable             paymentCents
```

Allowance estimate (period-end):

```
Dr 6500 Uncollectible Pledge Expense  allowanceDeltaCents
   Cr 1190 Allowance for Uncollectible    allowanceDeltaCents
```

Write-off:

```
Dr 1190 Allowance for Uncollectible   writeOffCents
   Cr 1100 Pledges Receivable             writeOffCents
Dr 1150 Discount on Pledges Receivable remainingDiscountCents  (close residual contra)
   Cr 1190 Allowance for Uncollectible    remainingDiscountCents
```

All recognition/payment/write-off entries support auto-reversal via the existing
`reverseSourceLinkedEntries` mechanism (`source = "pledge"`, `sourceId = pledge/payment id`).

### Net-asset class

User-selectable, default **temporarily_restricted** for multi-year pledges (implied time
restriction on future installments), **unrestricted** when all installments are within one year.
Accretion credits the SAME class as recognition.

### Conditional gate

`isConditional = hasBarrier && hasRightOfReturn`. Conditional pledges are stored with
`status = "conditional"` and post **no** journal entries until promoted to unconditional.

## Data model (packages/db/src/schema/pledges.ts)

`pledges`: id, orgId(FK org), contactId(FK contacts), fundId(nullable FK funds),
grantId(nullable FK grants), status (`conditional|active|completed|written_off|cancelled`),
isConditional bool, conditionNote text null, hasBarrier bool, hasRightOfReturn bool,
faceAmountCents bigint, pledgeDate ts, discountRateBasisPoints int, presentValueCents bigint,
discountCents bigint, netAssetClass text, allowanceCents bigint default 0, notes text null,
createdAt, updatedAt, deletedAt. Index (orgId, status, pledgeDate).

`pledge_installments`: id, orgId, pledgeId(FK), dueDate ts, amountCents bigint,
status (`scheduled|paid|partial|written_off`), paidCents bigint default 0, createdAt, deletedAt.
Index (orgId, pledgeId, dueDate).

`pledge_payments`: id, orgId, pledgeId(FK), installmentId(nullable FK), amountCents bigint,
paymentDate ts, accretionCents bigint default 0, notes text null, createdAt, deletedAt.
Index (orgId, pledgeId, paymentDate).

Migration: run `drizzle-kit generate` → `0030_<slug>.sql` + snapshot + `_journal.json`.

## Entitlement

Add `hasPledgeTracker: boolean` to `PlanEntitlements`, label
`"Pledge & multi-year commitment tracker"`, values false@starter, **true@growth/audit_ready/enterprise**
(matches restriction lifecycle / budget alerts — broad Tier-2 fundraising+finance pull). Helper
`canUsePledgeTracker(value)`.

## Shared (packages/shared/src/validators/pledge-math.ts + pledge-tracker.ts)

Pure, fully-tested:

- `presentValuePledge(installments, annualRateBp, pledgeDate)` → { pvCents, discountCents }.
- `buildAmortizationSchedule(pvCents, annualRateBp, pledgeDate, throughDate)` → accretion-to-date.
- `accretionThrough(...)` → cents of discount to unwind by a date (effective-interest, day-count /365).
- aging bucket classifier `classifyInstallmentAging(dueDate, asOf, status)`.
- allowance helpers and a pledge-status reducer.
- Zod: `createPledgeSchema` (face derived from installments must reconcile; ≥1 installment;
  conditional flags), `recordPledgePaymentSchema`, `setAllowanceSchema`, `pledgeQuerySchema`.

## API (apps/api/src/domains/pledges/{routes,service}.ts + posting engine)

- `postingEngine.ts`: add `postPledgeRecognition`, `postPledgeAccretion`, `postPledgePayment`,
  `postPledgeWriteOff` (mirror `postDonation`: fiscal-period guard, accountingEnabled guard, reuse
  `reverseSourceLinkedEntries`). Add `"pledge"` to the `journal_entries.source` union/comment.
- `service.ts`: createPledge (compute PV, generate installment rows, post recognition),
  listPledges (with aging summary + totals), getPledge (installments + payments + amortization
  schedule + carrying value), recordPayment (post payment + accretion catch-up, advance installment
  status), setAllowance (post delta), writeOff (post write-off, set status). All orgId-scoped,
  soft-delete aware, entitlement-gated, activity-logged.
- `routes.ts`: REST under `/pledges` with `requirePermission("donors"|"accounting", ...)` —
  pledges are donor commitments with GL impact; use `requirePermission("accounting", "view"/"manage")`
  for write paths that post JEs and `"donors","view"` for read. (Confirm the closest existing
  permission resource; reuse it, do not invent a new resource without wiring RBAC.)
- Register the domain in the root app (`app.ts` / route index) following the existing domain
  registration pattern; extend `AppType`.
- Notifications: `pledge-alerts.ts` `scanPledgeInstallmentAlerts(db, env)` → upcoming-due and
  overdue installment notifications (`NotificationType` `"pledge_installment_due"`); register in
  `app.ts` scheduledJobs (`"notifications.pledge_tracker"`, retryTransient). Runs on existing hourly cron.
- Add activity entity type `"pledge"` and notification type `"pledge_installment_due"` to shared constants.

## Web (apps/web)

- `hooks/use-pledges.ts` (+ test): list + detail queries, mutations (create/payment/allowance/write-off).
- `routes/_authenticated/donors/pledges.tsx` (+ test): list with aging summary tiles, status filter,
  create dialog. Pledge detail can be a nested route or a sheet — keep it self-evident.
- `config/nav.ts`: nav entry under the Donors (fundraising) section → `/donors/pledges`.
- Regenerate `routeTree.gen.ts` via codegen (do NOT hand-edit).
- All buttons pill-shaped (rounded-full). Light theme only. Numbers exact, tabular where columnar.

## Site (apps/site)

- `packages/shared/src/knowledge/marketing/content/features/pledge-multi-year-commitment-tracker.md`
  with full frontmatter (`entitlement: hasPledgeTracker`, buyerStage bofu, SoftwareApplication schema).
- Marketing copy MUST pass `humanizer` then `third-grade-copy`. No fabricated proof. Builder voice.
- Regenerate knowledge `generated/indexes.ts` + `marketing-knowledge.json` (do NOT hand-edit).
- Served automatically by `apps/site/src/pages/features/[slug].astro`.

## Quality gates

TDD; 95% per-file coverage (lines AND branches) on every touched file. No `any`, no TODO,
no eslint-disable without explanation. `turbo typecheck` clean. Review → fix → merge → deploy.
