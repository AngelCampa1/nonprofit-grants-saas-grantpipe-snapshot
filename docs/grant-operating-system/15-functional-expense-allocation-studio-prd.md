# 15 — Functional Expense Allocation Studio (Feature #8)

## Problem

ASC 958-720 requires a Statement of Functional Expenses (SFE) that splits every
expense across **Program**, **Management & General**, and **Fundraising**. Many
real costs are shared: a director's salary, rent, utilities, IT. Today GrantPipe's
SFE (`getStatementOfFunctionalExpenses`) puts each account's whole balance into the
single `functionalClass` stamped on the account. Shared costs cannot be split, so
the year-end SFE is finished in Excel by hand. This is the biggest remaining
year-end spreadsheet artifact for the finance lead.

## Goal

Let an org define **allocation bases** (FTE %, square footage, time study, or a
manual percentage split) and bind them to **pooled/shared expense accounts**. At
report time, the SFE re-splits each pooled account's balance across the functional
classes (and optionally across programs) using the base's weights. The general
ledger is never altered — allocation is a **read-time overlay**, fully reversible
and auditable. This mirrors how the existing SFE already works (read-time grouping)
and keeps the posted GL CPA-clean.

## Non-goals

- No phantom/derived journal entries. The GL is not touched.
- No automated headcount/sq-ft data capture. The user enters the resulting
  percentages (a "time study" or "FTE %" is just the documented method behind a
  manual percentage split). We store the method label for audit narrative.
- No change to how expenses post.

## Accounting model (read-time overlay)

- **Direct accounts** (no rule): behave exactly as today — full balance → its
  `functionalClass` column.
- **Pooled accounts** (have an active rule bound to a base): the account's net
  balance for the period is split across the base's targets using
  largest-remainder apportionment so the split sums **exactly** to the balance
  (no cent created or lost — "trust through precision").
- A base distributes to one or more **targets**, each a `(functionalClass,
optional programId, weightBasisPoints)`. Active target weights for a base MUST
  sum to 10000 basis points (100.00%). Enforced on write.
- One **active** rule per account (a pool maps to exactly one base at a time).

## Data model (`packages/db/src/schema/allocation.ts`)

### `allocation_bases`

- `id` text pk, `orgId` text notNull (FK organizations)
- `name` text notNull, `description` text
- `method` text notNull — `"headcount_fte" | "square_footage" | "time_study" | "manual_percentage"`
- `status` text notNull default `"active"` — `"active" | "inactive"`
- `createdAt` / `updatedAt` / `deletedAt`
- index on `(orgId)`

### `allocation_targets`

- `id` text pk, `orgId` text notNull
- `baseId` text notNull (FK allocation_bases)
- `functionalClass` text notNull — `"program" | "management" | "fundraising"`
- `programId` text (nullable FK programs — only meaningful when functionalClass = `program`)
- `label` text
- `weightBasisPoints` integer notNull — 0..10000
- `createdAt` / `updatedAt` / `deletedAt`
- index on `(baseId)`

### `allocation_rules`

- `id` text pk, `orgId` text notNull
- `accountId` text notNull (FK chart_of_accounts — the pooled expense account)
- `baseId` text notNull (FK allocation_bases)
- `status` text notNull default `"active"`
- `createdAt` / `updatedAt` / `deletedAt`
- index on `(orgId)`, index on `(accountId)`

Migration: next number after 0061 (`pnpm --filter @grantpipe/db generate`).

## Pure math (`packages/shared/src/validators/allocation-math.ts`)

```ts
export const WEIGHT_TOTAL_BASIS_POINTS = 10000;

// true iff every weight >= 0 and the sum is exactly 10000
export function weightsAreComplete(weightsBasisPoints: number[]): boolean;

// Split `amountCents` (may be negative) across weights using largest-remainder
// apportionment. Returns an array the same length as weights whose sum === amountCents
// exactly. Zero-length or all-zero weights → throws (caller must validate first).
export function allocateCents(amountCents: number, weightsBasisPoints: number[]): number[];
```

`allocateCents` handles negative balances by allocating the magnitude then
re-applying the sign, and distributes rounding remainders to the largest
fractional parts (ties broken by index) so the result always re-sums to the input.

