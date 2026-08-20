# Onboarding: seed-first fix + simplification — Design

**Date:** 2026-07-04
**Status:** Approved decisions captured; spec for review before planning
**Author:** Claude (Opus 4.8), directed by Angel Campa

## Problem

New users report onboarding "bouncing and crashing" when they pick the sample-data
option, and the founder wants the flow simplified. Three concrete defects, verified
by a live local reproduction (fresh trial signup) plus source review:

### P0 — Post-seed redirect bounce (the "crash")

The sample-data seed itself works. The break is a redirect conflict *after* seeding:

1. A no-card "Start your free trial" signup creates an org with `subscriptionStatus =
   "trialing"` but **`planTier = NULL` and `planSelectedAt = NULL`**
   (`apps/api/src/domains/auth/service.ts` `createOrgForUser`). Nothing outside Stripe
   checkout / `saveBillingSelection` ever sets `planSelectedAt`.
2. So `planSelectionCompleted = (planSelectedAt != null)` is **false forever** for a
   pure trial org (`apps/api/src/domains/auth/routes.ts:161`).
3. When onboarding completes and navigates to the goal's "aha" page, the plan-selection
   guard (`apps/web/src/routes/_authenticated.tsx:149-168`) fires and pushes the user to
   `/select-plan`.
4. `/select-plan` is a **pure redirect stub** — it unconditionally forwards to
   `/settings#billing` (`apps/web/src/routes/_authenticated/select-plan.tsx`).
5. `/settings` is **not** in the guard's allow-list, so the guard re-arms on the next
   pathname change. The user lands on billing settings instead of their seeded data, and
   any further navigation re-triggers the redirect — the "bouncing." The entire
   aha-routing feature is dead code for trial users.

Signups that arrive with a pre-selected plan (from the pricing page → `readPendingPlan`)
set `planSelectedAt` during the onboarding PATCH and are unaffected. Only no-card direct
trial signups hit the bounce — which is the common path.

### P1 — Onboarding is too branchy

Onboarding Step 3 ("Add your data") offers a three-way branch: sample data / import a
spreadsheet / start from scratch (`apps/web/src/routes/_authenticated/onboarding.tsx`
`StepGetData`). The founder wants **sample data to be the only path** — it is the only
way a new user sees value with zero effort. Import and manual entry remain available
*inside the app* afterward; users clear the sample data and bring their own later.

### P2 — Two sample-data banners

Two banners mount together in the app shell
(`apps/web/src/routes/_authenticated.tsx:485-486`):

- `SampleDataAhaBanner` — green/success, goal-aware "aha" copy, transient
  (localStorage-armed, dismissible), "Clear examples".
- `SampleDataBanner` — amber/warning, persistent while seeded, "Remove sample data".

The founder wants **one** banner, and prettier.

## Decisions (confirmed with founder)

1. **Trial billing gate:** Keep a plan-selection step, but make it a **real, no-card
   plan picker**. A trial does not require billing. "Pick a plan, no billing required for
   trial."
2. **Wizard shape:** Keep the goal step; collapse Step 3 to a single seed-only action
   (3 steps total: goal → org name → "Show me around").

## Design

### A. Turn `/select-plan` into a real no-card plan picker (fixes P0)

The backend already supports card-free plan selection:
`PATCH /api/org/billing/selection` (`apps/api/src/domains/org/routes.ts:827`) calls
`saveBillingSelection`, which writes `planTier` + `billingCycle` + `planSelectedAt` on the
org row with **no Stripe charge and no card** (`apps/api/src/domains/org/service.ts:1165`).
It refuses only to mutate an *active* Stripe subscription — irrelevant for a trial org.

Replace the redirect stub `SelectPlanRedirect` with a genuine screen:

- Header: reassure it's a free trial — **"No card needed. You're on a free trial."**
- The three self-serve tiers (Starter / Growth / Audit-Ready) with a monthly/annual
  toggle, using existing plan metadata/labels from `@grantpipe/shared` and reusing the
  billing tier presentation already built for `/settings#billing` where practical.
- Each plan is a pill CTA ("Start on Starter", etc. — design-canon pill geometry).
- On select: `PATCH /api/org/billing/selection` with the chosen `planTier` + cycle →
  `planSelectedAt` is set → session context refetched → `planSelectionCompleted` becomes
  true → navigate to the goal's aha route (`ahaRouteForGoal(onboardingGoal)`), reading
  `onboardingGoal` from session context.
- Preserve the existing `plan`/`cycle` search params as the initially highlighted plan
  (so pricing-page deep links still pre-select).

Because `/select-plan` now *resolves* the plan-selection condition in place (instead of
redirecting to a non-allow-listed `/settings`), the guard fires exactly once and never
re-arms. The bounce is structurally impossible.

**Flow for a fresh no-card trial signup after this change:**
signup → wizard (goal → org name → seed "Show me around") → onboarding complete →
guard sends to `/select-plan` (real picker) → pick a plan (no card) → land on the aha
page with the sample-data banner showing the seeded records. Value is visible; billing is
deferred to trial-end, where the existing paywall (`usePaywall` /
`apps/api/src/middleware/paywall.ts`) already gates expired trials and routes to checkout.

**Guard hardening (defense in depth):** keep the plan-selection guard, but make it robust
so no future stub can re-introduce a loop:
- The guard's "safe" routes already include `/select-plan` and `/confirm-plan`. Keep
  those. Do **not** add `/settings` — the picker resolves the condition rather than
  parking the user on a non-satisfying route.
- Confirm the guard only fires when `onboardingCompleted && !planSelectionCompleted` and
  the current route is not a plan-selection route (unchanged), so once `planSelectedAt` is
  set the guard is inert.

