# Restriction Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Growth+ restriction lifecycle across database, shared validators, API, web surfaces, reports, activity, billing gates, and public site claims.

**Architecture:** Add a dedicated `restrictions` domain that sits behind funds, grants, documents, reports, dashboard risk, and marketing claims. Restriction data is org-scoped, soft-delete aware, money-as-cents, and activity-logged. The first release is manual-control-first: users create terms, additions, releases, evidence links, alerts, rollforwards, and Audit-Ready evidence packages without automated expense release suggestions.

**Tech Stack:** Drizzle ORM, Neon Postgres, Hono RPC, Zod, React 19, TanStack Router/Query, Shadcn/UI, Tailwind CSS 4, Vitest, React Testing Library, Astro site tests, Wrangler deploy scripts

**Spec:** `docs/superpowers/specs/2026-05-02-restriction-lifecycle-design.md`

---

## Parallel Execution Groups

```
Task 0 (Worktree and baseline)
  -> Task 1 (Schema)
  -> Task 2 (Shared constants and validators)
      -> Group A (parallel): Tasks 3, 4, 5, 6, 7
          -> Task 8 (Routes and app mount)
              -> Group B (parallel): Tasks 9, 10, 11, 12, 13
                  -> Task 14 (Site claims)
                      -> Task 15 (End-to-end verification and deploy)
```

Tasks 3-7 can be split by service file after shared contracts exist. Tasks
9-13 can be split by web/report/site surface because they consume stable API
contracts.

---

## File Structure

```
packages/db/src/
  schema/
    restrictions.ts                 # New restriction tables and relations
    restrictions.test.ts            # Schema relation and soft-delete tests
    grants.ts                       # Relation exports only if needed
    compliance.ts                   # generated_reports type expectations if tested here
    index.ts                        # Re-export restrictions
  migrations/
    <generated>_restriction_lifecycle.sql

packages/shared/src/
  constants/
    index.ts                        # Restriction enums, report type, activity entity types, entitlements
    index.test.ts                   # Entitlement and enum tests
  validators/
    restrictions.ts                 # All restriction lifecycle schemas
    restrictions.test.ts
    index.ts                        # Re-export validators

apps/api/src/
  domains/restrictions/
    term.service.ts
    term.service.test.ts
    addition.service.ts
    addition.service.test.ts
    release.service.ts
    release.service.test.ts
    evidence.service.ts
    evidence.service.test.ts
    alerts.service.ts
    alerts.service.test.ts
    rollforward.service.ts
    rollforward.service.test.ts
    routes.ts
    routes.test.ts
  app.ts                            # Mount restrictions routes
  lib/activity-log.ts               # Add labels/types only if required by existing helper shape
  middleware/permissions.ts         # Add auditor read permissions only if required by current model

apps/web/src/
  hooks/
    use-restrictions.ts
    use-restrictions.test.ts
  components/restrictions/
    restriction-balance-card.tsx
    restriction-balance-card.test.tsx
    restriction-term-form.tsx
    restriction-term-form.test.tsx
    restriction-release-form.tsx
    restriction-release-form.test.tsx
    restriction-evidence-checklist.tsx
    restriction-evidence-checklist.test.tsx
    restriction-alert-list.tsx
    restriction-alert-list.test.tsx
    restriction-upgrade-prompt.tsx
    restriction-upgrade-prompt.test.tsx
  routes/_authenticated/
    funds/$fundId.tsx               # Add Restrictions tab
    funds/$fundId.test.tsx
    grants/$grantId.tsx             # Add restriction panel/tab
    grants/$grantId.test.tsx
    dashboard.tsx                   # Add restricted balance risk widgets
    dashboard.test.tsx
    reports/index.tsx               # Add restricted rollforward flow
    reports/index.test.tsx

apps/site/src/
  lib/
    marketed-capabilities.ts
    marketed-capabilities.test.ts
    pricing-txt.ts
    pricing-txt.test.ts
  config/
    site.ts
  content/features/
    restricted-fund-tracking.md
  pages/
    restricted-fund-tracking-software.astro
    grant-compliance-software.astro
    pricing.astro
    pricing.txt.ts
  pricing-page-seo-contract.test.ts
  content freshness / programmatic template tests as discovered
```

---

## Task 0: Worktree And Baseline

**Files:** No product files.

- [ ] **Step 1: Sync `master`**

