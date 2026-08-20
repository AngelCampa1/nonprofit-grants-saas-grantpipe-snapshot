# Wave 0 Trial Lifecycle States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Wave 0.2 explicit by proving new signups always receive a trial end date and by exposing a canonical lifecycle state of `trialing`, `expired`, `active`, or `past_due` across shared code, API session context, billing summary, and web session typing.

**Architecture:** Keep Stripe webhook normalization conservative while adding `expired` as a first-class app lifecycle status. Shared code derives the lifecycle state from `subscriptionStatus` plus `trialEndsAt`; the trial-expiry worker persists `subscriptionStatus: "expired"` after it emits the privacy-safe `trial_expired` event. Session and billing APIs expose `billingLifecycleState` so web, sequencer, and messaging work can depend on one stable contract.

**Tech Stack:** TypeScript, Vitest, Hono, TanStack Query, Drizzle-backed org rows, shared `@grantpipe/shared` helpers.

---

## Files

- Modify: `packages/shared/src/utils/paywall.ts`
- Modify: `packages/shared/src/utils/paywall.test.ts`
- Modify: `packages/shared/src/constants/index.ts`
- Modify: `packages/shared/src/utils/index.ts`
- Modify: `apps/api/src/domains/trial-emails/trial-expiry.ts`
- Modify: `apps/api/src/domains/trial-emails/trial-expiry.test.ts`
- Modify: `apps/api/src/domains/auth/routes.ts`
- Modify: `apps/api/src/domains/auth/routes.test.ts`
- Modify: `apps/api/src/domains/org/service.ts`
- Modify: `apps/api/src/domains/org/service.test.ts`
- Modify: `apps/web/src/hooks/use-session.ts`
- Modify: `apps/web/src/hooks/use-session.test.ts`
- Modify: `docs/offers/MASTER-BUILD-ROADMAP.md`
- Modify: `docs/offers/ROADMAP-EXECUTION-LEDGER.md`

## Task 1: Shared Lifecycle Helper

**Files:**

- Modify: `packages/shared/src/utils/paywall.ts`
- Modify: `packages/shared/src/utils/paywall.test.ts`
- Modify: `packages/shared/src/utils/index.ts`

- [x] **Step 1: Write the failing shared tests**

Add tests that assert:

```ts
expect(
  billingLifecycleState(
    { subscriptionStatus: "trialing", trialEndsAt: "2026-04-12T00:00:00.000Z" },
    NOW,
  ),
).toBe("expired");
expect(
  billingLifecycleState(
    { subscriptionStatus: "trialing", trialEndsAt: "2026-04-20T00:00:00.000Z" },
    NOW,
  ),
).toBe("trialing");
expect(billingLifecycleState({ subscriptionStatus: "active", trialEndsAt: null }, NOW)).toBe(
  "active",
);
expect(billingLifecycleState({ subscriptionStatus: "past_due", trialEndsAt: null }, NOW)).toBe(
  "past_due",
);
```

- [x] **Step 2: Run the red test**

Run: `pnpm --filter @grantpipe/shared test -- src/utils/paywall.test.ts`

Expected: FAIL because `billingLifecycleState` does not exist.

- [x] **Step 3: Implement the helper**

Add:

```ts
export type BillingLifecycleState = "trialing" | "expired" | "active" | "past_due";

export function billingLifecycleState(
  org: Pick<PaywallOrgState, "subscriptionStatus" | "trialEndsAt">,
  now: Date = new Date(),
): BillingLifecycleState {
  if (org.subscriptionStatus === "active") return "active";
  if (org.subscriptionStatus === "past_due") return "past_due";
  if (isTrialActive({ ...org, subscriptionStatus: "trialing" }, now)) return "trialing";
  return "expired";
}
```

Also export it from `packages/shared/src/utils/index.ts` and add `expired` to the shared subscription-status constants so persisted org lifecycle rows validate consistently.

- [x] **Step 4: Run the green shared test**

Run: `pnpm --filter @grantpipe/shared test -- src/utils/paywall.test.ts`

Expected: PASS.

## Task 2: Trial Expiry Persistence and Analytics Contract

**Files:**

- Modify: `apps/api/src/domains/trial-emails/trial-expiry.ts`
- Modify: `apps/api/src/domains/trial-emails/trial-expiry.test.ts`

- [x] **Step 1: Write failing trial-expiry tests**

Assert that the expiry worker emits `trial_expired`, persists
`subscriptionStatus: "expired"`, stores `trialExpiredEventAt`, includes only
privacy-safe analytics fields, and captures update failures without retrying the
same org in the same tick.

- [x] **Step 2: Run the red trial-expiry tests**

Run: `pnpm --filter @grantpipe/api test -- src/domains/trial-emails/trial-expiry.test.ts`

Expected: FAIL before implementation because status persistence, analytics
transition fields, and update failure capture are absent.

- [x] **Step 3: Persist app lifecycle expiry**

