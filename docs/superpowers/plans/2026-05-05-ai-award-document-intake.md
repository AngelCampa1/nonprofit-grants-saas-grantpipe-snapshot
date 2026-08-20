# AI Award Document Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build AI Award Document Intake as a Growth+ async workflow that turns an uploaded award document into a reviewed grant setup package with source references, explicit duplicate decisions, and audit logs.

**Architecture:** Add shared extraction contracts, org-scoped Drizzle tables, an API `document-extractions` domain with queue-backed OpenRouter processing, and web review surfaces that poll extraction status and commit approved setup. Marketing and pricing capability sources are updated so Growth+ positioning is consistent across the public site.

**Tech Stack:** TypeScript ESM, Drizzle ORM, Neon Postgres, Hono RPC, Cloudflare Workers Queues, R2, OpenRouter chat completions, Zod, React 19, TanStack Router, TanStack Query, Shadcn/UI, Tailwind CSS 4, Vitest, Wrangler

**Spec:** `docs/superpowers/specs/2026-05-05-ai-award-document-intake-design.md`

---

## Execution Map

```
Task 1: Workspace, spec, plan, baseline
Task 2: Shared constants and validators
Task 3: Database schema and migration
Task 4: API provider, queue, service, and routes
Task 5: Web intake entry points and review workflow
Task 6: Marketing and SEO rollout
Task 7: Final verification, review, merge, cleanup, deploy
```

The implementation should keep commits small and follow red-green-refactor for
each task. Shared contracts should land before API and web work. Marketing can
proceed after the public capability names are stable.

---

## File Structure

Expected creation and modification map:

```
docs/superpowers/specs/2026-05-05-ai-award-document-intake-design.md
docs/superpowers/plans/2026-05-05-ai-award-document-intake.md

packages/shared/src/constants/index.ts
packages/shared/src/constants/index.test.ts
packages/shared/src/validators/document-extractions.ts
packages/shared/src/validators/document-extractions.test.ts
packages/shared/src/validators/index.ts

packages/db/src/schema/document-extractions.ts
packages/db/src/schema/document-extractions.test.ts
packages/db/src/schema/index.ts
packages/db/src/migrations/*_document_extractions.sql

apps/api/wrangler.toml
apps/api/src/types.ts
apps/api/src/app.ts
apps/api/src/app.test.ts
apps/api/src/domains/document-extractions/routes.ts
apps/api/src/domains/document-extractions/routes.test.ts
apps/api/src/domains/document-extractions/service.ts
apps/api/src/domains/document-extractions/service.test.ts
apps/api/src/domains/document-extractions/openrouter.ts
apps/api/src/domains/document-extractions/openrouter.test.ts
apps/api/src/domains/document-extractions/queue.ts
apps/api/src/domains/document-extractions/queue.test.ts

apps/web/src/hooks/use-document-extractions.ts
apps/web/src/hooks/use-document-extractions.test.ts
apps/web/src/components/document-extractions/award-intake-entry.tsx
apps/web/src/components/document-extractions/award-intake-entry.test.tsx
apps/web/src/components/document-extractions/extraction-review.tsx
apps/web/src/components/document-extractions/extraction-review.test.tsx
apps/web/src/routes/_authenticated/grants/index.tsx
apps/web/src/routes/_authenticated/grants/index.test.tsx
apps/web/src/routes/_authenticated/grants/$grantId.tsx
apps/web/src/routes/_authenticated/grants/$grantId.test.tsx
apps/web/src/routes/_authenticated/award-intake/$extractionId.tsx
apps/web/src/routes/_authenticated/award-intake/$extractionId.test.tsx

apps/site/src/pages/features/ai-award-document-intake.astro
apps/site/src/**/*
packages/ui/src/site/**/*
```

---

## Task 1: Workspace, Spec, Plan, Baseline

**Files:**

- Create: `docs/superpowers/specs/2026-05-05-ai-award-document-intake-design.md`
- Create: `docs/superpowers/plans/2026-05-05-ai-award-document-intake.md`

- [ ] **Step 1: Pull latest and create worktree**

Run:

```bash
git checkout master
git pull
git check-ignore -q .worktrees
git worktree add .worktrees/ai-award-document-intake -b feat/ai-award-document-intake
cd .worktrees/ai-award-document-intake
```

Expected: the local base is current, `.worktrees` is ignored, and the feature
branch is checked out in the worktree.

- [ ] **Step 2: Save the approved design spec and this plan**

