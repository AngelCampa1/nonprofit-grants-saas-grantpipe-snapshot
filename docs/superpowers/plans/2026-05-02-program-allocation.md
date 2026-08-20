# Program Allocation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Program Allocation as an Audit-Ready operating dimension across database, shared contracts, API, web UX, reporting, exports, permissions, billing gates, and marketing content.

**Architecture:** Add a first-class `programs` domain with explicit RBAC, Audit-Ready mutation/export gates, and Growth read-only previews. Program budgets and allocations are stored as org-scoped Drizzle tables; API services expose focused CRUD, allocation, and reporting operations; the web app adds Programs navigation, allocation drawers, and budget-vs-actual reporting; the marketing site consistently positions Program Allocation as Audit-Ready.

**Tech Stack:** TypeScript ESM, Drizzle ORM, Neon Postgres, Hono RPC, Zod, Better Auth, React 19, TanStack Router, TanStack Query, Shadcn/UI, Tailwind CSS 4, Vitest, Playwright, Wrangler

**Spec:** `docs/superpowers/specs/2026-05-02-program-allocation-design.md`

---

## Parallel Execution Map

```
Task 1 (Workspace and Baseline)
  |-- Task 2 (Shared Contracts)
  |     `-- Task 3 (Database)
  |           `-- Task 4 (API Programs Domain)
  |                 |-- Task 5 (Existing Domain Extensions)
  |                 `-- Task 6 (Reports and Exports)
  |-- Task 7 (Web App UX)
  `-- Task 8 (Marketing and SEO)
        `-- Task 9 (Final Verification, Review, Merge, Deploy)
```

Tasks 7 and 8 can begin after shared contracts stabilize. Task 9 cannot begin
until all implementation, tests, and content updates are complete.

---

## File Structure

Expected creation and modification map:

```
packages/shared/src/
  constants/index.ts                    # Plan entitlement and feature-area constants
  constants/index.test.ts
  types/index.ts                        # FeatureArea and program API types
  types/index.test.ts
  validators/programs.ts                # Program, budget, allocation, report schemas
  validators/programs.test.ts
  validators/index.ts                   # Re-export program validators

packages/db/src/
  schema/
    programs.ts                         # Program tables and relations
    index.ts                            # Re-export program schema
  migrations/*_program_allocation.sql   # Generated migration
  migrations/program-allocation.test.ts # Migration shape and index checks if repo pattern supports it

apps/api/src/
  app.ts
  domains/programs/
    routes.ts
    routes.test.ts
    program.service.ts
    program.service.test.ts
    budget.service.ts
    budget.service.test.ts
    allocation.service.ts
    allocation.service.test.ts
    report.service.ts
    report.service.test.ts
  domains/grants/*                      # Program allocation response extensions
  domains/funds/*                       # Fund availability context for warnings
  domains/accounting/*                  # Expense allocation integration
  domains/compliance/*                  # Reporting requirement program links
  domains/reports/*                     # Program dimension filters

apps/web/src/
  hooks/use-programs.ts
  hooks/use-programs.test.ts
  components/programs/
    program-form.tsx
    program-form.test.tsx
    program-budget-table.tsx
    program-budget-table.test.tsx
    program-allocation-drawer.tsx
    program-allocation-drawer.test.tsx
    program-funding-mix.tsx
    program-funding-mix.test.tsx
    program-budget-vs-actual.tsx
    program-budget-vs-actual.test.tsx
    program-upgrade-callout.tsx
    program-upgrade-callout.test.tsx
  routes/_authenticated/programs/
    index.tsx
    index.test.tsx
    $programId.tsx
    $programId.test.tsx
  routes/_authenticated/grants/*        # Program tab and allocation drawer entry point
  routes/_authenticated/accounting/*    # Expense allocation drawer entry point
  components/layout/*                   # Programs nav item

packages/ui/src/site/
  content/*                             # Feature, pricing, and SEO markdown claims
  content/*.test.ts                     # Content regression tests
  lib/*                                 # Central marketed capability config

apps/site/
  src/**/*                              # Pricing/product/homepage rendering and tests
  public/pricing.txt                    # Machine-readable pricing claims
