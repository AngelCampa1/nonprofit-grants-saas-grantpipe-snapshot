# Grant Budget Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build structured funder-approved grant budgets with versions, periods, lines, planned expenses, expense allocations, amendments, budget-vs-actual reporting, alerts, exports, audit history, tier-aware UX, and site/SEO rollout.

**Architecture:** Keep the feature inside the existing grants domain. Add Drizzle schema and shared Zod contracts first, then expose budget services and routes under grant-scoped paths, then add web hooks and grant-detail UI surfaces that consume Hono RPC. Reporting and alerts aggregate from budget lines, actual expense allocations, and planned expenses while preserving approved-version history for audit review.

**Tech Stack:** TypeScript ESM, Drizzle ORM, Neon Postgres, Hono RPC, Zod, React 19, TanStack Router, TanStack Query, Shadcn/UI, Tailwind CSS 4, Vitest, React Testing Library, Playwright where UI flow coverage is needed.

**Spec:** `docs/superpowers/specs/2026-05-02-grant-budget-model-design.md`

**Implementation note, 2026-05-05:** This branch ships the integrated foundation:
database tables and migration, shared contracts and entitlements, budget
version/period/line/expense-allocation/reporting/intake services, grant-scoped
budget routes, web variance hook, grant detail Budget tab, and shared pricing
copy. The remaining plan tasks are deeper workflow layers: editable budget
tables, expense classification UI, document review confirmation, amendment UI,
and the external SEO page rollout.

---

## Parallel Execution Groups

```
Task 1 (Worktree and baseline)
  -> Task 2 (DB schema and migration)
  -> Group A (parallel): Task 3 (shared contracts), Task 4 (tier helpers)
  -> Group B (parallel after A): Task 5 (budget service), Task 6 (expense allocation service), Task 7 (variance and alerts service)
  -> Task 8 (budget routes)
  -> Group C (parallel): Task 9 (web hooks), Task 10 (report/export integration)
  -> Group D (parallel after C): Task 11 (grant Budget tab), Task 12 (expense classification UI), Task 13 (document intake and award setup budget step)
  -> Task 14 (site and SEO content)
  -> Task 15 (end-to-end verification, review, merge, deploy)
```

Tasks in the same group can be delegated in parallel if their write scopes stay
separate.

---

## File Structure

```
packages/db/src/schema/
  grants.ts                         # Add budget version, period, line, allocation, planned expense, amendment tables
packages/db/src/migrations/
  Drizzle-generated migration        # Current repo is at 0032; keep the generated filename

packages/shared/src/constants/
  index.ts                          # Existing plan constants plus budget statuses, sources, cost types, alert types
  index.test.ts                     # Existing constants and entitlement tests
packages/shared/src/validators/
  grant-budgets.ts                  # Budget, allocation, amendment, variance, export validators
  grant-budgets.test.ts
  index.ts                          # Re-export validators
packages/shared/src/types/
  grant-budgets.ts                  # Budget detail, variance, alert, export result types
  index.ts                          # Re-export types
apps/api/src/domains/grants/
  budget.service.ts                 # Version, period, line, planned expense, amendment lifecycle
  budget.service.test.ts
  budget-allocations.service.ts     # Expense and journal line budget allocations
  budget-allocations.service.test.ts
  budget-reporting.service.ts       # Budget-vs-actual, alerts, exports
  budget-reporting.service.test.ts
  budget.routes.ts                  # Hono routes for budget endpoints
  budget.routes.test.ts
  routes.ts                         # Mount budget routes under grants

apps/web/src/hooks/
  use-grants.ts                     # Add budget queries and mutations
  use-grants.test.ts
apps/web/src/components/grants/
  budget-tab.tsx                    # Grant detail Budget tab shell
  budget-tab.test.tsx
  budget-version-toolbar.tsx        # Version selector, status, approval actions
  budget-line-editor.tsx            # Draft line editing table
  budget-variance-table.tsx         # Budget-vs-actual table
  budget-alerts-panel.tsx           # Budget alerts
  planned-expenses-panel.tsx        # Growth+ planned expenses
  amendment-drawer.tsx              # Audit-Ready amendment workflow
  expense-budget-allocation.tsx     # Expense classification and split UI
  budget-document-intake.tsx        # Guided document intake row mapping
apps/web/src/routes/_authenticated/grants/
  $grantId.tsx                      # Add Budget tab to grant detail
  index.tsx                         # Add budget step to grant creation flow

apps/web/src/routes/
  index.tsx                         # Public homepage/product messaging
apps/web/src/lib/
  plan-display.ts                   # Pricing feature lists
  help-content.ts                   # SEO/help content references
```

