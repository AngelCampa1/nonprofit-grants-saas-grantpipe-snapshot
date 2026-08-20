# GrantPipe System Integration Bug Hunt

**Date:** 2026-07-11  
**Branch:** `bughunt/system-integration-20260711`  
**Worktree:** `.worktrees/system-integration-bughunt`

## Goal

Sweep GrantPipe from component boundaries outward through application, database,
queue, provider, and production boundaries. Reproduce and fix every confirmed
P0-P2 defect, then repeat independent review and verification cycles until two
consecutive cycles find no new reproducible P0-P2 defects.

This is not complete when unit tests pass. Completion requires coherent test
inventory, cross-module behavior, production proof for changed runtime
boundaries, cleanup proof for live test data, independent review, merge to
`master`, worktree removal, deployment of affected apps, and post-deploy checks.

## Evidence Model

Each finding must be recorded in
`docs/bugs/2026-07-11-system-integration-bug-hunt-ledger.md` with:

1. severity and affected boundary;
2. exact reproduction or contradiction;
3. a failing regression test before implementation;
4. the smallest root-cause fix, including PostHog/Sentry coverage where the
   changed user-facing capability needs it;
5. targeted and broad verification results;
6. production proof when a deployed boundary changed;
7. cleanup evidence for any live data created.

Hypotheses do not count as bugs until reproduced. A green mocked unit test does
not prove a provider, queue, database, route, or cache integration.

## Current Baseline

- `master` was pulled before work and was clean at `c7c0a886`, two commits ahead
  of `origin/master`.
- The isolated branch starts at the same commit.
- The repository has 11 primary Playwright specs and 34 production stress
  scripts, but they are not represented by one authoritative inventory.
- `pnpm test` is not a reliable baseline: concurrent web/UI Vitest pools ended
  with `ERR_IPC_CHANNEL_CLOSED` on 2026-07-11.
- `playwright.config.ts` currently discovers production-only specs during the
  nominal local run.
- `playwright.prod-full.config.ts` currently selects only five spec files, so
  its name overstates its coverage.
- The web router owns `/app`, while multiple marketing, email, portal, and UI
  links target root paths such as `/signup`, `/login`, and `/portal/...`.
- QuickBooks product truth is contradictory: mounted API/UI routes report the
  integration retired, while dormant service/queue code, documentation,
  entitlement labels, and a production stress script still describe it as
  active. No accounting queue binding or worker dispatch exists on `master`.

## Sweep Map

### Cycle 1 - Harness and canonical route truth

- Separate local, public-production, authenticated-production, helper, and
  destructive stress inventories.
- Add membership contracts so a spec cannot silently enter or leave a gate.
- Make local E2E incapable of selecting production-only tests.
- Replace the misleading `prod:full` boundary with an explicit maintained
  inventory or rename it to match its scope.
- Make `/app` the single canonical authenticated UI base across shared
  marketing knowledge, site CTAs, API-generated emails/portal links, and web
  link-buttons. Preserve root `/api` endpoints.
- Re-run targeted contract tests, typecheck, unit tests serially, and local
  browser routing checks.

### Cycle 2 - Auth, org, entity, billing, and role boundaries

- Test Admin, Editor, Viewer, and Auditor navigation and API enforcement.
- Test two-org/two-entity switching for response and TanStack Query isolation.
- Test invite acceptance for logged-out, wrong-account, expired, reused, and
  revoked cases.
- Test removal of a member with an already-open session.
- Test checkout, signed webhook replay, subscription state, and entitlement
  readback. Reproduce the suspected checkout idempotency-key aliasing between
  distinct attempts.

### Cycle 3 - Web/API contracts and cross-domain derived state

- Compare mounted Hono routes with raw-fetch and RPC client paths.
- Exercise writes through real route handlers and verify dependent cache
  invalidation and derived summaries.
- Cover donation to ledger/dashboard, restriction release to rollforward,
  expense to grant spend-down/report, and team role to nav/route/API.
- Inject 401, 402, 403, 409, 429, timeout, and 500 responses at representative
  component boundaries and verify recovery behavior.

### Cycle 4 - Database and migration truth

- Apply every migration to a fresh Postgres database and run API integration
  checks against it.
- Compare schema, migration journal, and production `information_schema`.
- Exercise FK-sensitive soft-delete and sample-data cleanup workflows.
- Add concurrency/replay checks for imports, reports, webhooks, and scheduled
  claims.

### Cycle 5 - Queues, cron, email, storage, and AI

- Route queue messages through the Worker handler, not direct service calls.
- Reproduce award-intake queue acceptance followed by usage-write failure.
- Reproduce trial-email and donor-mail-merge provider success followed by
  persistence failure.
- Prove at-least-once safety, idempotency, poison-message isolation, and cron
  independence.
- Exercise R2 rollback, Resend sandbox/unsubscribe, and OpenRouter malformed,
  timeout, retry, and cleanup paths.

### Cycle 6 - External systems and public boundaries

- Reconcile QuickBooks as either fully retired or fully deployable before any
  dormant code is activated.
- Exercise Sequencer lead handoff, CRM feedback allowlist/ingest, AI-SDR,
  Turnstile valid/invalid behavior, PostHog ingestion, and Sentry release tags.
- Reproduce the suspected non-atomic KV rate-limit boundary under concurrency.
- Require production Turnstile to fail closed when its secret is missing.

### Cycle 7 - External-reviewer portal

- Run emailed link to token exchange, scoped routes, downloads, logout, expiry,
  rotation, and revocation in a real browser.
- Test wrong entity type/ID and query-token/cookie transitions.
- Verify portal tokens are absent from analytics and Sentry payloads.
- Cover mobile, keyboard, loading, empty, and failure states.

### Cycle 8 - Component, visual, and resilience sweep

- Sweep every maintained route at desktop, tablet, and mobile widths.
- Capture console errors, failed requests, overflow, focus order, and keyboard
  behavior.
- Exercise every dialog and destructive confirmation.
- Inspect shared component integration, route code splitting, error boundaries,
  loading states, and stale-data behavior.

## Per-Finding Workflow

1. Reproduce on the current worktree.
2. Write and run the failing test.
3. Implement the minimal root-cause fix.
4. Run the test until green and refactor without weakening it.
5. Prove 95% per-file coverage for every touched source file.
6. Run package typecheck, lint, and affected tests.
7. Run the relevant real integration/browser/provider check.
8. Obtain independent review and fix every finding.
9. Record exact evidence in the ledger.

## Cycle Exit Gate

A cycle exits only when:

- all confirmed findings in its scope are fixed or explicitly contradicted by
  stronger evidence;
- targeted tests, coverage, typecheck, lint, and relevant browser checks pass;
- the ledger has reproduction, fix, review, and verification evidence;
- no live-test data remains outside the permanent reusable E2E fixture.

## Final Stop Rule

After all eight cycles, dispatch fresh independent reviewers across different
boundaries. Run their reproductions and the authoritative full local suite.
Repeat review/fix cycles until two consecutive independent cycles produce no
new reproducible P0-P2 finding. Then run the guarded production suite and
stress inventory, verify PostHog/Sentry and cleanup state, review the full diff,
merge to `master`, remove the worktree, deploy affected apps through Wrangler,
and repeat the production smoke checks.