```

---

## Task 1: Workspace And Baseline

**Files:**

- Create worktree under `.worktrees/program-allocation`.
- Create: `docs/superpowers/specs/2026-05-02-program-allocation-design.md`
- Create: `docs/superpowers/plans/2026-05-02-program-allocation.md`

- [ ] **Step 1: Pull latest on master**

Run:

```bash
git checkout master
git pull
```

Expected: the local branch is up to date or fast-forwarded. If the branch is
ahead of upstream, preserve local commits and do not reset.

- [ ] **Step 2: Create an isolated worktree**

Run:

```bash
git check-ignore -q .worktrees
git worktree add .worktrees/program-allocation -b feat/program-allocation
cd .worktrees/program-allocation
```

Expected: `.worktrees` is ignored and the new branch is checked out.

- [ ] **Step 3: Capture baseline status**

Run:

```bash
git status --short
pnpm install
turbo typecheck
turbo test --filter=@grantpipe/shared --filter=@grantpipe/api
```

Expected: clean worktree before edits. Record any pre-existing failures in the
commit message or implementation notes before continuing.

- [ ] **Step 4: Commit the approved spec**

Run:

```bash
git add docs/superpowers/specs/2026-05-02-program-allocation-design.md
git commit -m "docs: approve program allocation design"
```

- [ ] **Step 5: Commit this implementation plan**

Run:

```bash
git add docs/superpowers/plans/2026-05-02-program-allocation.md
git commit -m "docs: add program allocation implementation plan"
```

---

## Task 2: Shared Contracts

**Files:**

- Modify: `packages/shared/src/constants/index.ts`
- Modify: `packages/shared/src/constants/index.test.ts`
- Modify: `packages/shared/src/types/index.ts`
- Modify: `packages/shared/src/types/index.test.ts`
- Create: `packages/shared/src/validators/programs.ts`
- Create: `packages/shared/src/validators/programs.test.ts`
- Modify: `packages/shared/src/validators/index.ts`

- [ ] **Step 1: Write failing shared tests**

Create tests that assert:

- `FEATURE_AREAS` includes `"programs"`.
- role permission maps include `programs`.
- Audit-Ready has full program allocation capability flags.
- Growth has read-only program preview flags and no mutation/export flags.
- program create/update schemas trim names and require non-empty names.
- budget lines require positive integer cents.
- allocation schemas support amount mode and percent mode, but reject rows with
  both or neither.
- expense allocation percent totals must equal 10000 basis points when the API
  operation is replace-and-balance.
- export query params accept valid period filters and reject inverted dates.

Run:

```bash
pnpm --filter @grantpipe/shared test -- programs
```

Expected: FAIL because the constants and schemas do not exist yet.

- [ ] **Step 2: Implement constants and types**

Add `programs` to `FeatureArea`. Add program status, budget status, allocation
mode, allocation warning, and entitlement types. Entitlements must distinguish:

- `canViewProgramContext`
- `canManagePrograms`
- `canManageProgramAllocations`
- `canExportProgramReports`

Growth sets only `canViewProgramContext`. Audit-Ready sets all four.

- [ ] **Step 3: Implement Zod validators**

Add schemas for:

- `programCreateSchema`
- `programUpdateSchema`
- `programListQuerySchema`
- `programBudgetCreateSchema`
- `programBudgetUpdateSchema`
- `programBudgetLineSchema`
- `grantProgramAllocationReplaceSchema`
- `expenseProgramAllocationReplaceSchema`
- `programImpactMetricLinkSchema`
- `programReportingRequirementLinkSchema`
- `programBudgetVsActualQuerySchema`
- `programBudgetVsActualExportQuerySchema`

Use cents for money, basis points for percentages, ISO date strings for dates,
UUIDs for IDs, and explicit refinements for amount-vs-percent mode.

- [ ] **Step 4: Run shared verification**

Run:

```bash
pnpm --filter @grantpipe/shared test -- programs
pnpm --filter @grantpipe/shared test:coverage
pnpm --filter @grantpipe/shared typecheck
```

Expected: all shared tests pass and touched files meet 95% coverage.

- [ ] **Step 5: Commit shared contracts**

Run:

```bash
git add packages/shared/src
git commit -m "feat(shared): add program allocation contracts"
```

---

## Task 3: Database

**Files:**

- Modify: `packages/db/src/schema.ts`
- Create: `packages/db/src/migrations/*_program_allocation.sql`
- Create or modify migration tests following the package's current test pattern.

- [ ] **Step 1: Write failing schema and migration tests**

Assert the database layer exposes:

- `programs`
- `program_budgets`
- `program_budget_lines`
- `grant_program_allocations`
- `expense_program_allocations`
- `program_impact_metric_links`
- `program_reporting_requirement_links`

Assert every new table has `org_id`, timestamps, and `deleted_at` where mutable.
Assert indexes exist for program list, budget period lookup, grant allocation
lookup, expense allocation lookup, and program report aggregation.

Run:

```bash
pnpm --filter @grantpipe/db test
```

Expected: FAIL until schema and migration exist.

- [ ] **Step 2: Add Drizzle schema and relations**

Implement the tables from the spec. Use existing repo helpers for IDs,
timestamps, org references, soft delete, and relations. Keep money in cents and
percent in basis points.

- [ ] **Step 3: Generate and inspect migration**

Run:

```bash
pnpm --filter @grantpipe/db generate
```

Inspect the generated SQL for:

- tenant-scoped indexes.
- uniqueness of program code per org among active rows.
- foreign keys to grants, expenses, impact metrics, reporting requirements, and
  users where those tables exist.
- no hard-delete cascades that would violate audit expectations.

- [ ] **Step 4: Run database verification**

Run:

```bash
pnpm --filter @grantpipe/db test
pnpm --filter @grantpipe/db typecheck
```

Expected: DB tests and typecheck pass.

- [ ] **Step 5: Commit database work**

Run:

```bash
git add packages/db/src
git commit -m "feat(db): add program allocation schema"
```

---

## Task 4: API Programs Domain

**Files:**

- Create: `apps/api/src/domains/programs/routes.ts`
- Create: `apps/api/src/domains/programs/routes.test.ts`
- Create: `apps/api/src/domains/programs/program.service.ts`
- Create: `apps/api/src/domains/programs/program.service.test.ts`
- Create: `apps/api/src/domains/programs/budget.service.ts`
- Create: `apps/api/src/domains/programs/budget.service.test.ts`
- Create: `apps/api/src/domains/programs/allocation.service.ts`
- Create: `apps/api/src/domains/programs/allocation.service.test.ts`
- Create: `apps/api/src/domains/programs/report.service.ts`
- Create: `apps/api/src/domains/programs/report.service.test.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Write failing service tests**

Cover:

- program CRUD scoped by `orgId`.
- archive uses `deletedAt`.
- budget and budget-line CRUD.
- grant allocation replacement by amount and percent.
- expense allocation replacement by amount and percent.
- over-allocation warning generation.
- duplicate program allocation rejection.
- budget-vs-actual aggregation without double counting.
- activity log entries with before/after values.

Run:

```bash
pnpm --filter @grantpipe/api test -- programs
```

Expected: FAIL because the domain is not implemented.

- [ ] **Step 2: Write failing route tests**

Cover:

- admin/editor mutation access on Audit-Ready.
- viewer read access.
- auditor scoped read access.
- Growth read-only preview access.
- Growth mutation/export rejection.
- Starter access rejection where previews are not intended.
- validation errors for invalid payloads.

Run:

```bash
pnpm --filter @grantpipe/api test -- programs/routes
```

Expected: FAIL because routes are not mounted.

- [ ] **Step 3: Implement services**

Use existing domain patterns for DB access, pagination, auth context, activity
log writes, and errors. Keep allocation math in `allocation.service.ts` so route
handlers stay thin.

- [ ] **Step 4: Implement routes and mount the domain**

Mount `/api/programs` in `apps/api/src/app.ts`. Apply shared validators at the
edge and require Audit-Ready on mutation/export endpoints with the existing tier
gate helper.

- [ ] **Step 5: Run API verification**

Run:

```bash
pnpm --filter @grantpipe/api test -- programs
pnpm --filter @grantpipe/api test:coverage
pnpm --filter @grantpipe/api typecheck
```

Expected: API tests pass and touched files meet 95% coverage.

- [ ] **Step 6: Commit API domain**

Run:

```bash
git add apps/api/src/domains/programs apps/api/src/app.ts
git commit -m "feat(api): add program allocation domain"
```

---

## Task 5: Existing Domain Extensions

**Files:**

- Modify grant domain files under `apps/api/src/domains/grants/`
- Modify fund/accounting expense files under `apps/api/src/domains/funds/` or `apps/api/src/domains/accounting/`
- Modify compliance/reporting requirement files under `apps/api/src/domains/compliance/`
- Modify impact metric files under the existing reporting or compliance domain
- Modify report domain files under `apps/api/src/domains/reports/`

- [ ] **Step 1: Write failing integration tests**

Assert:

- grant detail returns program allocations.
- expense detail returns program allocations.
- expense create/update can replace program allocations atomically.
- reporting requirements expose program links.
- impact metrics expose program ownership and optional grant link.
- reporting requirement program link mutations create before/after activity log
  entries.
- impact metric program ownership mutations create before/after activity log
  entries.
- report filters accept `programId` only where report semantics support it.
- every extension remains org-scoped.

Run targeted API tests for each touched domain. Expected: FAIL before
implementation.

- [ ] **Step 2: Extend grant and expense flows**

Add program allocation reads to details and replace operations to mutations.
Use the programs allocation service rather than duplicating allocation math.

- [ ] **Step 3: Extend compliance and outcome flows**

Add program link reads and writes for reporting requirements and impact metrics.
Use link tables unless a direct FK is already safer in the existing schema.

- [ ] **Step 4: Extend report filters**

Add the program dimension to report queries that can aggregate allocated expense
shares without double counting. Reject `programId` filters on reports that
cannot interpret program allocation correctly.

- [ ] **Step 5: Run domain verification**

Run:

```bash
pnpm --filter @grantpipe/api test
pnpm --filter @grantpipe/api test:coverage
pnpm --filter @grantpipe/api typecheck
```

Expected: API package passes with 95% coverage for touched files.

- [ ] **Step 6: Commit integration work**

Run:

```bash
git add apps/api/src/domains
git commit -m "feat(api): connect programs to grants expenses and reporting"
```

---

## Task 6: Reports And Exports

**Files:**

- Modify: `apps/api/src/domains/programs/report.service.ts`
- Modify or create export helpers following existing repo pattern.
- Modify report tests under `apps/api/src/domains/programs/` and `apps/api/src/domains/reports/`.

- [ ] **Step 1: Write failing export tests**

Assert:

- budget-vs-actual export includes period, category, budget, actual, remaining,
  grant, fund, and source expense rows.
- export requires Audit-Ready.
- Growth can view preview report data but cannot export.
- exported totals reconcile to allocated expense shares.
- activity log or export audit evidence is recorded if existing export flows
  log evidence.

Run targeted report/export tests. Expected: FAIL before implementation.

- [ ] **Step 2: Implement aggregation**

Aggregate actuals from expense-program allocations and source expense or journal
data. Allocate source amounts exactly once and preserve cents-level rounding.

- [ ] **Step 3: Implement export**

Use the existing export format and headers. Include enough identifiers for audit
traceability: program code, grant name/code, fund name, expense ID/date,
category, and source amount.

- [ ] **Step 4: Run report verification**

Run:

```bash
pnpm --filter @grantpipe/api test -- programs/report
pnpm --filter @grantpipe/api test:coverage
```

Expected: report and export tests pass with 95% coverage for touched files.

- [ ] **Step 5: Commit reporting work**

Run:

```bash
git add apps/api/src/domains
git commit -m "feat(api): add program budget actual reporting"
```

---

## Task 7: Web App UX

**Files:**

- Create: `apps/web/src/hooks/use-programs.ts`
- Create: `apps/web/src/hooks/use-programs.test.ts`
- Create: `apps/web/src/components/programs/*.tsx`
- Create: `apps/web/src/components/programs/*.test.tsx`
- Create: `apps/web/src/routes/_authenticated/programs/index.tsx`
- Create: `apps/web/src/routes/_authenticated/programs/index.test.tsx`
- Create: `apps/web/src/routes/_authenticated/programs/$programId.tsx`
- Create: `apps/web/src/routes/_authenticated/programs/$programId.test.tsx`
- Modify authenticated layout/navigation files.
- Modify grant and accounting/expense route files to add program allocation
  entry points.

- [ ] **Step 1: Write failing hook and route tests**

Assert:

- program list fetches filters through Hono RPC.
- create/edit/archive mutations invalidate program queries.
- Growth preview disables create/edit/export actions.
- Audit-Ready users can access create/edit/export actions.
- program detail renders Overview, Funding/Budget, Expenses, Requirements,
  Outcomes, and Activity tabs.
- empty states are useful and contain no placeholder copy.

Run:

```bash
pnpm --filter @grantpipe/web test -- programs
```

Expected: FAIL before UI exists.

- [ ] **Step 2: Build hooks**

Implement TanStack Query hooks for list, detail, budgets, allocations,
budget-vs-actual, and export. Use existing auth/client patterns and shared
validators for form data.

- [ ] **Step 3: Build program components**

Create:

- `ProgramForm`
- `ProgramBudgetTable`
- `ProgramAllocationDrawer`
- `ProgramFundingMix`
- `ProgramBudgetVsActual`
- `ProgramUpgradeCallout`

Use existing Shadcn/UI primitives. Keep controls dense and operational. Use
icon buttons where appropriate and ensure stable dimensions for tables, drawers,
and action controls.

- [ ] **Step 4: Build routes and navigation**

Add Programs to app navigation. Add list and detail routes. Add grant Programs
tab and expense allocation drawer launch points.

- [ ] **Step 5: Add Growth preview states**

Replace create, edit, archive, allocation save, and export controls with precise
Audit-Ready CTAs for Growth users. Keep read-only context visible where useful.

- [ ] **Step 6: Run web verification**

Run:

```bash
pnpm --filter @grantpipe/web test -- programs
pnpm --filter @grantpipe/web test:coverage
pnpm --filter @grantpipe/web typecheck
```

Expected: web tests pass with 95% coverage for touched files.

- [ ] **Step 7: Browser verification**

Start the app:

```bash
pnpm --filter @grantpipe/web dev
```

Use Playwright or the in-app browser to verify desktop and mobile widths:

- Programs list.
- Program detail tabs.
- Allocation drawer amount mode.
- Allocation drawer percent mode.
- Growth preview CTAs.
- No text overflow or incoherent overlap.

- [ ] **Step 8: Commit web UX**

Run:

```bash
git add apps/web/src
git commit -m "feat(web): add program allocation workspace"
```

---

## Task 8: Marketing And SEO

**Files:**

- Modify centralized site capability and pricing config.
- Modify homepage, product, feature, pricing, and `pricing.txt` sources.
- Modify SEO markdown pages under `apps/site/src/content/` and
  `packages/ui/src/site/content/` where feature-list or tier claims appear.
- Add or modify content regression tests.

- [ ] **Step 1: Search every marketed feature claim**

Run:

```bash
rg -n "Audit-Ready|Growth|features|capabilities|allocation|program allocation|multi-program|pricing" apps/site packages/ui/src/site apps/site/public
```

Record every file that lists GrantPipe features, plan capabilities, or
Audit-Ready differentiators.

- [ ] **Step 2: Write failing content tests**

Assert:

- Audit-Ready pricing config includes Program Allocation.
- Growth pricing config does not claim full allocation management.
- `pricing.txt` includes Audit-Ready Program Allocation.
- product and pricing pages render the same tier claim.
- every SEO markdown page with a GrantPipe feature list, pricing table, tier
  summary, or Audit-Ready capability claim includes Program Allocation as an
  Audit-Ready capability.
- SEO markdown pages do not remove tier-specific claims just to bypass Program
  Allocation coverage.

Run the relevant site/UI tests. Expected: FAIL before content updates.

- [ ] **Step 3: Update centralized claims**

Update the central capability source first so rendered pages inherit the correct
language where possible. Use "Program Allocation" or "Program budget-vs-actual"
consistently.

- [ ] **Step 4: Update rendered pages and markdown**

Update homepage highlights, product page anchors, pricing cards, feature pages,
`pricing.txt`, and all SEO markdown feature lists found in Step 1. Growth copy
must use read-only wording only when the product actually exposes a preview.

- [ ] **Step 5: Add a Program Allocation feature destination**

If the existing feature-page architecture supports feature destinations, add a
Program Allocation page that explains Audit-Ready allocation, budget, reporting,
and export workflows without fabricated testimonials, logos, or customer counts.

- [ ] **Step 6: Run marketing verification**

Run:

```bash
pnpm --filter @grantpipe/ui test -- site
pnpm --filter @grantpipe/site test
pnpm --filter @grantpipe/site build
```

Expected: content tests and site build pass.

- [ ] **Step 7: Commit marketing rollout**

Run:

```bash
git add apps/site packages/ui/src/site
git commit -m "feat(site): market program allocation as audit ready"
```

---

## Task 9: Final Verification, Review, Merge, Deploy

**Files:**

- All files changed by Tasks 2-8.

- [ ] **Step 1: Run affected quality gates**

Run:

```bash
turbo typecheck
turbo lint
turbo test:coverage
pnpm format:check
```

Expected: all commands exit 0. Touched files meet 95% coverage.

- [ ] **Step 2: Run production build checks**

Run:

```bash
turbo build
```

Expected: all packages build.

- [ ] **Step 3: Request review agent**

Use `superpowers:requesting-code-review` and provide the reviewer:

- this spec path.
- this plan path.
- the full diff from the implementation branch.
- the required checks already run.

The reviewer must check DRY, RBAC, tier gates, org scoping, allocation math,
activity log coverage, reporting double-counting risk, Growth copy, and content
claim consistency.

- [ ] **Step 4: Fix every review finding**

For each finding:

- write or update a failing test when the finding is behavioral.
- implement the fix.
- run the targeted test.
- commit the fix with a conventional commit message.

- [ ] **Step 5: Merge to master**

Run:

```bash
git checkout master
git pull
git merge --no-ff feat/program-allocation
```

Expected: merge succeeds without discarding unrelated local work.

- [ ] **Step 6: Remove worktree**

Run:

```bash
git worktree remove .worktrees/program-allocation
git branch -d feat/program-allocation
```

Expected: worktree is removed and the feature branch is deleted after merge.

- [ ] **Step 7: Deploy affected apps**

Run the changed deploy dry-run first:

```bash
pnpm run deploy:changed:dry-run
```

Then deploy the affected apps with Wrangler-backed scripts:

```bash
pnpm run deploy:changed
```

If the dry-run does not include a changed production surface that Program
Allocation touched, deploy explicitly:

```bash
pnpm run deploy:api
pnpm run deploy:web
pnpm run deploy:site
```

- [ ] **Step 8: Record release evidence**

Update the PR or release notes with:

- summary of Program Allocation scope.
- tests and coverage commands run.
- browser verification screenshots or notes.
- reviewer findings and fixes.
- deploy command output summary.

---

## Test Plan

- Shared validator tests for valid and invalid program budgets, amount mode,
  percent mode, over-allocation inputs, impact ownership, and export filters.
- DB migration tests for new tables, indexes, relations, org scoping, soft
  delete columns, and money/percent storage.
- API service tests for CRUD, allocation math, budget-vs-actual aggregation,
  activity log entries, and tier gating.
- API route tests for admin/editor mutation, viewer read, auditor scoped read,
  Growth read-only preview, and Audit-Ready full access.
- Web tests for list, detail, forms, drawers, report view, upgrade states, empty
  states, and no placeholder copy.
- Browser checks for desktop and mobile layouts with no text overflow in key
  surfaces.
- Marketing tests for pricing/product links, `pricing.txt`, marketed capability
  config, SEO content consistency, and Growth no-overclaim language.
- Coverage requirement remains 95% per touched file.

---

## Implementation Notes

- Preserve org scoping on every query and mutation.
- Preserve soft delete for mutable records.
- Use activity log entries for allocation changes with before/after values.
- Do not log secrets, raw session tokens, donor data, or financial data beyond
  the records the application already stores.
- Do not introduce `any` in TypeScript.
- Do not add placeholder code or deferred-work comments.
- Keep Program Allocation copy from the builder perspective; do not fabricate
  nonprofit sector experience, testimonials, user counts, or social proof.