Write the spec and plan files shown in the user-approved plan. Commit them:

```bash
git add docs/superpowers/specs/2026-05-05-ai-award-document-intake-design.md docs/superpowers/plans/2026-05-05-ai-award-document-intake.md
git commit -m "docs: add ai award intake design plan"
```

- [ ] **Step 3: Capture baseline**

Run:

```bash
pnpm install
turbo typecheck --filter=@grantpipe/shared --filter=@grantpipe/db --filter=@grantpipe/api --filter=@grantpipe/web --filter=@grantpipe/site
```

Expected: dependency install completes and scoped typecheck either passes or any
pre-existing failure is recorded before code changes.

---

## Task 2: Shared Constants And Validators

**Files:**

- Modify: `packages/shared/src/constants/index.ts`
- Modify: `packages/shared/src/constants/index.test.ts`
- Create: `packages/shared/src/validators/document-extractions.ts`
- Create: `packages/shared/src/validators/document-extractions.test.ts`
- Modify: `packages/shared/src/validators/index.ts`

- [ ] **Step 1: Write failing tests**

Add tests asserting:

- `DOCUMENT_ENTITY_TYPES` includes `"award_intake"`.
- `ACTIVITY_ENTITY_TYPES` includes `"document_extraction"`.
- `PlanEntitlements` includes `hasAwardDocumentIntake`.
- Starter is false; Growth, Audit-Ready, and Enterprise are true.
- `hasAwardDocumentIntake()` normalizes unknown plans to Starter.
- Extraction status, review action, source, field, provider response, review
  action payload, and commit payload schemas accept valid examples and reject
  invalid confidence, missing source refs, invalid duplicate decisions, and empty
  required grant basics.

Run:

```bash
pnpm --filter @grantpipe/shared test -- document-extractions constants
```

Expected: FAIL because constants and validators do not exist yet.

- [ ] **Step 2: Implement constants**

Add:

- `award_intake` to `DOCUMENT_ENTITY_TYPES`.
- `document_extraction` to `ACTIVITY_ENTITY_TYPES`.
- `hasAwardDocumentIntake` to `PlanEntitlements` and `PLAN_ENTITLEMENTS`.
- A `hasAwardDocumentIntake(value)` helper.

- [ ] **Step 3: Implement validators**

Create schemas for extraction statuses, review actions, source references,
normalized extracted fields, normalized provider response, review action request,
and commit request. Require commit payloads to include explicit `funderDecision`
and `grantDecision` objects with `create_new` or `map_existing`.

- [ ] **Step 4: Verify shared tests**

Run:

```bash
pnpm --filter @grantpipe/shared test -- document-extractions constants
```

Expected: PASS.

Commit:

```bash
git add packages/shared/src/constants/index.ts packages/shared/src/constants/index.test.ts packages/shared/src/validators/document-extractions.ts packages/shared/src/validators/document-extractions.test.ts packages/shared/src/validators/index.ts
git commit -m "feat(shared): add award intake contracts"
```

---

## Task 3: Database Schema And Migration

**Files:**

- Create: `packages/db/src/schema/document-extractions.ts`
- Create: `packages/db/src/schema/document-extractions.test.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/src/migrations/*_document_extractions.sql`

- [ ] **Step 1: Write failing DB tests**

Assert the schema exports all four tables, includes `orgId`, foreign keys,
status/action enum values, and indexes named for org-scoped lookup patterns.

Run:

```bash
pnpm --filter @grantpipe/db test -- document-extractions
```

Expected: FAIL because the schema does not exist.

- [ ] **Step 2: Implement schema**

Define `document_extractions`, `document_extraction_fields`,
`document_extraction_sources`, and `document_extraction_actions` using existing
Drizzle conventions. Reference `documents`, `grants`, `orgs`, and user ids where
the existing schema supports it. Use JSONB for raw provider output, normalized
values, token usage, boxes, and before/after values.

- [ ] **Step 3: Generate or author migration**

Run:

```bash
pnpm --filter @grantpipe/db generate
```

If generation is unavailable in the worktree, author the SQL migration following
existing migration style and include all tables, indexes, and foreign keys.

- [ ] **Step 4: Verify DB tests**

Run:

```bash
pnpm --filter @grantpipe/db test -- document-extractions
```

Expected: PASS.

Commit:

```bash
git add packages/db/src/schema/document-extractions.ts packages/db/src/schema/document-extractions.test.ts packages/db/src/schema/index.ts packages/db/src/migrations
git commit -m "feat(db): add document extraction tables"
```