```bash
git checkout master
git pull upstream master
```

Expected: local `master` is current with `upstream/master`.

- [ ] **Step 2: Create isolated worktree**

```bash
git check-ignore -q .worktrees
git worktree add .worktrees/restriction-lifecycle -b feat/restriction-lifecycle
cd .worktrees/restriction-lifecycle
```

Expected: feature work happens only inside `.worktrees/restriction-lifecycle`.

- [ ] **Step 3: Install dependencies and verify baseline**

```bash
pnpm install
pnpm exec turbo typecheck
pnpm exec turbo test
```

Expected: baseline typecheck and tests pass before product edits.

---

## Task 1: Database Schema And Migration

**Files:**

- Create: `packages/db/src/schema/restrictions.ts`
- Create: `packages/db/src/schema/restrictions.test.ts`
- Modify: `packages/db/src/schema/index.ts`
- Generated: `packages/db/src/migrations/<timestamp>_restriction_lifecycle.sql`

- [ ] **Step 1: Write failing schema tests**

Test cases:

- `restrictionTerms` has `orgId`, linked entity IDs, type/source fields,
  beginning balance cents, timestamps, and `deletedAt`.
- balances, additions, releases, evidence links, allowed programs, and allowed
  categories are org-scoped and soft-delete aware.
- relation tests verify term-to-additions, term-to-releases,
  term-to-balances, release-to-evidence, and term-to-allowed-list
  relationships.
- evidence link schema supports exactly one document or generated report target
  at validator/service level; DB allows nullable columns for polymorphic links.

Run:

```bash
pnpm --filter @grantpipe/db test -- src/schema/restrictions.test.ts
```

Expected: fails because `restrictions.ts` does not exist.

- [ ] **Step 2: Add schema**

Create `packages/db/src/schema/restrictions.ts` with:

- `restrictionTerms`
- `restrictionBalances`
- `restrictionAdditions`
- `restrictionReleases`
- `restrictionEvidenceLinks`
- `restrictionAllowedPrograms`
- `restrictionAllowedCategories`
- Drizzle relations
- indexes on `org_id`, linked entity IDs, `restriction_term_id`, period dates,
  transaction dates, and active soft-delete queries

Implementation rules:

- Use `bigint("amount_cents", { mode: "number" })` for money.
- Use `timestamp(..., { withTimezone: true })` for dates.
- Reference existing `organizations`, `user`, `funds`, `grants`, `donations`,
  `documents`, `generatedReports`, `expenses`, and accounting journal lines.
- Avoid circular imports by following the local accounting schema pattern if a
  journal line FK cannot be declared directly.

- [ ] **Step 3: Re-export schema**

Update `packages/db/src/schema/index.ts` so the new tables are exported.

- [ ] **Step 4: Generate migration**

Run:

```bash
pnpm --filter @grantpipe/db generate
```

Expected: a migration that creates all six tables and indexes.

- [ ] **Step 5: Run DB tests**

Run:

```bash
pnpm --filter @grantpipe/db test -- src/schema/restrictions.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema packages/db/src/migrations
git commit -m "feat(db): add restriction lifecycle schema"
```

---

## Task 2: Shared Constants, Entitlements, And Validators

**Files:**

- Modify: `packages/shared/src/constants/index.ts`
- Modify or create: `packages/shared/src/constants/index.test.ts`
- Create: `packages/shared/src/validators/restrictions.ts`
- Create: `packages/shared/src/validators/restrictions.test.ts`
- Modify: `packages/shared/src/validators/index.ts`

- [ ] **Step 1: Write failing tests**

Cover:

- restriction lifecycle enum values:
  `purpose`, `time`, `purpose_and_time`, `board_designated`, `unrestricted`
- restriction alert enum values include `release_term_conflict` and
  `expense_term_conflict`
- generated report type includes `restricted_rollforward`
- activity entity types include restriction lifecycle entities
- Starter has no restriction lifecycle or evidence package
- Growth has lifecycle but no evidence package
- Audit-Ready has both
- term validators require purpose statement and/or end date by type
- addition/release amounts require positive integer cents
- release schema accepts expense or journal line links
- evidence link schema requires exactly one of `documentId` or
  `generatedReportId`
- rollforward balance snapshot schema supports imported beginning balances and
  generated report snapshots
- rollforward filters require a valid period range