## Shared validators (`packages/shared/src/validators/allocation-studio.ts`)

- `ALLOCATION_METHODS` const tuple + `AllocationMethod` type.
- `createAllocationBaseSchema`, `updateAllocationBaseSchema`
- `allocationTargetInputSchema` + `setAllocationTargetsSchema` (array; refined so
  active weights sum to 10000 and each functionalClass ∈ enum)
- `createAllocationRuleSchema`, `updateAllocationRuleSchema`

Defined in `packages/shared` (apps/api has no direct `zod` dep — import via barrel).

## Entitlement (`packages/shared/src/constants/index.ts`)

- Add `hasFunctionalExpenseAllocation: boolean` to `PlanEntitlements`.
- starter = `false`; growth / audit_ready / scale (and any higher tiers) = `true`.
- `canUseFunctionalExpenseAllocation(plan)` helper + label.
- `packages/shared/src/pricing.ts`: add to `MARKETED_FEATURE_CATALOG_KEYS` + a
  catalog row.

## API domain (`apps/api/src/domains/allocation/`)

`service.ts`:

- CRUD: bases (list/get/create/update/soft-delete), targets (get-by-base /
  replace-all via `setTargets`), rules (list/create/update/soft-delete).
- `getAllocatedStatementOfFunctionalExpenses(db, { orgId, startDate, endDate })`:
  reuses the same expense-balance query the existing SFE uses, then applies the
  overlay. Returns `SFEResult`-shaped data (so the web report renders it) PLUS an
  optional `programBreakdown` array `{ programId, programName, amountCents }`.

`routes.ts` (registered as `/allocation` in `app.ts`, part of `AppType`):

- All routes entitlement-gated: `assertFunctionalExpenseAllocationEntitlement(
getContextEffectivePlanTier(c))` → 403 `insufficient_plan` for Starter.
- Reads: `requirePermission("accounting", "view")`.
- Writes: `requirePermission("accounting", "manage")`.
- `GET /allocation/bases`, `GET /allocation/bases/:id`, `POST /allocation/bases`,
  `PATCH /allocation/bases/:id`, `DELETE /allocation/bases/:id`
- `PUT /allocation/bases/:id/targets` (replace all targets)
- `GET /allocation/rules`, `POST /allocation/rules`, `PATCH /allocation/rules/:id`,
  `DELETE /allocation/rules/:id`
- `GET /allocation/functional-expenses` (allocated SFE; from/to query)

≥95% per-file coverage (lines AND branches) on every touched api file.

## Web (`apps/web`)

- `src/hooks/use-allocation.ts`: query/mutation hooks for all routes.
- `src/routes/_authenticated/accounting/studios/functional-expense-allocation.tsx`:
  - Entitlement gate (upgrade card when not entitled).
  - Bases list + create/edit dialog (name, method, status).
  - Targets editor per base: rows of `(functionalClass, optional program,
percentage)`; live "must total 100%" affordance; save disabled until exact.
  - Rules list + bind dialog (pick pooled expense account + base).
  - Allocated SFE preview table (Account, Program, M&G, Fundraising, Total) with a
    date range, reusing the existing functional-expenses table style.
  - All buttons pill-shaped (`rounded-full`).
- `src/config/nav.ts`: add nav entry under the Accounting section
  (`/accounting/studios/functional-expense-allocation`, accounting/manage).
- Do NOT hand-edit `routeTree.gen.ts` — codegen regenerates it.

≥95% per-file coverage on touched web files.

## Marketing

- `packages/shared/src/knowledge/marketing/content/features/functional-expense-allocation-studio.md`
  - entitlement `hasFunctionalExpenseAllocation`, buyerStage `bofu`,
    SoftwareApplication, valid `topicCluster` enum value, full FAQs/pros-cons.
  - Copy MUST pass `humanizer` then `third-grade-copy`.
- Regenerate indexes: `pnpm --filter @grantpipe/shared run knowledge:generate`;
  verify with `knowledge:check`.
- Served by `apps/site/src/pages/features/[slug].astro`.

## Definition of Done

Worktree → shared+db → api → web+site waves → review → fix all findings → typecheck

- test:coverage green (per-file 95%) → merge master → migrate Neon → deploy api +
  web + site via Wrangler → remove worktree → ledger updated.