---

## Task 4: API Provider, Queue, Service, And Routes

**Files:**

- Modify: `apps/api/wrangler.toml`
- Modify: `apps/api/src/types.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/app.test.ts`
- Create: `apps/api/src/domains/document-extractions/routes.ts`
- Create: `apps/api/src/domains/document-extractions/routes.test.ts`
- Create: `apps/api/src/domains/document-extractions/service.ts`
- Create: `apps/api/src/domains/document-extractions/service.test.ts`
- Create: `apps/api/src/domains/document-extractions/openrouter.ts`
- Create: `apps/api/src/domains/document-extractions/openrouter.test.ts`
- Create: `apps/api/src/domains/document-extractions/queue.ts`
- Create: `apps/api/src/domains/document-extractions/queue.test.ts`

- [ ] **Step 1: Write failing provider and service tests**

Cover:

- OpenRouter request uses the configured model, strict JSON schema response
  format, `file-parser`/PDF parsing and `response-healing` plugins, and
  sanitized errors.
- Starter orgs cannot create or commit extractions.
- Growth+ orgs can create an extraction and enqueue a job.
- Queue success stores fields/sources and marks `ready_for_review`.
- Queue malformed JSON marks `failed`.
- Review actions append action rows and update field status.
- Commit requires explicit funder and grant duplicate decisions.
- Commit transaction creates linked grant records and rolls back on failure.
- Activity log rows are recorded for lifecycle, decisions, and created records.

Run:

```bash
pnpm --filter @grantpipe/api test -- document-extractions
```

Expected: FAIL.

- [ ] **Step 2: Implement OpenRouter adapter**

Use dependency injection for `fetch` so tests can mock success, failure, and
malformed responses. Parse `choices[0].message.content`, validate with shared
schemas, and return provider metadata without logging raw document content.

- [ ] **Step 3: Implement service**

Implement `createExtraction`, `getExtraction`, `recordReviewAction`,
`processAwardIntakeJob`, and `commitExtraction`. Keep persistence in the
service and HTTP wiring in routes. Use existing grant, funder, document, and
activity-log helpers where practical.

- [ ] **Step 4: Implement routes and mount**

Expose:

```text
POST /document-extractions
GET /document-extractions/:id
POST /document-extractions/:id/actions
POST /document-extractions/:id/commit
POST /document-extractions/:id/cancel
```

Mount the domain in `app.ts`, add queue consumer wiring, and define the
`AWARD_INTAKE_QUEUE` binding in Wrangler config/types.

- [ ] **Step 5: Verify API tests**

Run:

```bash
pnpm --filter @grantpipe/api test -- document-extractions app
```

Expected: PASS.

Commit:

```bash
git add apps/api/wrangler.toml apps/api/src/types.ts apps/api/src/app.ts apps/api/src/app.test.ts apps/api/src/domains/document-extractions
git commit -m "feat(api): add award document extraction workflow"
```

---

## Task 5: Web Intake Entry Points And Review Workflow

**Files:**

- Create: `apps/web/src/hooks/use-document-extractions.ts`
- Create: `apps/web/src/hooks/use-document-extractions.test.ts`
- Create: `apps/web/src/components/document-extractions/award-intake-entry.tsx`
- Create: `apps/web/src/components/document-extractions/award-intake-entry.test.tsx`
- Create: `apps/web/src/components/document-extractions/extraction-review.tsx`
- Create: `apps/web/src/components/document-extractions/extraction-review.test.tsx`
- Modify: `apps/web/src/routes/_authenticated/grants/index.tsx`
- Modify: `apps/web/src/routes/_authenticated/grants/index.test.tsx`
- Modify: `apps/web/src/routes/_authenticated/grants/$grantId.tsx`
- Modify: `apps/web/src/routes/_authenticated/grants/$grantId.test.tsx`
- Create: `apps/web/src/routes/_authenticated/award-intake/$extractionId.tsx`
- Create: `apps/web/src/routes/_authenticated/award-intake/$extractionId.test.tsx`

- [ ] **Step 1: Write failing web tests**

Cover:

- Grant list/new grant flow shows AI award intake entry.
- Starter sees upgrade copy and cannot start extraction.
- Growth+ can start extraction.
- Review route polls while processing.
- Ready review shows sections, confidence, source snippets, low-confidence
  treatment, destination labels, edit/reject/defer/map actions, and duplicate
  decision controls.