---

## Task 1: Worktree And Baseline

**Files:**

- No product files.

- [ ] **Step 1: Sync `master`**

```bash
git checkout master
git pull
```

Expected: repository is up to date.

- [ ] **Step 2: Create isolated worktree**

```bash
git check-ignore -q .worktrees
git worktree add .worktrees/grant-budget-model -b feat/grant-budget-model
cd .worktrees/grant-budget-model
```

Expected: new branch `feat/grant-budget-model` exists under
`.worktrees/grant-budget-model`.

- [ ] **Step 3: Install dependencies**

```bash
pnpm install
```

Expected: lockfile remains unchanged unless a later task intentionally adds a
dependency.

- [ ] **Step 4: Verify baseline**

```bash
turbo typecheck
turbo test
```

Expected: no typecheck or test failures. If baseline fails, record exact
failures before making product changes.

---

## Task 2: Database Schema And Migration

**Files:**

- Modify: `packages/db/src/schema/grants.ts`
- Create: generated migration under `packages/db/src/migrations/`
- Test: `packages/db/src/schema/grants.test.ts`

- [ ] **Step 1: Write failing schema tests**

Add tests that assert:

- `grantBudgetVersions` has `orgId`, `grantId`, `versionNumber`, `status`,
  `source`, approval fields, supersession fields, timestamps, and `deletedAt`.
- `grantBudgetPeriods` belongs to a budget version and stores label, dates,
  due date, and sort order.
- `grantBudgetLines` stores category, approved amount cents, allowable flag,
  cost type, optional program, optional fund, accounting dimension, notes, and
  sort order.
- `grantBudgetLineAllocations` links either expense or journal line to a budget
  line and stores cents.
- `plannedExpenses` links grant, budget line, period, amount cents, expected
  date, status, and optional converted expense.
- `grantBudgetAmendments` links previous and new budget versions with reason,
  effective date, supporting document, and approval metadata.

- [ ] **Step 2: Run tests to confirm failure**

```bash
pnpm --filter @grantpipe/db test -- --run src/schema/grants.test.ts
```

Expected: FAIL because budget tables are not exported.

- [ ] **Step 3: Add Drizzle schema**

Implement the six tables from the spec with:

- UUID primary keys.
- `org_id` on every table.
- Foreign keys to existing grants, funds, programs, expenses, journal lines,
  documents, and users where those tables already exist.
- `amount_cents` integer fields for all monetary values.
- Status enums or text columns that match shared constants.
- `deleted_at` on mutable user-owned records.
- Indexes for `org_id`, `grant_id`, `budget_version_id`, `budget_line_id`, and
  common report filters.

- [ ] **Step 4: Generate migration**

```bash
pnpm --filter @grantpipe/db generate
```

Expected: one migration creates the new budget tables, indexes, and foreign
keys.

- [ ] **Step 5: Run db tests**

```bash
pnpm --filter @grantpipe/db test -- --run src/schema/grants.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema packages/db/src/migrations
git commit -m "feat(db): add grant budget model schema"
```

---

## Task 3: Shared Contracts

**Files:**

