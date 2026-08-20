# GrantPipe Onboarding — Activation-First Redesign

**Date:** 2026-06-19
**Status:** Approved (scope + sample-data confirmed by founder)
**Author:** Claude (Opus 4.8), sub-agent driven

## Problem

The current onboarding is mechanical and bland. A new user moves through a 4-step
wizard (`apps/web/src/routes/_authenticated/onboarding.tsx`) that:

1. Shows a static welcome with three bullet points.
2. Collects org name, fiscal year start month, timezone (a form).
3. Offers "Open Migration Studio" or "Skip".
4. Asks them to pick a section to visit (`/donors`, `/grants`, `/funds`, `/dashboard`).

It then drops them on the dashboard with a 5-item checklist
(`onboarding-checklist.tsx`) and, later, a floating 30-day overlay
(`onboarding-overlay.tsx`).

The flow never delivers a moment of value. It asks for configuration, then hands
the user an empty product. For our audience — Executive Directors and Development
Directors, time-poor, non-technical, **burned by Salesforce/Blackbaud**, whose
emotional goal is _confidence and control_ — an empty product after a form reads
as "here we go again." There is no "aha", no personalization, and no safe way to
see the product working before trusting it with real donor data.

## Goal

Redesign onboarding around **activation**, not configuration. Get the user to a
felt moment of value — _"I can see my funds reconcile / my compliance status is
clear"_ — fast, and make every surface warm, personalized, skippable, and free of
blank screens. This is an **elevation** of the existing surfaces, reusing the
infrastructure already in place (`organizations.onboardingCompleted`,
`userGuideProgress`, the PostHog activation taxonomy, the `TeachAndActEmptyState`
primitive).

### Activation metric (the thing we design toward)

- **Primary:** `% of new orgs that reach a "first reconciled value view"` — a
  restricted-fund balance screen or a compliance/report view rendering real or
  sample data — within their first session. Instrument as a distinct
  `activation_first_value_viewed` event.
- **Secondary:** `% of orgs with ≥1 real or sample record within 24h` (data-in is
  the gate to everything).

## Non-Goals

- Rebuilding the CSV importer ("Migration Studio") — it already exists at
  `/import`. We link to it and improve the framing, not its internals.
- Changing auth/signup mechanics. Signup still lands on `/onboarding`.
- Dark mode, mobile-app onboarding, or in-product video production.
- A general-purpose product-tour engine. We use contextual, state-triggered
  guidance only.

## Design

Five workstreams, each independently shippable, built in priority order.

### 1. Role-branched welcome wizard (replace steps 1–4)

A warmer, shorter, **one-decision-per-screen** wizard. New shape:

- **Step 1 — Welcome + "what brings you here?"** A warm, personalized greeting
  ("Welcome, {firstName}.") and **one** branching question: primary goal.
  Three options mapped to a persisted `onboardingGoal`:
  - `donors` — "Manage donors and gifts"
  - `grants` — "Track grants and restricted funds"
  - `compliance` — "Stay audit-ready"
    This single choice reshapes the checklist and the post-wizard landing. No more
    than this one segmentation input (research: >2 inputs here bleeds drop-off).
- **Step 2 — Org basics.** Keep the existing org name + fiscal year + timezone
  form (it is the genuinely-cannot-default set), but reframed and visually
  warmer. This still calls `PATCH /api/onboarding` and marks
  `onboardingCompleted`. Extend the endpoint to also persist `onboardingGoal`.
- **Step 3 — Get data in (two doors, both skippable).**
  - **"Import my spreadsheet"** → `/import` (existing Migration Studio).
  - **"Explore with sample data first"** → seeds sample data (workstream 4),
    then routes the user into the **value moment** for their chosen goal.
  - **"I'll start from scratch"** (skip) → routes to the relevant empty section.