### B. Seed-only onboarding Step 3 (fixes P1)

Rewrite `StepGetData` to a single primary action:

- Copy (founder voice, third-grade reading level, passed through `humanizer` +
  `third-grade-copy`): explain we start them with example records so they can see how
  everything works, and they can clear them anytime.
- One pill button: **"Show me around"** → seeds sample data → completes onboarding
  activation → arms the aha banner → navigates to the aha route.
- Remove the "Import a spreadsheet" and "Start from scratch" branch buttons and their
  handlers. Remove the now-unused `onboardingFirstActionSelected` import/scratch
  analytics branches (keep `first_action: "sample_data"`).
- Keep the existing error surface (`seedError`) and loading state
  ("Loading examples…").

The wizard remains three steps: `welcome` (goal) → `org_setup` (org name) → `get_data`
(seed). Timezone/fiscal-year auto-detection and the goal-driven aha routing/checklist
personalization are unchanged.

Post-onboarding, import and manual entry stay reachable from the app (the `/import`
route and the empty-state CTAs already exist), so "clean up and import later" works
without any onboarding branch.

### C. One prettier sample-data banner (fixes P2)

Consolidate the two banners into a **single** component (working name
`SampleDataBanner`, replacing both `SampleDataAhaBanner` and the old
`SampleDataBanner`):

- Renders once in the app shell (single mount; delete the second mount at
  `_authenticated.tsx:485-486`).
- Visible whenever `sample-data-status.seeded === true` (persistent, authoritative —
  no reliance on transient localStorage for *visibility*).
- **First view after onboarding:** show goal-aware "aha" copy (reuse `ahaBannerCopy` /
  `readPendingAhaGoal`) — "These are your funds. We filled them with examples…". Once the
  goal marker is consumed/dismissed it settles into a calm persistent state: "You're
  exploring sample data — clear it anytime."
- One clear pill action: **"Clear sample data"** (admin/editor only, matching the API's
  `requirePermission("donors", "edit")`), plus a dismiss control for the aha emphasis.
  Viewers/auditors see the reassurance without an action.
- Design canon: warm palette, pill button geometry, generous but purposeful spacing, no
  nested boxes; a single cohesive strip rather than two stacked colored bars.
- Preserve all existing analytics: `onboardingAhaBannerViewed`,
  `onboardingAhaExamplesCleared` (aha emphasis path), and the seed/clear events owned by
  `useClearSampleData` / `useSeedSampleData`. Consolidate so each fires once.

Keep `ExploreSampleDataCta` (empty-state "Explore sample data" for orgs *without* sample
data) — it serves the opposite surface (no data yet) and is still useful after a user
clears the samples.

## Observability

- **PostHog:** No new events required; preserve the existing onboarding + sample-data
  taxonomy and ensure each fires exactly once through the simplified paths. Add a plan
  pick event on the new picker if one does not already exist (reuse
  `ANALYTICS_EVENTS.billingSelectionSaved`, already emitted server-side by the endpoint).
- **Sentry:** Seed failure and onboarding-completion failure are already captured
  (`captureAppException` in `onboarding.tsx`, `useSeedSampleData`,
  `completeOnboardingActivation`). Add failure capture for the plan-picker mutation
  (network / API error) with `feature: "onboarding"`, `operation: "plan_selection"`.

## Testing

TDD throughout; 95% per-file coverage on touched files.

- **Regression (P0):** a fresh **trialing** org (`planSelectedAt = null`) that completes
  onboarding lands on the goal's aha route after picking a plan — never parked on
  `/settings#billing`, and the guard does not re-fire. Unit-test the guard logic and the
  picker's post-select navigation.
- **`/select-plan` picker:** renders tiers, calls `PATCH /api/org/billing/selection`
  with the chosen tier/cycle, navigates to `ahaRouteForGoal(goal)` on success, surfaces
  an error on failure, respects `plan`/`cycle` search params.
- **Onboarding Step 3:** only the single "Show me around" action exists; it seeds,
  completes, arms the banner, and navigates. Removed branches are gone.
- **Consolidated banner:** single mount; aha copy on first view; persistent state after;
  role-gated clear; dismiss; analytics fire once.
- **Update existing tests + e2e helper:** `e2e/helpers/auth.ts`
  `signUpAndCompleteOnboarding` must now pick a plan on `/select-plan` before asserting
  `/app/funds`; `onboarding.test.tsx`, `_authenticated.test.tsx`, banner tests,
  `select-plan` test updated accordingly.
- **Local E2E:** re-run the fresh-signup → seed → plan-pick → app path on the local
  stack (web 3050 / api 5050) and confirm no bounce, sample data visible, single banner.

## Out of scope

- No change to trial length, paywall/expiry behavior, or Stripe checkout.
- No change to goal-driven checklist ordering or the post-onboarding checklist.
- No removal of the plan-selection guard (kept, but now satisfiable by the no-card
  picker).

## Key files

- `apps/web/src/routes/_authenticated/select-plan.tsx` (stub → real picker)
- `apps/web/src/routes/_authenticated/onboarding.tsx` (`StepGetData` → seed-only)
- `apps/web/src/routes/_authenticated.tsx` (single banner mount; guard verified)
- `apps/web/src/components/onboarding/sample-data-aha-banner.tsx` +
  `apps/web/src/components/sample-data-banner.tsx` → merged into one
- `apps/web/src/lib/aha-banner.ts`, `onboarding-goal.ts` (reused)
- API: `PATCH /api/org/billing/selection` (reused, no change),
  `apps/api/src/domains/org/service.ts` `saveBillingSelection` (reused)