Run:

```bash
pnpm --filter @grantpipe/shared test -- src/constants/index.test.ts src/validators/restrictions.test.ts
```

Expected: fails on missing constants and validators.

- [ ] **Step 2: Add constants and entitlement helpers**

Update `PlanEntitlements`:

```ts
export type PlanEntitlements = {
  activeGrantCap: number;
  hasAutomationEmails: boolean;
  hasComplianceReportPack: boolean;
  hasRestrictionLifecycle: boolean;
  hasRestrictionEvidencePackage: boolean;
};
```

Add helpers:

```ts
export function hasRestrictionLifecycle(value: string | null | undefined): boolean;
export function hasRestrictionEvidencePackage(value: string | null | undefined): boolean;
```

Set plan rules exactly as the spec states.

- [ ] **Step 3: Add restriction validators**

Create validators for:

- `restrictionTermListSchema`
- `createRestrictionTermSchema`
- `updateRestrictionTermSchema`
- `createRestrictionAdditionSchema`
- `deleteRestrictionAdditionSchema`
- `createRestrictionReleaseSchema`
- `deleteRestrictionReleaseSchema`
- `createRestrictionEvidenceLinkSchema`
- `deleteRestrictionEvidenceLinkSchema`
- `restrictionAlertFilterSchema`
- `restrictionBalanceSnapshotSchema`
- `restrictedRollforwardFilterSchema`
- `restrictedRollforwardExportSchema`

Use `z.object(...).superRefine(...)` for conditional term requirements,
date-range validation, and evidence target exclusivity.

- [ ] **Step 4: Re-export validators**

Update `packages/shared/src/validators/index.ts`.

- [ ] **Step 5: Run shared tests**

```bash
pnpm --filter @grantpipe/shared test -- src/constants/index.test.ts src/validators/restrictions.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/constants packages/shared/src/validators
git commit -m "feat(shared): add restriction lifecycle contracts"
```

---

## Task 3: Restriction Term Service

**Files:**

- Create: `apps/api/src/domains/restrictions/term.service.ts`
- Create: `apps/api/src/domains/restrictions/term.service.test.ts`

- [ ] **Step 1: Write failing service tests**

Cover:

- lists only active terms for the current org
- filters by `fundId`, `grantId`, and `donationId`
- rejects linked entities from another org
- creates a term and records activity
- updates allowed editable fields and records a diff
- soft deletes a term and excludes it from active lists
- returns upgrade-gated errors when `hasRestrictionLifecycle` is false

Run:

```bash
pnpm --filter @grantpipe/api test -- src/domains/restrictions/term.service.test.ts
```

Expected: fails because service does not exist.

- [ ] **Step 2: Implement term service**

Follow existing grant/fund service patterns:

- accept `db`, `orgId`, `actorId`, and `planTier` through the same context
  style used by neighboring services
- validate plan entitlement before writes and active reads
- use shared validators before persistence
- scope all reads and writes by `orgId`
- filter `deletedAt` out of active reads
- call existing activity-log helper for create/update/delete

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @grantpipe/api test -- src/domains/restrictions/term.service.test.ts
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/domains/restrictions/term.service.ts apps/api/src/domains/restrictions/term.service.test.ts
git commit -m "feat(api): add restriction term service"
```

---

## Task 4: Additions And Releases Services

**Files:**

- Create: `apps/api/src/domains/restrictions/addition.service.ts`
- Create: `apps/api/src/domains/restrictions/addition.service.test.ts`
- Create: `apps/api/src/domains/restrictions/release.service.ts`
- Create: `apps/api/src/domains/restrictions/release.service.test.ts`

- [ ] **Step 1: Write failing addition tests**

Cover:

- creates positive additions for active terms in the same org
- rejects zero and negative amounts
- rejects additions for deleted terms
- links donation, grant, and journal line sources only when org scoped
- soft deletes additions
- records activity for create/delete

- [ ] **Step 2: Write failing release tests**

Cover:

- creates positive releases for active terms in the same org
- rejects releases that exceed available balance
- rejects cross-org expense and journal line links
- returns a release term conflict warning when a linked expense category,
  program, or account is outside the term's allowed lists
- returns a warning, not a silent success, when manual release metadata
  conflicts with the term's purpose/time rules
- flags release without evidence as missing support
- soft deletes releases and restores available balance in subsequent math
- records activity for create/delete

Run:

```bash
pnpm --filter @grantpipe/api test -- src/domains/restrictions/addition.service.test.ts src/domains/restrictions/release.service.test.ts
```

Expected: fails because services do not exist.

- [ ] **Step 3: Implement addition service**

Implement list/create/delete with org scoping, soft-delete filtering, shared
validation, and activity logging.

- [ ] **Step 4: Implement release service**

Implement list/create/delete plus balance validation:

```ts
available = beginningBalanceCents + activeAdditionsTotal - activeReleasesTotal;
```

Reject a new release when `amountCents > available`.

When a release is linked to an expense or journal line, compare available
program/category/account metadata against the term's allowed lists. Persist the
release when the amount is valid, but return warning metadata and feed alert
generation when the release conflicts with allowed terms.

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @grantpipe/api test -- src/domains/restrictions/addition.service.test.ts src/domains/restrictions/release.service.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/domains/restrictions/addition.service.ts apps/api/src/domains/restrictions/addition.service.test.ts apps/api/src/domains/restrictions/release.service.ts apps/api/src/domains/restrictions/release.service.test.ts
git commit -m "feat(api): add restriction additions and releases"
```