- Commit button stays disabled until required basics and duplicate decisions are
  resolved.
- Grant detail document tab exposes intake action for eligible award documents.

Run:

```bash
pnpm --filter @grantpipe/web test -- document-extractions grants
```

Expected: FAIL.

- [ ] **Step 2: Implement hooks and components**

Follow existing Hono RPC/TanStack Query hook patterns. Keep components focused:
entry point handles affordance and upgrade copy; review component handles
sections, action forms, duplicate decisions, and commit state.

- [ ] **Step 3: Wire routes**

Add the authenticated review route and update generated route tree if the repo's
router generation requires it. Add entry points in grant list/new grant flow and
grant detail documents tab.

- [ ] **Step 4: Verify web tests**

Run:

```bash
pnpm --filter @grantpipe/web test -- document-extractions grants
```

Expected: PASS.

Commit:

```bash
git add apps/web/src/hooks/use-document-extractions.ts apps/web/src/hooks/use-document-extractions.test.ts apps/web/src/components/document-extractions apps/web/src/routes/_authenticated
git commit -m "feat(web): add award intake review workflow"
```

---

## Task 6: Marketing And SEO Rollout

**Files:**

- Modify: `apps/site/src/**/*`
- Modify: `packages/ui/src/site/**/*`
- Create: `apps/site/src/pages/features/ai-award-document-intake.astro`

- [ ] **Step 1: Write failing site tests**

Update existing pricing/product/technical SEO/content tests to assert:

- Growth plan includes AI Award Document Intake.
- Starter does not claim executable intake.
- Product capability inventory includes the feature.
- Dedicated feature page exists with canonical metadata.
- Related feature surfaces can link to the page.

Run:

```bash
pnpm --filter @grantpipe/site test -- award pricing feature
```

Expected: FAIL.

- [ ] **Step 2: Update shared marketing capability sources first**

Add concise builder-perspective copy. Do not fabricate testimonials, user counts,
or social proof. Avoid thin AI stuffing in unrelated long-form pages.

- [ ] **Step 3: Add dedicated feature page**

Create a page that explains document upload, source-backed extraction, human
review, duplicate decisions, and grant setup commit. Link it from relevant
feature inventories.

- [ ] **Step 4: Run content sweep**

Use `rg` to find feature-list, capability, pricing, and comparison surfaces.
Update every inventory-style surface and add related-feature links where a body
mention would be forced.

- [ ] **Step 5: Verify site tests**

Run:

```bash
pnpm --filter @grantpipe/site test -- award pricing feature
```

Expected: PASS.

Commit:

```bash
git add apps/site packages/ui/src/site
git commit -m "feat(site): market ai award intake"
```

---

## Task 7: Final Verification, Review, Merge, Cleanup, Deploy

**Files:** all touched files.

- [ ] **Step 1: Run targeted verification**

Run:

```bash
pnpm --filter @grantpipe/shared test -- document-extractions constants
pnpm --filter @grantpipe/db test -- document-extractions
pnpm --filter @grantpipe/api test -- document-extractions app
pnpm --filter @grantpipe/web test -- document-extractions grants
pnpm --filter @grantpipe/site test -- award pricing feature
turbo typecheck
turbo test:coverage --filter=@grantpipe/shared --filter=@grantpipe/db --filter=@grantpipe/api --filter=@grantpipe/web --filter=@grantpipe/site
turbo build --filter=@grantpipe/web --filter=@grantpipe/site
```

Expected: all commands pass. If a command fails, fix the issue and rerun the
failing command before continuing.

- [ ] **Step 2: Request final code review**

Dispatch a review agent with the base SHA, head SHA, spec path, plan path, and
summary of implemented work. Fix every Critical and Important issue, then rerun
affected tests.

- [ ] **Step 3: Merge to master**

Run:

```bash
git status --short
git checkout master
git pull
git merge feat/ai-award-document-intake
```

Expected: merge succeeds without overwriting unrelated user changes.

- [ ] **Step 4: Verify merged result**

Run the same targeted verification from Step 1 on `master`.

- [ ] **Step 5: Remove worktree and branch**

Run:

```bash
git worktree remove .worktrees/ai-award-document-intake
git branch -d feat/ai-award-document-intake
```

- [ ] **Step 6: Deploy affected production apps**

Run the repo deploy path:

```bash
pnpm run deploy:changed:dry-run
pnpm run deploy:changed
```

Expected: changed production targets deploy through Wrangler scripts.