Rules: every step skippable with an explicit "Do this later"; a thin progress
indicator; back navigation preserved; set the time expectation ("about 2
minutes"). All existing onboarding PostHog events preserved; new events added for
goal selection and the sample-data door. Pill buttons throughout (design canon).

### 2. The "first value" moment (the aha)

After the wizard, route by goal to a screen that _shows the product working_:

- `grants`/`compliance` → the restricted funds / fund-balance view, or the
  compliance status view, scrolled to a reconciled balance.
- `donors` → the donor dashboard with giving metrics populated.

When that screen renders with at least one record (real or sample), fire
`activation_first_value_viewed` exactly once per org (guarded via
`userGuideProgress` or a localStorage+server flag so it is not double-counted).
Render **one** restrained, dismissible micro-celebration (no confetti barrage) —
e.g. a calm "Your funds are reconciling" affirmation banner with an off path.

### 3. Role-aware dashboard checklist (rework `onboarding-checklist.tsx`)

- Branch the 5 items by `onboardingGoal` (compliance-first vs donor-first
  ordering), not just by role.
- First item completable in <30s (endowed-progress effect).
- Add a **visible progress bar** with checkmarks (today it only shows "X of Y").
- Frame each item as a benefit/outcome, not a feature ("Add your first grant to
  start tracking its compliance deadlines").
- Ensure at least one item _is_ the aha moment and is celebrated on completion.
- Keep existing persistence (`userGuideProgress`, org/user scoping), collapse-to-
  pill, dismiss-all, auto-hide at 100%, and the data-derived auto-completion
  rules. Add a calm "you're all set — here's what's next" hand-off at 100% so the
  surface never dead-ends.

### 4. Sample-data explore mode (new capability)

Let a cautious org explore a fully-working GrantPipe before importing real donor
records, then remove it in one click.

- **Tagging without 15 schema changes:** add a single ledger table
  `sample_data_records (org_id, entity_table, entity_id, created_at)`. The seeder
  records every inserted row's `(table, id)` here inside a transaction. Clearing
  hard-deletes by the ledger in FK-safe order, then clears the ledger. This keeps
  removal precise and auditable and avoids touching every entity table.
- **Seeder service** (`apps/api/src/domains/sample-data/`): an org-scoped,
  authenticated port of the realistic content in `packages/db/src/seed-demo.ts`
  (senior-care nonprofit: funders, funds, grants, allocations, expenses,
  reporting requirements, contacts, donations, restriction lifecycle). It seeds
  **into the caller's current org** (never a hardcoded local DB), and every
  human-visible record name is prefixed/suffixed so it is unmistakably sample
  data (e.g. names carry a `[Sample]` marker where shown). Admin/editor only.
- **Endpoints:**
  - `POST /api/sample-data` — seed (idempotent: refuses if already seeded or if
    the org already has real data beyond a small threshold, to avoid clobbering).
  - `DELETE /api/sample-data` — one-click clear by ledger.
  - `GET /api/sample-data/status` — `{ seeded: boolean, recordCount: number }`.
- **UI:** the wizard "Explore with sample data" door; a persistent, impossible-to-
  miss **"You're exploring sample data — Remove it"** banner shown app-wide while
  sample data exists (so it is always clearable before real import); a confirm
  dialog on clear.
- **Guardrails:** seeding and clearing run in transactions; clear is idempotent;
  refuse to seed when real data is present; everything scoped by `org_id`.

### 5. Teaching empty states (every zero-data entity screen)

Replace bland/blank zero-data views on Donors, Grants, Funds, Reports (and
custom fields) with the existing `TeachAndActEmptyState` primitive:

1. Instructive, warm copy ("Start by adding your first grant").
2. A simple branded icon (no charity stock imagery).
3. A primary CTA ("Add your first grant") + secondary ("Explore with sample
   data") wired to workstream 4.

Audit each list route for its current empty state and upgrade in place.

## Data / Schema Changes

- `organizations.onboardingGoal` — nullable enum/text (`donors` | `grants` |
  `compliance`). Migration via `pnpm --filter @grantpipe/db generate`.
- New table `sample_data_records` (ledger) — `id`, `orgId`, `entityTable`,
  `entityId`, `createdAt`, indexed by `orgId`.
- New `GuideKey`/activation flags as needed for the aha guard (reuse
  `userGuideProgress` rather than new tables where possible).
- Shared validators in `packages/shared`: extend `onboardingSchema` with optional
  `onboardingGoal`; add sample-data request/response schemas.

## Observability (required — this is a feature)

- **PostHog:** `onboarding_goal_selected`, `onboarding_sample_data_chosen`,
  `sample_data_seeded`, `sample_data_cleared`, `activation_first_value_viewed`,
  plus all existing onboarding/activation events preserved. Privacy-safe: no
  donor/funder names, no financial detail — counts and enum choices only.
- **Sentry:** capture failures in the sample-data seed/clear pipeline (the
  highest-risk new surface), the onboarding PATCH, and checklist mutations, using
  existing `captureBackgroundException`/service-boundary helpers and feature tags.
- **Tests:** prove the analytics + Sentry hooks fire on the success and failure
  paths for the seeder/clear and the goal-selection path, or document shared-
  wrapper coverage.

## Testing Strategy (TDD, 95% per touched file)

- **Shared:** validator tests for `onboardingGoal` and sample-data schemas.
- **API:** service + route tests for seed (idempotency, real-data refusal, ledger
  population, transaction rollback on failure), clear (FK-safe deletion by
  ledger, idempotency), status; onboarding PATCH with goal; analytics/Sentry
  assertions.
- **DB:** ledger table + `onboardingGoal` column declarations covered by existing
  schema test patterns; any utility functions at 95%.
- **Web:** wizard step logic (branching, skip, events), checklist branching +
  progress bar, sample-data banner visibility, empty-state upgrades. RTL +
  vitest.
- **Verify:** local stack run-through of the full flow (signup → wizard → sample
  data → aha → checklist → clear sample data → import), screenshot proof.

## Rollout

Worktree under `.worktrees/`, sub-agent driven (smallest capable model per task),
TDD throughout. Review via the permitted review path, fix all findings, merge to
`master`, remove worktree, deploy `grantpipe-api` + `grantpipe-web` (+ `site` only
if touched) via Wrangler. Multiple review/fix cycles until nothing remains.

## Risks / Mitigations

- **Sample-data clobbering real data** → refuse seed when real data present;
  ledger-precise clear; transactions; idempotency.
- **Aha event double-counting** → one-time guard per org.
- **Scope creep into the importer** → explicitly out of scope; link only.
- **Coverage gate cost** (touching `packages/shared` runs full api+web+ui
  coverage) → batch shared changes; expect long pre-commit; poll, don't idle.