---

## Task 5: Evidence Service

**Files:**

- Create: `apps/api/src/domains/restrictions/evidence.service.ts`
- Create: `apps/api/src/domains/restrictions/evidence.service.test.ts`

- [ ] **Step 1: Write failing tests**

Cover:

- links an existing document to a release
- links an existing generated report to a release
- rejects input with both document and generated report IDs
- rejects input with neither target
- rejects cross-org document, generated report, and release IDs
- unlinks evidence with soft delete
- does not duplicate R2 file records
- records activity for link/unlink

Run:

```bash
pnpm --filter @grantpipe/api test -- src/domains/restrictions/evidence.service.test.ts
```

Expected: fails because service does not exist.

- [ ] **Step 2: Implement evidence service**

Use shared validators and existing document/generated report tables. Keep the
service limited to evidence link records; document storage remains owned by the
documents domain.

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @grantpipe/api test -- src/domains/restrictions/evidence.service.test.ts
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/domains/restrictions/evidence.service.ts apps/api/src/domains/restrictions/evidence.service.test.ts
git commit -m "feat(api): link restriction release evidence"
```

---

## Task 6: Alerts And Rollforward Services

**Files:**

- Create: `apps/api/src/domains/restrictions/alerts.service.ts`
- Create: `apps/api/src/domains/restrictions/alerts.service.test.ts`
- Create: `apps/api/src/domains/restrictions/rollforward.service.ts`
- Create: `apps/api/src/domains/restrictions/rollforward.service.test.ts`

- [ ] **Step 1: Write failing alert tests**

Cover:

- missing evidence alert for release without active evidence link
- expired time restriction with unreleased balance
- negative balance risk rows from attempted over-release are returned as
  validation errors, not persisted releases
- release term conflict alerts when release metadata or linked expenses fall
  outside allowed programs/categories/accounts
- expense term conflict alerts when a fund/grant expense conflicts with an
  active restriction term even before a release is recorded
- alert summary filters by fund, grant, and period
- Starter receives upgrade prompt metadata instead of alert rows

- [ ] **Step 2: Write failing rollforward tests**

Cover:

- beginning balance plus additions minus releases equals ending balance
- imported or period-close `restriction_balances` snapshots establish the
  selected period beginning balance when detailed prior transactions are absent
- generated rollforward output can persist a `restriction_balances` snapshot
  linked to the generated report
- soft-deleted terms/additions/releases are excluded
- rows group by fund, grant, donor, program, and fiscal period where data
  exists
- Growth can generate `restricted_rollforward`
- Audit-Ready can include evidence package metadata
- Growth cannot request Audit-Ready evidence package output
- generated report records use `restricted_rollforward`

Run:

```bash
pnpm --filter @grantpipe/api test -- src/domains/restrictions/alerts.service.test.ts src/domains/restrictions/rollforward.service.test.ts
```

Expected: fails because services do not exist.

- [ ] **Step 3: Implement alerts service**

Return normalized alert rows:

- `missing_evidence`
- `expired_time_restriction`
- `release_without_support`
- `release_term_conflict`
- `expense_term_conflict`
- `negative_restricted_balance`

Include linked `termId`, optional `fundId`, optional `grantId`, amount cents,
and human-readable label data for the UI.

- [ ] **Step 4: Implement rollforward service**

Calculate rows from active terms, additions, releases, and evidence links.
Persist generated report metadata through the existing compliance/reporting
pattern and use R2/file generation helpers only if existing generated report
services require them.

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @grantpipe/api test -- src/domains/restrictions/alerts.service.test.ts src/domains/restrictions/rollforward.service.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/domains/restrictions/alerts.service.ts apps/api/src/domains/restrictions/alerts.service.test.ts apps/api/src/domains/restrictions/rollforward.service.ts apps/api/src/domains/restrictions/rollforward.service.test.ts
git commit -m "feat(api): add restriction alerts and rollforward"
```

