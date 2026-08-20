# Design System Shell Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace route-level hardcoded dashboard/settings/reports/import shell styling with shared `@grantpipe/ui` layout primitives and semantic status components.

**Architecture:** Add a small set of reusable page-shell primitives in `packages/ui` for hero headers, section surfaces, empty/loading/error states, and metric/status rows. Migrate the highest-traffic authenticated routes to those primitives without changing business behavior, then verify the shared components hold the visual contract through tests and live desktop checks.

**Tech Stack:** React 19, Vitest, Testing Library, Tailwind CSS 4, `@grantpipe/ui`

---

## File Structure

- Create: `packages/ui/src/components/page-shell.tsx`
  Shared authenticated-page hero, section shell, status panel, and stat tile primitives with semantic variants.
- Create: `packages/ui/src/components/page-shell.test.tsx`
  Component contract tests for semantic variants and layout states.
- Modify: `packages/ui/src/index.ts`
  Export the new page-shell primitives from `@grantpipe/ui`.
- Modify: `apps/web/src/routes/_authenticated/dashboard.tsx`
  Replace custom hero/section/status markup with shared primitives while preserving dashboard behavior.
- Modify: `apps/web/src/routes/_authenticated/settings.tsx`
  Replace route-local workspace shells, section surfaces, and inline loading/error blocks with shared primitives.
- Modify: `apps/web/src/routes/_authenticated/reports/index.tsx`
  Replace route-local hero/section/status panels with shared primitives and keep the recent mutation fixes intact.
- Modify: `apps/web/src/routes/_authenticated/import.tsx`
  Replace route-local hero/section/status panels with shared primitives and keep the recent stale-state fixes intact.
- Modify: `apps/web/src/routes/_authenticated/dashboard.test.tsx`
  Update route tests to assert the shared-shell contract is present.
- Modify: `apps/web/src/routes/_authenticated/settings.test.tsx`
  Update route tests to assert shared-shell loading/error rendering.
- Modify: `apps/web/src/routes/_authenticated/reports/index.test.tsx`
  Update route tests to assert shared-shell rendering and semantic status states.
- Modify: `apps/web/src/routes/_authenticated/import.test.tsx`
  Update route tests to assert shared-shell rendering and semantic status states.

### Task 1: Add Shared Page-Shell Primitives To `@grantpipe/ui`

**Files:**