- Modify: `packages/shared/src/constants/grants.ts`
- Create: `packages/shared/src/validators/grant-budgets.ts`
- Create: `packages/shared/src/validators/grant-budgets.test.ts`
- Create: `packages/shared/src/types/grant-budgets.ts`
- Modify: `packages/shared/src/validators/index.ts`
- Modify: `packages/shared/src/types/index.ts`

- [ ] **Step 1: Write failing validator tests**

Cover these cases:

- Valid budget version draft input passes.
- Invalid budget version status fails.
- Budget line rejects negative `approvedAmountCents`.
- Budget line accepts `allowable: false`.
- Planned expense rejects zero or negative `amountCents`.
- Amendment requires reason and effective date.
- Expense split allocation rejects empty allocations.
- Expense split allocation rejects negative allocation cents.
- Variance query accepts period, category, program, fund, allowable, and cost
  type filters.
- Export query requires a supported export format.

- [ ] **Step 2: Run tests to confirm failure**

```bash
pnpm --filter @grantpipe/shared test -- --run src/validators/grant-budgets.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Add constants, validators, and result types**

Define:

- `GRANT_BUDGET_VERSION_STATUSES`
- `GRANT_BUDGET_VERSION_SOURCES`
- `GRANT_BUDGET_LINE_COST_TYPES`
- `PLANNED_EXPENSE_STATUSES`
- `GRANT_BUDGET_ALERT_TYPES`
- `createGrantBudgetVersionSchema`
- `updateGrantBudgetVersionSchema`
- `approveGrantBudgetVersionSchema`
- `createGrantBudgetPeriodSchema`
- `updateGrantBudgetPeriodSchema`
- `createGrantBudgetLineSchema`
- `updateGrantBudgetLineSchema`
- `createPlannedExpenseSchema`
- `updatePlannedExpenseSchema`
- `createGrantBudgetAmendmentSchema`
- `expenseBudgetAllocationSchema`
- `budgetVarianceQuerySchema`
- `budgetExportQuerySchema`
- Budget detail, line rollup, variance row, alert, amendment, and export result
  TypeScript types.

- [ ] **Step 4: Run shared tests**

```bash
pnpm --filter @grantpipe/shared test -- --run src/validators/grant-budgets.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/constants packages/shared/src/validators packages/shared/src/types
git commit -m "feat(shared): add grant budget contracts"
```

---

## Task 4: Tier Entitlement Helpers

**Files:**

- Modify: `packages/shared/src/constants/index.ts`
- Modify: `packages/shared/src/constants/index.test.ts`

- [ ] **Step 1: Write failing entitlement tests**

Assert:

- Starter can use manual budget setup.
- Starter can view budget-vs-actual.
- Starter cannot use alerts, exports, planned expenses, or amendments.
- Growth can use alerts, exports, planned expenses, and reporting-period
  workflow.
- Growth cannot use amendment history or configurable approval-locking controls.
- All tiers lock approved budget versions from direct edits as baseline data
  integrity.
- Audit-Ready can use every grant budget capability.

- [ ] **Step 2: Run tests to confirm failure**

```bash
pnpm --filter @grantpipe/shared test -- --run src/constants/index.test.ts
```

Expected: FAIL because grant budget capability helpers are missing.

- [ ] **Step 3: Add helpers**

Add explicit helpers such as:

- `canUseGrantBudgetBasics(plan)`
- `canApproveAndLockGrantBudget(plan)`
- `canUseGrantBudgetAlerts(plan)`
- `canExportGrantBudgetActuals(plan)`
- `canUsePlannedExpenses(plan)`
- `canUseGrantBudgetAmendments(plan)`
- `canUseGrantBudgetAuditViews(plan)`

`canApproveAndLockGrantBudget(plan)` must return `true` for Starter, Growth, and
Audit-Ready. Only configurable approval policies belong to Audit-Ready.

- [ ] **Step 4: Run entitlement tests**

```bash
pnpm --filter @grantpipe/shared test -- --run src/constants/index.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/constants/index.ts packages/shared/src/constants/index.test.ts
git commit -m "feat(shared): add grant budget entitlement helpers"
```

---

## Task 5: Budget Lifecycle Service

**Files:**

- Create: `apps/api/src/domains/grants/budget.service.ts`
- Create: `apps/api/src/domains/grants/budget.service.test.ts`

- [ ] **Step 1: Write failing service tests**

Cover:

- Creates a draft budget version scoped to org and grant.
- Adds periods and lines to draft versions.
- Rejects edits to approved versions.
- Approves a draft version as admin and locks it.
- Supersedes the previous approved version when an amendment is approved.
- Lists all budget versions for a grant.
- Returns current approved budget detail with periods and lines.
- Creates activity log entries for creation, line changes, approvals, and
  supersession.

- [ ] **Step 2: Run tests to confirm failure**

```bash
pnpm --filter @grantpipe/api test -- --run src/domains/grants/budget.service.test.ts
```

Expected: FAIL because service module is missing.

- [ ] **Step 3: Implement service**

Implement functions for:

- `createBudgetVersion`
- `updateDraftBudgetVersion`
- `listBudgetVersions`
- `getBudgetVersion`
- `getCurrentBudget`
- `createBudgetPeriod`
- `updateDraftBudgetPeriod`
- `createBudgetLine`
- `updateDraftBudgetLine`
- `deleteDraftBudgetLine`
- `approveBudgetVersion`
- `createAmendmentDraft`
- `approveAmendment`

Use existing API error helpers, auth context, org scoping patterns, and activity
log helpers.

- [ ] **Step 4: Run service tests**

```bash
pnpm --filter @grantpipe/api test -- --run src/domains/grants/budget.service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domains/grants/budget.service.ts apps/api/src/domains/grants/budget.service.test.ts
git commit -m "feat(api): add grant budget lifecycle service"
```

---

## Task 6: Expense Allocation Service

**Files:**

- Create: `apps/api/src/domains/grants/budget-allocations.service.ts`
- Create: `apps/api/src/domains/grants/budget-allocations.service.test.ts`

- [ ] **Step 1: Write failing allocation tests**

Cover:

- Assigns one expense to one budget line.
- Splits one expense across multiple budget lines by cents.
- Rejects split totals that do not equal the source expense amount.
- Rejects allocation to a budget line from another grant or org.
- Warns when allocation exceeds approved line budget.
- Warns when allocation uses an unallowable line.
- Records activity log entries for allocation changes.

- [ ] **Step 2: Run tests to confirm failure**

```bash
pnpm --filter @grantpipe/api test -- --run src/domains/grants/budget-allocations.service.test.ts
```

Expected: FAIL because service module is missing.

- [ ] **Step 3: Implement allocation service**

Implement:

- `setExpenseBudgetAllocations`
- `setJournalLineBudgetAllocations` if journal lines are present in the current
  schema.
- `validateAllocationOwnership`
- `validateAllocationTotals`
- `getBudgetLineAllocationWarnings`

- [ ] **Step 4: Run allocation tests**

```bash
pnpm --filter @grantpipe/api test -- --run src/domains/grants/budget-allocations.service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domains/grants/budget-allocations.service.ts apps/api/src/domains/grants/budget-allocations.service.test.ts
git commit -m "feat(api): add grant budget expense allocations"
```

---

## Task 7: Variance, Alerts, And Exports Service

**Files:**

- Create: `apps/api/src/domains/grants/budget-reporting.service.ts`
- Create: `apps/api/src/domains/grants/budget-reporting.service.test.ts`

- [ ] **Step 1: Write failing reporting tests**

Cover:

- Aggregates approved, actual, planned, remaining, and variance by budget line.
- Filters by period, category, program, fund, allowable flag, and cost type.
- Compares original approved budget to current approved budget.
- Creates over-budget alerts.
- Creates underspend alerts based on period progress.
- Creates unallowable-category alerts.
- Creates upcoming-period-deadline alerts.
- Generates export metadata and rows for budget-vs-actual CSV.
- Enforces Growth+ for alerts and exports.

- [ ] **Step 2: Run tests to confirm failure**

```bash
pnpm --filter @grantpipe/api test -- --run src/domains/grants/budget-reporting.service.test.ts
```

Expected: FAIL because reporting service is missing.

- [ ] **Step 3: Implement reporting service**

Implement:

- `getBudgetVarianceRows`
- `getBudgetAlerts`
- `createBudgetActualsExport`
- `calculateBudgetLineRollups`
- `calculateVariancePercent`
- `calculateUnderspendThreshold`

Use integer cents arithmetic and avoid floating point for stored money values.

- [ ] **Step 4: Run reporting tests**

```bash
pnpm --filter @grantpipe/api test -- --run src/domains/grants/budget-reporting.service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domains/grants/budget-reporting.service.ts apps/api/src/domains/grants/budget-reporting.service.test.ts
git commit -m "feat(api): add grant budget variance reporting"
```

---

## Task 8: Budget Routes

**Files:**

- Create: `apps/api/src/domains/grants/budget.routes.ts`
- Create: `apps/api/src/domains/grants/budget.routes.test.ts`
- Modify: `apps/api/src/domains/grants/routes.ts`

- [ ] **Step 1: Write failing route tests**

Cover:

- Viewer can read current budget and versions.
- Editor can create drafts, periods, lines, planned expenses, and expense
  allocations when entitled.
- Admin can approve versions and delete draft lines.
- Auditor can read approved budget, amendments, support documents, actuals, and
  variance data.
- Viewer cannot mutate budget data.
- Growth-only endpoints reject Starter when required.
- Audit-Ready amendment endpoints reject Starter and Growth.
- Invalid request bodies return validation errors.

- [ ] **Step 2: Run tests to confirm failure**

```bash
pnpm --filter @grantpipe/api test -- --run src/domains/grants/budget.routes.test.ts
```

Expected: FAIL because budget routes are missing.

- [ ] **Step 3: Implement Hono routes**

Mount the endpoints from the design spec under existing grants routes. Use shared
validators, existing auth middleware, org context, and role helpers.

- [ ] **Step 4: Run route tests**

```bash
pnpm --filter @grantpipe/api test -- --run src/domains/grants/budget.routes.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domains/grants/budget.routes.ts apps/api/src/domains/grants/budget.routes.test.ts apps/api/src/domains/grants/routes.ts
git commit -m "feat(api): add grant budget routes"
```

---

## Task 9: Web Grant Budget Hooks

**Files:**

- Modify: `apps/web/src/hooks/use-grants.ts`
- Modify: `apps/web/src/hooks/use-grants.test.ts`

- [ ] **Step 1: Write failing hook tests**

Cover query keys, endpoint calls, mutation payloads, and invalidation for:

- `useGrantBudget`
- `useGrantBudgetVersions`
- `useCreateGrantBudgetVersion`
- `useApproveGrantBudgetVersion`
- `useCreateGrantBudgetLine`
- `useUpdateGrantBudgetLine`
- `useSetExpenseBudgetAllocations`
- `useCreatePlannedExpense`
- `useCreateGrantBudgetAmendment`
- `useApproveGrantBudgetAmendment`
- `useGrantBudgetVariance`
- `useGrantBudgetAlerts`
- `useCreateGrantBudgetExport`

- [ ] **Step 2: Run tests to confirm failure**

```bash
pnpm --filter @grantpipe/web test -- --run src/hooks/use-grants.test.ts
```

Expected: FAIL because hooks are missing.

- [ ] **Step 3: Add hooks**

Implement Hono RPC calls using the existing `use-grants.ts` patterns. Invalidate
grant detail, budget, variance, alerts, and expense queries after mutations that
change budget or allocation state.

- [ ] **Step 4: Run hook tests**

```bash
pnpm --filter @grantpipe/web test -- --run src/hooks/use-grants.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/use-grants.ts apps/web/src/hooks/use-grants.test.ts
git commit -m "feat(web): add grant budget query hooks"
```

---

## Task 10: Report Generation Integration

**Files:**

- Modify: `apps/api/src/domains/compliance/routes.ts`
- Modify: `apps/api/src/domains/compliance/service.ts`
- Modify: `apps/api/src/domains/compliance/routes.test.ts`
- Modify: `apps/api/src/domains/compliance/service.test.ts`

- [ ] **Step 1: Write failing export integration tests**

Assert:

- Reporting-period budget-vs-actual export includes budget line, category,
  period, approved, actual, planned, remaining, and variance columns.
- Export respects org, grant, period, category, program, and fund filters.
- Export metadata records requesting user and generated timestamp.
- Starter cannot generate budget-vs-actual exports.

- [ ] **Step 2: Run tests to confirm failure**

```bash
pnpm --filter @grantpipe/api test -- --run src/domains/compliance/routes.test.ts
```

Expected: FAIL because budget-vs-actual export is not wired.

- [ ] **Step 3: Wire export integration**

Reuse `createBudgetActualsExport` from the reporting service and the existing
export delivery mechanism. Do not create a parallel export framework.

- [ ] **Step 4: Run export tests**

```bash
pnpm --filter @grantpipe/api test -- --run src/domains/compliance/routes.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domains/compliance apps/api/src/domains/grants/budget-reporting.service.ts apps/api/src/domains/grants/budget-reporting.service.test.ts
git commit -m "feat(api): add budget-vs-actual report export"
```

---

## Task 11: Grant Detail Budget Tab

**Files:**

- Create: `apps/web/src/components/grants/budget-tab.tsx`
- Create: `apps/web/src/components/grants/budget-version-toolbar.tsx`
- Create: `apps/web/src/components/grants/budget-line-editor.tsx`
- Create: `apps/web/src/components/grants/budget-variance-table.tsx`
- Create: `apps/web/src/components/grants/budget-alerts-panel.tsx`
- Create: `apps/web/src/components/grants/planned-expenses-panel.tsx`
- Create: `apps/web/src/components/grants/amendment-drawer.tsx`
- Add matching test files.
- Modify: `apps/web/src/routes/_authenticated/grants/$grantId.tsx`

- [ ] **Step 1: Write failing component and route tests**

Cover:

- Budget tab appears beside existing grant detail tabs.
- Starter can see budget-vs-actual table and manual draft setup.
- Growth sees alerts, exports, planned expenses, and reporting-period controls.
- Audit-Ready sees amendment drawer and audit history.
- Draft lines can be added and edited.
- Approved versions render locked controls.
- Admin approval action calls approve mutation.
- Version selector can read original, current, superseded, and draft versions.
- Empty state lets editor create the first budget version.

- [ ] **Step 2: Run tests to confirm failure**

```bash
pnpm --filter @grantpipe/web test -- --run src/components/grants src/routes/_authenticated/grants/\$grantId.test.tsx
```

Expected: FAIL because components and tab are missing.

- [ ] **Step 3: Implement components**

Use existing Shadcn primitives and grant detail layout patterns. Keep table rows
dense and operational. Use icons for actions, tooltips for unfamiliar icon-only
controls, and avoid marketing-style hero content inside the app.

- [ ] **Step 4: Run component tests**

```bash
pnpm --filter @grantpipe/web test -- --run src/components/grants src/routes/_authenticated/grants/\$grantId.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/grants apps/web/src/routes/_authenticated/grants/\$grantId.tsx
git commit -m "feat(web): add grant budget tab"
```

---

## Task 12: Expense Classification UI

**Files:**

- Create: `apps/web/src/components/grants/expense-budget-allocation.tsx`
- Create: `apps/web/src/components/grants/expense-budget-allocation.test.tsx`
- Modify: `apps/web/src/routes/_authenticated/accounting/reports/functional-expenses.tsx` if this is where expense assignment currently lives.
- Modify: `apps/web/src/routes/_authenticated/grants/$grantId.tsx` if grant expenses are edited from grant detail.

- [ ] **Step 1: Write failing UI tests**

Cover:

- Grant-linked expenses show a budget line selector.
- Single-line assignment submits one allocation equal to the expense amount.
- Split mode requires allocation totals to equal the expense amount.
- Over-budget warning is visible before submit.
- Unallowable category warning is visible before submit.
- Non-grant expenses do not show budget classification controls.

- [ ] **Step 2: Run tests to confirm failure**

```bash
pnpm --filter @grantpipe/web test -- --run src/components/grants/expense-budget-allocation.test.tsx src/routes/_authenticated/accounting/reports/functional-expenses.test.tsx src/routes/_authenticated/grants/\$grantId.test.tsx
```

Expected: FAIL because budget allocation UI is missing.

- [ ] **Step 3: Implement allocation UI**

Add the selector and split editor to existing expense forms. Use cents internally
and display dollars in inputs. Do not duplicate money-formatting helpers if the
repo already has them.

- [ ] **Step 4: Run UI tests**

```bash
pnpm --filter @grantpipe/web test -- --run src/components/grants/expense-budget-allocation.test.tsx src/routes/_authenticated/accounting/reports/functional-expenses.test.tsx src/routes/_authenticated/grants/\$grantId.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/grants/expense-budget-allocation.tsx apps/web/src/components/grants/expense-budget-allocation.test.tsx apps/web/src/routes/_authenticated/accounting/reports/functional-expenses.tsx apps/web/src/routes/_authenticated/accounting/reports/functional-expenses.test.tsx apps/web/src/routes/_authenticated/grants/\$grantId.tsx apps/web/src/routes/_authenticated/grants/\$grantId.test.tsx
git commit -m "feat(web): add expense budget classification"
```

---

## Task 13: Document Intake And Award Setup Budget Step

**Files:**

- Create: `apps/web/src/components/grants/budget-document-intake.tsx`
- Create: `apps/web/src/components/grants/budget-document-intake.test.tsx`
- Modify: `apps/web/src/routes/_authenticated/grants/index.tsx`
- Modify: `apps/web/src/routes/_authenticated/grants/index.test.tsx`
- Add matching tests.

- [ ] **Step 1: Write failing setup-flow tests**

Cover:

- Award setup includes a Budget step.
- User can add a period.
- User can add manual budget lines.
- User can select an uploaded award or funder budget document and map extracted
  candidate rows into draft budget lines.
- User can mark a line as unallowable.
- User can connect a line to a fund or program.
- User can save budget as draft and continue.
- Starter can use the basic budget step.

- [ ] **Step 2: Run tests to confirm failure**

```bash
pnpm --filter @grantpipe/web test -- --run src/components/grants/budget-document-intake.test.tsx src/routes/_authenticated/grants/index.test.tsx
```

Expected: FAIL because award setup has no budget step or document-intake mapper.

- [ ] **Step 3: Implement document intake mapper and setup step**

Reuse the Budget tab line editor where possible so manual setup behavior stays
consistent. The document intake mapper must show extracted candidate rows,
require the user to map category, amount, period, allowable flag, cost type,
fund, and program fields, preserve the source document ID, and create draft
budget lines only after confirmation.

- [ ] **Step 4: Run setup-flow tests**

```bash
pnpm --filter @grantpipe/web test -- --run src/components/grants/budget-document-intake.test.tsx src/routes/_authenticated/grants/index.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/grants/budget-document-intake.tsx apps/web/src/components/grants/budget-document-intake.test.tsx apps/web/src/routes/_authenticated/grants/index.tsx apps/web/src/routes/_authenticated/grants/index.test.tsx
git commit -m "feat(web): add grant budget step to award setup"
```

---

## Task 14: Site And SEO Rollout

**Files:**

- Modify: `apps/web/src/routes/index.tsx`
- Modify: `apps/web/src/routes/index.test.tsx`
- Modify: `apps/web/src/lib/plan-display.ts`
- Modify: `apps/web/src/lib/plan-display.test.ts`
- Modify: `apps/web/src/lib/help-content.ts`
- Modify: `apps/web/src/lib/help-content.test.ts`

- [ ] **Step 1: Write failing content tests**

Assert that key public surfaces mention:

- `funder-approved grant budgets`
- `budget-vs-actual controls`
- `restricted fund tracking`
- `grant compliance reporting`

Assert that content does not include fabricated testimonials, user counts, or
claims of nonprofit-operator experience.

- [ ] **Step 2: Run tests to confirm failure**

```bash
pnpm --filter @grantpipe/web test -- --run src/routes/index.test.tsx src/lib/plan-display.test.ts src/lib/help-content.test.ts
```

Expected: FAIL because grant budget content is absent.

- [ ] **Step 3: Update marketing content**

Use builder-perspective copy. Run `stop-slop` and then `humanizer` on every
user-facing copy change when both tools are available. If `stop-slop` is not
available in the execution environment, run `humanizer`, perform a manual
slop-removal pass, and document that fallback in the task evidence.

- [ ] **Step 4: Run content tests and site build**

```bash
pnpm --filter @grantpipe/web test -- --run src/routes/index.test.tsx src/lib/plan-display.test.ts src/lib/help-content.test.ts
turbo build --filter=@grantpipe/web
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/index.tsx apps/web/src/routes/index.test.tsx apps/web/src/lib/plan-display.ts apps/web/src/lib/plan-display.test.ts apps/web/src/lib/help-content.ts apps/web/src/lib/help-content.test.ts
git commit -m "feat(site): add grant budget tracking content"
```

---

## Task 15: Verification, Review, Merge, And Deploy

**Files:**

- All files changed by prior tasks.

- [ ] **Step 1: Run targeted coverage for touched packages**

```bash
pnpm --filter @grantpipe/shared test:coverage
pnpm --filter @grantpipe/api test:coverage
pnpm --filter @grantpipe/web test:coverage
```

Expected: every touched file meets the repository requirement of at least 95%
coverage.

- [ ] **Step 2: Run full quality gates**

```bash
turbo typecheck
turbo test:coverage
turbo lint
pnpm format:check
```

Expected: all pass.

- [ ] **Step 3: Run focused browser checks**

```bash
pnpm --filter @grantpipe/web dev
```

Open the local app and verify:

- Grant detail Budget tab renders on desktop and mobile widths.
- Draft budget line editing does not overflow.
- Split allocation inputs keep totals visible.
- Amendment drawer and planned-expense panels are usable on mobile.
- Alerts and upgrade states do not hide Starter budget visibility.

- [ ] **Step 4: Request code review**

Use `superpowers:requesting-code-review` and provide the reviewer:

- The spec file.
- This implementation plan.
- The full diff from the worktree.
- Test and coverage evidence.

- [ ] **Step 5: Fix reviewer findings**

For each finding:

- Reproduce or inspect the issue.
- Add or update a failing regression test.
- Implement the fix.
- Re-run the relevant targeted tests.
- Commit the fix.

- [ ] **Step 6: Merge to `master`**

```bash
git checkout master
git pull
git merge --no-ff feat/grant-budget-model
```

Expected: merge succeeds without unresolved conflicts.

- [ ] **Step 7: Deploy affected production apps**

Use Wrangler-backed repo scripts only:

```bash
pnpm run deploy:changed:dry-run
pnpm run deploy:changed
```

If the dry run shows both API and web/site changes, deploy those affected apps
through the repo scripts. Do not add GitHub Actions or Cloudflare git
auto-deploy as the production path.

- [ ] **Step 8: Remove worktree**

```bash
git worktree remove .worktrees/grant-budget-model
git branch -d feat/grant-budget-model
```

Expected: worktree is removed and `master` contains the completed feature.