---

## Task 7: Activity, Permissions, And Auditor Access

**Files:**

- Modify if needed: `apps/api/src/lib/activity-log.ts`
- Modify if needed: `apps/api/src/domains/activity/service.ts`
- Modify if needed: `apps/api/src/middleware/permissions.ts`
- Create or modify matching tests beside touched files

- [ ] **Step 1: Write failing tests for touched behavior**

Cover only behavior the current code requires:

- activity feed can render restriction entity types
- auditor can read restrictions, evidence, releases, rollforwards, accounting,
  documents, and reports
- auditor cannot mutate restrictions
- viewer can read restrictions and rollforwards
- editor/admin can mutate terms, additions, releases, and evidence

Run targeted tests for every touched file.

- [ ] **Step 2: Implement permission/activity updates**

Reuse existing role and permission helpers. Do not create parallel permission
logic inside restriction services when middleware already owns it.

- [ ] **Step 3: Run tests**

Run the targeted tests for touched files.

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/lib apps/api/src/domains/activity apps/api/src/middleware
git commit -m "feat(api): expose restriction activity and auditor access"
```

---

## Task 8: Restriction Routes And App Mount

**Files:**

- Create: `apps/api/src/domains/restrictions/routes.ts`
- Create: `apps/api/src/domains/restrictions/routes.test.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Write failing route tests**

Cover:

- every route uses shared validators
- list/get routes enforce read permission and Growth+ gate
- create/update/delete routes enforce editor/admin mutation permission
- auditor can read but cannot mutate
- rollforward route enforces report permission
- evidence package option enforces Audit-Ready entitlement
- Hono RPC type export remains valid after app mount

Run:

```bash
pnpm --filter @grantpipe/api test -- src/domains/restrictions/routes.test.ts
```

Expected: fails because routes do not exist.

- [ ] **Step 2: Implement routes**

Mount the service methods under the paths defined in the spec. Use existing
middleware patterns for auth, org context, permission checks, and error
responses.

- [ ] **Step 3: Mount routes**

Update `apps/api/src/app.ts` with the restrictions domain route.

- [ ] **Step 4: Run API route tests**

```bash
pnpm --filter @grantpipe/api test -- src/domains/restrictions/routes.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domains/restrictions/routes.ts apps/api/src/domains/restrictions/routes.test.ts apps/api/src/app.ts
git commit -m "feat(api): add restriction lifecycle routes"
```

---

## Task 9: Web Hooks

**Files:**

- Create: `apps/web/src/hooks/use-restrictions.ts`
- Create: `apps/web/src/hooks/use-restrictions.test.ts`

- [ ] **Step 1: Write failing hook tests**

Cover:

- term list query keys include filters
- create/update/delete term mutations invalidate term and summary queries
- addition/release/evidence mutations invalidate term detail, alerts, fund,
  grant, and report queries as appropriate
- rollforward generation mutation returns generated report metadata
- upgrade prompt metadata is exposed to Starter surfaces

Run:

```bash
pnpm --filter @grantpipe/web test -- src/hooks/use-restrictions.test.ts
```

Expected: fails because hook does not exist.

- [ ] **Step 2: Implement hooks**