- Create: `packages/ui/src/components/page-shell.tsx`
- Create: `packages/ui/src/components/page-shell.test.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Write the failing UI primitive tests**

Add tests that render:

- a `PageHero` with eyebrow, title, description, and metadata line
- a `SurfaceSection` with semantic density/intent defaults
- a `StatusPanel` with `empty`, `loading`, `error`, and `success` variants
- a `MetricTile` that shows label, value, and description

Required assertions:

- the semantic variants do not require route-local color classes to be passed in
- status variants render different accessible text regions
- shared primitives preserve content hierarchy with heading/text slots

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `pnpm --filter @grantpipe/ui test -- src/components/page-shell.test.tsx`

Expected: FAIL because `page-shell.tsx` exports do not exist yet.

- [ ] **Step 3: Implement the minimal shared primitives**

Build `page-shell.tsx` with:

- `PageHero`
- `SurfaceSection`
- `StatusPanel`
- `MetricTile`

Implementation rules:

- use semantic props such as `tone="default" | "warning" | "danger" | "success"` instead of route-local palette utilities
- use the repo's existing `cn` helper
- keep the API small and composable; do not build a giant layout abstraction

- [ ] **Step 4: Export the primitives from `packages/ui/src/index.ts`**

Add the new exports so route files can import from `@grantpipe/ui`.

- [ ] **Step 5: Run the UI primitive tests and package tests**

Run:

- `pnpm --filter @grantpipe/ui test -- src/components/page-shell.test.tsx`
- `pnpm --filter @grantpipe/ui test -- src/components/button.test.tsx src/components/badge.test.tsx src/components/card.test.tsx`

Expected: PASS.

### Task 2: Migrate Dashboard And Settings To The Shared Shell

**Files:**

- Modify: `apps/web/src/routes/_authenticated/dashboard.tsx`
- Modify: `apps/web/src/routes/_authenticated/settings.tsx`
- Modify: `apps/web/src/routes/_authenticated/dashboard.test.tsx`
- Modify: `apps/web/src/routes/_authenticated/settings.test.tsx`

- [ ] **Step 1: Write or adjust failing route tests first**

Add/adjust tests so they assert:

- dashboard uses the shared hero and keeps shell context during loading/error
- dashboard still shows freshness metadata
- settings keeps the organization profile visible while admin-only sections load inside semantic status panels
- settings loading/error copy is routed through shared shell primitives instead of bespoke blocks

- [ ] **Step 2: Run the targeted route tests to verify failures**

Run:

- `pnpm --filter @grantpipe/web test -- src/routes/_authenticated/dashboard.test.tsx`
- `pnpm --filter @grantpipe/web test -- src/routes/_authenticated/settings.test.tsx`

Expected: FAIL on the new assertions before route code is migrated.

- [ ] **Step 3: Migrate dashboard to shared primitives**

Replace custom hero and loading/error containers with `PageHero`, `SurfaceSection`, `StatusPanel`, and `MetricTile`.

Guardrails:

- preserve existing data formatting and links
- reduce direct color utility usage in the route
- do not regress the freshness timestamp or recent dashboard fixes

- [ ] **Step 4: Migrate settings to shared primitives**

Replace custom section wrappers and inline loading/error blocks with `SurfaceSection` and `StatusPanel`.

Guardrails:

- keep the current admin/non-admin behavior
- preserve the scoped loading fix from the latest pass
- keep button behavior and mutation handling unchanged

- [ ] **Step 5: Run the targeted route tests**

Run:

- `pnpm --filter @grantpipe/web test -- src/routes/_authenticated/dashboard.test.tsx`
- `pnpm --filter @grantpipe/web test -- src/routes/_authenticated/settings.test.tsx`

Expected: PASS.

### Task 3: Migrate Reports And Import To The Shared Shell

**Files:**

- Modify: `apps/web/src/routes/_authenticated/reports/index.tsx`
- Modify: `apps/web/src/routes/_authenticated/import.tsx`
- Modify: `apps/web/src/routes/_authenticated/reports/index.test.tsx`
- Modify: `apps/web/src/routes/_authenticated/import.test.tsx`

- [ ] **Step 1: Write or adjust failing tests first**

Add/adjust tests so they assert:

- reports and import render through the shared page hero/section primitives
- inline loading/error/empty/success states use semantic shared status rendering
- recent route fixes for pending states and stale-state handling remain intact

- [ ] **Step 2: Run the targeted route tests to verify failures**

Run:

- `pnpm --filter @grantpipe/web test -- src/routes/_authenticated/reports/index.test.tsx`
- `pnpm --filter @grantpipe/web test -- src/routes/_authenticated/import.test.tsx`

Expected: FAIL on the new shared-shell assertions before migration.

- [ ] **Step 3: Migrate reports to shared primitives**

Replace bespoke hero, section, and inline alert shells with shared primitives.

Guardrails:

- preserve the duplicate-submit protections and template-save recovery fix
- keep report list metadata humanized

- [ ] **Step 4: Migrate import to shared primitives**

Replace bespoke hero, section, and inline status blocks with shared primitives.

Guardrails:

- preserve the preview-signature logic and pending-state fixes
- keep the current import history states and action disabling behavior

- [ ] **Step 5: Run the targeted route tests**

Run:

- `pnpm --filter @grantpipe/web test -- src/routes/_authenticated/reports/index.test.tsx`
- `pnpm --filter @grantpipe/web test -- src/routes/_authenticated/import.test.tsx`

Expected: PASS.

### Task 4: Verify Design-System Adoption And Desktop UX

**Files:**

- Verify only; no new files expected

- [ ] **Step 1: Run the combined web/UI test set**

Run:

- `pnpm --filter @grantpipe/ui test -- src/components/page-shell.test.tsx`
- `pnpm --filter @grantpipe/web test -- src/routes/_authenticated/dashboard.test.tsx src/routes/_authenticated/settings.test.tsx src/routes/_authenticated/reports/index.test.tsx src/routes/_authenticated/import.test.tsx src/hooks/use-overview.test.ts`

Expected: PASS.

- [ ] **Step 2: Run desktop browser verification**

Manual/Playwright checks:

- `http://localhost:5173/app/dashboard`
- `http://localhost:5173/app/settings`
- `http://localhost:5173/app/reports`
- `http://localhost:5173/app/import`

Verify:

- hero/header chrome is consistent across all four pages
- loading/error/empty/success states read as one product language
- no duplicate-submit regressions in reports/import
- no obvious hardcoded palette bundles remain in those route files

- [ ] **Step 3: Record any remaining route-level hardcoded shell classes for follow-up**

Use:

- `rg "border-white/70|bg-gradient-to-br|bg-white/90|shadow-\\[|slate-|emerald-|amber-|red-" apps/web/src/routes/_authenticated/dashboard.tsx apps/web/src/routes/_authenticated/settings.tsx apps/web/src/routes/_authenticated/reports/index.tsx apps/web/src/routes/_authenticated/import.tsx`

Expected: only business-specific or content-specific classes remain, not duplicated shell primitives.