After successful analytics emission, update the org row with
`subscriptionStatus: "expired"`, `trialExpiredEventAt`, and `updatedAt`.
Capture update errors through `captureBackgroundException` with the
`trial-expiry` feature tag.

- [x] **Step 4: Run the green trial-expiry tests**

Run: `pnpm --filter @grantpipe/api test -- src/domains/trial-emails/trial-expiry.test.ts`

Expected: PASS.

## Task 3: API Session Lifecycle Contract

**Files:**

- Modify: `apps/api/src/domains/auth/routes.ts`
- Modify: `apps/api/src/domains/auth/routes.test.ts`

- [x] **Step 1: Write failing API session tests**

Add assertions that `/auth/session` includes `billingLifecycleState`:

```ts
expect(body.orgSubscription).toMatchObject({
  subscriptionStatus: "trialing",
  billingLifecycleState: "expired",
});
```

Use `trialEndsAt: new Date("2000-01-01T00:00:00.000Z")` for the expired trial case.

- [x] **Step 2: Run the red API session test**

Run: `pnpm --filter @grantpipe/api test -- src/domains/auth/routes.test.ts`

Expected: FAIL because `billingLifecycleState` is absent.

- [x] **Step 3: Expose derived lifecycle state**

Import `billingLifecycleState` from `@grantpipe/shared` and include:

```ts
billingLifecycleState: billingLifecycleState({
  subscriptionStatus: normalizedStatus,
  trialEndsAt: orgSubscription.trialEndsAt ?? null,
}),
```

Preserve the normalized persisted `subscriptionStatus` while adding the derived
`billingLifecycleState`.

- [x] **Step 4: Run the green API session test**

Run: `pnpm --filter @grantpipe/api test -- src/domains/auth/routes.test.ts`

Expected: PASS.

## Task 4: Billing Summary Lifecycle Contract

**Files:**

- Modify: `apps/api/src/domains/org/service.ts`
- Modify: `apps/api/src/domains/org/service.test.ts`

- [x] **Step 1: Write failing billing summary service test**

Mock `getIntegrations(...).billing.getSummary` to return a trialing summary with a past `trialEndsAt`. Assert `getOrgBillingSummary` returns `billingLifecycleState: "expired"` while preserving the original `status: "trialing"`.

- [x] **Step 2: Run the red service test**

Run: `pnpm --filter @grantpipe/api test -- src/domains/org/service.test.ts`

Expected: FAIL because the returned summary has no lifecycle state.

- [x] **Step 3: Add derived field in service**

Wrap the summary:

```ts
const summary = await getIntegrations(db, bindings).billing.getSummary(params.orgId);
return {
  ...summary,
  billingLifecycleState: billingLifecycleState({
    subscriptionStatus: summary.status,
    trialEndsAt: summary.trialEndsAt ?? null,
  }),
};
```

- [x] **Step 4: Run the green service test**

Run: `pnpm --filter @grantpipe/api test -- src/domains/org/service.test.ts`

Expected: PASS.

## Task 5: Web Session Typing and Tests

**Files:**

- Modify: `apps/web/src/hooks/use-session.ts`
- Modify: `apps/web/src/hooks/use-session.test.ts`

- [x] **Step 1: Write failing web hook test**

Update the mocked `/auth/session` response and expected returned `orgSubscription` shape to include:

```ts
billingLifecycleState: "expired",
```

- [x] **Step 2: Run the red web test**

Run: `pnpm --filter @grantpipe/web test -- src/hooks/use-session.test.ts`

Expected: FAIL because the type does not carry the new field.

- [x] **Step 3: Add the type field**

Add `billingLifecycleState: "trialing" | "expired" | "active" | "past_due";` to the session hook type.

- [x] **Step 4: Run the green web test**

Run: `pnpm --filter @grantpipe/web test -- src/hooks/use-session.test.ts`

Expected: PASS.

## Task 6: Roadmap Evidence

**Files:**

- Modify: `docs/offers/MASTER-BUILD-ROADMAP.md`
- Modify: `docs/offers/ROADMAP-EXECUTION-LEDGER.md`

- [ ] **Step 1: Update evidence**

Mark 0.1 as completed with the merge/deploy evidence from `305519b7`. Mark
0.2 as complete only after Tasks 1-5 pass and state that `expired` is an app
lifecycle status persisted by the expiry worker, with `billingLifecycleState`
also derived for read paths.

- [ ] **Step 2: Run docs formatting check**

Run: `pnpm exec prettier --check docs/offers/MASTER-BUILD-ROADMAP.md docs/offers/ROADMAP-EXECUTION-LEDGER.md docs/superpowers/plans/2026-06-24-wave0-trial-lifecycle-states.md`

Expected: PASS.

## Final Verification

Run:

```bash
pnpm --filter @grantpipe/shared test:coverage
pnpm --filter @grantpipe/api test:coverage
pnpm --filter @grantpipe/web test -- src/hooks/use-session.test.ts src/hooks/use-paywall.test.ts
pnpm --filter @grantpipe/web typecheck
```

Expected: all pass. Deploy affected API/web after merge.