Use the existing Hono RPC client and TanStack Query conventions from
`use-grants.ts` and `use-documents.ts`. Keep query keys stable and export
small hooks instead of a single large object.

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @grantpipe/web test -- src/hooks/use-restrictions.test.ts
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/hooks/use-restrictions.ts apps/web/src/hooks/use-restrictions.test.ts
git commit -m "feat(web): add restriction lifecycle hooks"
```

---

## Task 10: Restriction Components

**Files:**

- Create: `apps/web/src/components/restrictions/restriction-balance-card.tsx`
- Create: `apps/web/src/components/restrictions/restriction-balance-card.test.tsx`
- Create: `apps/web/src/components/restrictions/restriction-term-form.tsx`
- Create: `apps/web/src/components/restrictions/restriction-term-form.test.tsx`
- Create: `apps/web/src/components/restrictions/restriction-release-form.tsx`
- Create: `apps/web/src/components/restrictions/restriction-release-form.test.tsx`
- Create: `apps/web/src/components/restrictions/restriction-evidence-checklist.tsx`
- Create: `apps/web/src/components/restrictions/restriction-evidence-checklist.test.tsx`
- Create: `apps/web/src/components/restrictions/restriction-alert-list.tsx`
- Create: `apps/web/src/components/restrictions/restriction-alert-list.test.tsx`
- Create: `apps/web/src/components/restrictions/restriction-upgrade-prompt.tsx`
- Create: `apps/web/src/components/restrictions/restriction-upgrade-prompt.test.tsx`

- [ ] **Step 1: Write failing component tests**

Cover:

- balance card shows beginning, additions, releases, ending, and risk status
- term form conditionally requires purpose/end date fields by restriction type
- release form blocks submit when amount exceeds available balance
- evidence checklist shows missing and linked evidence states
- alert list renders missing evidence, expired time restriction, release without
  support, term conflict, and negative balance rows
- upgrade prompt links to billing/upgrade path and does not expose mutation
  controls

Run:

```bash
pnpm --filter @grantpipe/web test -- src/components/restrictions
```

Expected: fails because components do not exist.

- [ ] **Step 2: Implement components**

Follow the existing app design system. Use compact work-focused layouts, tabs,
tables, badges, dialogs, and icon buttons where the app already uses them.
Avoid marketing-style hero content inside authenticated routes.

- [ ] **Step 3: Run component tests**

```bash
pnpm --filter @grantpipe/web test -- src/components/restrictions
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/restrictions
git commit -m "feat(web): add restriction lifecycle components"
```

---

## Task 11: Fund, Grant, Dashboard, And Reports UX

**Files:**

- Modify: `apps/web/src/routes/_authenticated/funds/$fundId.tsx`
- Modify: `apps/web/src/routes/_authenticated/funds/$fundId.test.tsx`
- Modify: `apps/web/src/routes/_authenticated/grants/$grantId.tsx`
- Modify: `apps/web/src/routes/_authenticated/grants/$grantId.test.tsx`
- Modify: `apps/web/src/routes/_authenticated/dashboard.tsx`
- Modify: `apps/web/src/routes/_authenticated/dashboard.test.tsx`
- Modify: `apps/web/src/routes/_authenticated/reports/index.tsx`
- Modify: `apps/web/src/routes/_authenticated/reports/index.test.tsx`

- [ ] **Step 1: Write failing route tests**

Cover:

- fund detail has a `Restrictions` tab
- fund detail tab shows balance, terms, release workflow, and evidence
  checklist for Growth+
- fund detail shows upgrade prompt for Starter
- grant detail shows restriction context beside allocations, expenses,
  documents, and spend-down
- auditor sees read-only restriction surfaces
- dashboard shows restricted balance risk and missing evidence alerts
- dashboard and grant/fund surfaces show term conflict warnings for expenses or
  releases that do not match allowed program/category/account rules
- reports page can generate restricted rollforward
- Audit-Ready report flow can include evidence package metadata

Run:

```bash
pnpm --filter @grantpipe/web test -- src/routes/_authenticated/funds/\$fundId.test.tsx src/routes/_authenticated/grants/\$grantId.test.tsx src/routes/_authenticated/dashboard.test.tsx src/routes/_authenticated/reports/index.test.tsx
```

Expected: fails because surfaces are not wired.

- [ ] **Step 2: Implement fund detail integration**

Add a restrictions tab without removing existing fund overview behavior. Keep
fund balance and restriction lifecycle visually connected.

- [ ] **Step 3: Implement grant detail integration**

Add a restriction panel/tab that uses the same term and alert hooks filtered by
grant ID. Link to related documents and expenses where data exists.

- [ ] **Step 4: Implement dashboard risk widgets**

Add compact alert widgets using `restriction-alert-list` data. Avoid duplicate
business logic in the route; the API owns alert computation.

- [ ] **Step 5: Implement reports flow**

Add restricted rollforward generation and Audit-Ready evidence package option.
Show entitlement-specific prompts when unavailable.

- [ ] **Step 6: Run route tests**

```bash
pnpm --filter @grantpipe/web test -- src/routes/_authenticated/funds/\$fundId.test.tsx src/routes/_authenticated/grants/\$grantId.test.tsx src/routes/_authenticated/dashboard.test.tsx src/routes/_authenticated/reports/index.test.tsx
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/routes/_authenticated/funds apps/web/src/routes/_authenticated/grants apps/web/src/routes/_authenticated/dashboard.tsx apps/web/src/routes/_authenticated/dashboard.test.tsx apps/web/src/routes/_authenticated/reports
git commit -m "feat(web): integrate restrictions into funds grants dashboard and reports"
```

---

## Task 12: Documents And Activity UI Integration

**Files:**

- Modify if needed: `apps/web/src/components/entity-documents-section.tsx`
- Modify if needed: `apps/web/src/components/entity-documents-section.test.tsx`
- Modify if needed: `apps/web/src/components/entity-activity-section.tsx`
- Modify if needed: `apps/web/src/components/entity-activity-section.test.tsx`
- Modify if needed: `apps/web/src/routes/_authenticated/activity.tsx`
- Modify if needed: `apps/web/src/routes/_authenticated/activity.test.tsx`

- [ ] **Step 1: Write failing tests for required UI changes**

Cover:

- evidence links can select existing documents
- activity labels render restriction term, addition, release, evidence, and
  rollforward events
- auditor can inspect evidence/activity without mutation controls

Run targeted web tests for touched files.

- [ ] **Step 2: Implement UI updates**

Keep document storage behavior unchanged. Evidence linking is a relationship
from releases to existing document/generated report records.

- [ ] **Step 3: Run tests**

Run targeted tests for touched files.

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/entity-documents-section.tsx apps/web/src/components/entity-documents-section.test.tsx apps/web/src/components/entity-activity-section.tsx apps/web/src/components/entity-activity-section.test.tsx apps/web/src/routes/_authenticated/activity.tsx apps/web/src/routes/_authenticated/activity.test.tsx
git commit -m "feat(web): show restriction evidence and activity context"
```

---

## Task 13: Seed Data And Demo Fixtures

**Files:**

- Modify if needed: `packages/db/src/seed-demo.ts`
- Modify matching tests or smoke scripts if they exist

- [ ] **Step 1: Write failing fixture tests or run existing smoke check**

If the repo has seed tests, add assertions that demo data includes:

- one purpose restriction
- one time restriction
- one release with evidence
- one missing evidence alert case
- one term conflict warning case

If no seed tests exist, run the existing seed script in the documented local
mode and capture failures before editing.

- [ ] **Step 2: Add demo restriction data**

Use fake but plausible data only. Do not include real donor, grantee, financial,
or testimonial data.

- [ ] **Step 3: Verify seed behavior**

Run the targeted seed test or smoke command.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/seed-demo.ts
git commit -m "chore(db): seed restriction lifecycle demo data"
```

---

## Task 14: Public Site Claims And SEO Contracts

**Files:**

- Modify: `apps/site/src/lib/marketed-capabilities.ts`
- Modify: `apps/site/src/lib/marketed-capabilities.test.ts`
- Modify: `apps/site/src/config/site.ts`
- Modify: `apps/site/src/lib/pricing-txt.ts`
- Modify: `apps/site/src/lib/pricing-txt.test.ts`
- Modify: `apps/site/src/content/features/restricted-fund-tracking.md`
- Modify: `apps/site/src/pages/restricted-fund-tracking-software.astro`
- Modify: `apps/site/src/pages/grant-compliance-software.astro`
- Modify: `apps/site/src/pricing-page-seo-contract.test.ts`
- Modify programmatic content templates or generators discovered by:

```bash
rg -n "restricted fund|restricted-fund|grant compliance|pricingTiers|marketed capabilities" apps/site packages/ui/src/site
```

- [ ] **Step 1: Write failing site tests**

Cover:

- Starter copy does not claim full restriction lifecycle.
- Growth copy includes terms, additions, releases, evidence links, alerts, and
  rollforward.
- Audit-Ready copy includes evidence package output.
- pricing text, JSON-LD/schema contracts, and marketed capability overrides
  match the entitlement rules.
- feature page copy avoids fabricated social proof and does not claim nonprofit
  operating experience.

Run:

```bash
pnpm --filter @grantpipe/site test -- src/lib/marketed-capabilities.test.ts src/lib/pricing-txt.test.ts src/pricing-page-seo-contract.test.ts
```

Expected: fails until copy and feature arrays are updated.

- [ ] **Step 2: Update centralized marketed capabilities**

Update `getShippedPlanFeatureOverrides()`:

- Starter: basic funds/grants visibility and upgrade language, not full
  restriction lifecycle.
- Growth: restriction lifecycle, evidence links, alerts, restricted
  rollforward.
- Audit-Ready: evidence package output and advanced audit-facing exports.

- [ ] **Step 3: Update site config and pricing text**

Update pricing tier features, FAQs, CTA subtitles, and AI-readable pricing so
public claims match entitlements.

- [ ] **Step 4: Update restricted fund and grant compliance pages**

Use copy that says GrantPipe is built to manage donor, grant, fund, release,
and evidence records together. Do not fabricate results, user counts,
testimonials, or nonprofit practitioner experience.

`stop-slop` is not available in this session. Apply the repo's copy rules
manually and use the `humanizer` skill when drafting final public copy.

- [ ] **Step 5: Update programmatic templates**

Edit generators/templates rather than hundreds of generated pages. Only touch
individual generated content when it is the canonical source file.

- [ ] **Step 6: Run site tests**

```bash
pnpm --filter @grantpipe/site test -- src/lib/marketed-capabilities.test.ts src/lib/pricing-txt.test.ts src/pricing-page-seo-contract.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add apps/site packages/ui/src/site
git commit -m "feat(site): align restriction lifecycle claims with entitlements"
```

---

## Task 15: Verification, Review, Merge, Cleanup, Deploy

**Files:** No product files unless verification exposes defects.

- [ ] **Step 1: Run targeted package coverage for touched areas**

Run targeted tests during earlier tasks, then run affected package coverage:

```bash
turbo test:coverage
```

Expected: 95% minimum coverage on every touched file.

- [ ] **Step 2: Run typecheck and lint**

```bash
turbo typecheck
turbo lint
```

Expected: pass.

- [ ] **Step 3: Run site build**

```bash
pnpm --filter @grantpipe/site build
```

Expected: pass.

- [ ] **Step 4: Run web/API builds if touched by implementation**

```bash
turbo build --filter=@grantpipe/web
turbo build --filter=@grantpipe/api
```

Expected: pass.

- [ ] **Step 5: Code review**

Use `superpowers:requesting-code-review` from the worktree. Fix every issue the
reviewer flags. Re-run the smallest failing verification command after each
fix, then rerun the full verification set above.

- [ ] **Step 6: Merge to master**

From the main repo after review and verification pass:

```bash
git checkout master
git pull
git merge --no-ff feat/restriction-lifecycle
```

Resolve conflicts by preserving current `master` behavior and the completed
restriction lifecycle changes.

- [ ] **Step 7: Remove worktree**

```bash
git worktree remove .worktrees/restriction-lifecycle
git branch -d feat/restriction-lifecycle
```

- [ ] **Step 8: Deploy affected production apps**

Run only the deploys affected by implementation:

```bash
pnpm run deploy:changed:dry-run
pnpm run deploy:changed
```

If the changed deploy detector misses a required surface, use the explicit
Wrangler-backed scripts:

```bash
pnpm run deploy:api
pnpm run deploy:web
pnpm run deploy:site
```

Expected: affected production apps deploy through the repository's Wrangler
scripts.

---

## Implementation Notes

- Keep all queries scoped by `orgId`.
- Keep soft-deleted rows out of active balances, alerts, and rollforwards.
- Preserve activity history for deleted rows.
- Do not duplicate document storage for evidence.
- Keep money as integer cents through API and UI contracts.
- Use shared validators in API routes and form validation.
- Reuse existing billing, permission, activity, document, generated report, and
  TanStack Query patterns.
- Do not add placeholder work comments, `any`, or unexplained `eslint-disable`
  comments.
- Do not hand-edit hundreds of SEO pages when a template or centralized
  capability config controls the claim.
