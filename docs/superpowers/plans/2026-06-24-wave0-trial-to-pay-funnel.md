# Wave 0 Trial-to-Pay Funnel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build roadmap items 0.1 and 0.2 into one working conversion path: every new org has a real trial clock, expired trials hit a plan wall, admins can start Stripe Checkout from the wall and feature gates, and the path has privacy-safe analytics plus Sentry failure capture.

**Architecture:** Reuse the current primitives instead of inventing a parallel billing system. `createOrgForUser()` already sets `trialStartedAt` and `trialEndsAt`; `paywallState()` already derives expired-trial blocks; `createBillingCheckoutSession()` already creates Stripe Checkout through the billing integration. This plan adds the missing shared copy, direct checkout-start UI, failure observability, and route tests that prove the funnel is no longer a dead end.

**Tech Stack:** TypeScript, React 19, TanStack Router/Query, Hono, Drizzle, Stripe Checkout integration, Vitest, Testing Library, PostHog helper events, Sentry helpers.

---

## Current Evidence

- `apps/api/src/domains/auth/service.ts` sets `subscription_status = "trialing"`, `trial_started_at`, and `trial_ends_at` when a normal signup creates an org.
- `packages/shared/src/utils/paywall.ts` blocks `subscriptionStatus === "trialing"` once `trialEndsAt` is not in the future.
- `apps/web/src/routes/_authenticated.tsx` renders the expired-trial screen, but its admin CTA only links to `/settings#billing`.
- `apps/api/src/domains/org/routes.ts` exposes `POST /org/billing/checkout` and captures `checkout_started` after `createBillingCheckoutSession()` succeeds.
- `apps/api/src/domains/org/service.ts` already blocks active subscription changes from checkout and delegates new checkout sessions to `getIntegrations(db, bindings).billing.createCheckoutSession()`.
- `apps/web/src/components/settings-billing-panel.tsx` can start checkout from the settings billing panel.

## Scope

Included:

- Expired-trial wall copy and CTA.
- Admin checkout-start action from the paywall screen.
- A reusable web mutation for billing checkout so settings, paywall, and later feature gates share behavior.
- API-side failure analytics/Sentry for checkout start failures.
- Trial-start invariant tests to prove signup always sets `trialEndsAt`.
- Copy gate evidence for the customer-facing wall copy.

Excluded from this slice:

- Multi-entity architecture.
- Migration Studio.
- New pricing tiers or Federal SKU.
- Live outbound email sends, live social publishing, and paid-ad launch actions.

## Files

- Modify: `apps/api/src/domains/auth/service.test.ts`
- Modify: `apps/api/src/domains/org/routes.ts`
- Modify: `apps/api/src/domains/org/routes.expanded.test.ts`
- Modify: `apps/api/src/domains/org/service.test.ts`
- Modify: `apps/web/src/hooks/use-org-settings.ts`
- Modify: `apps/web/src/hooks/use-org-settings.test.ts`
- Modify: `apps/web/src/routes/_authenticated.tsx`
- Modify: `apps/web/src/routes/_authenticated.test.tsx`
- Modify: `apps/web/src/components/settings-billing-panel.tsx`
- Modify: `apps/web/src/components/settings-billing-panel.test.tsx`
- Create: `apps/web/src/lib/billing-checkout-copy.ts`
- Create: `apps/web/src/lib/billing-checkout-copy.test.ts`
- Modify: `packages/shared/src/constants/analytics.ts`
- Modify: `packages/shared/src/constants/analytics.test.ts`
- Create: `docs/offers/copy-gates/wave0-trial-to-pay-copy-gate.md`

---

### Task 1: Lock The Trial Clock Invariant

**Files:**

- Modify: `apps/api/src/domains/auth/service.test.ts`
- Verify existing implementation in: `apps/api/src/domains/auth/service.ts`

- [ ] **Step 1: Write the failing invariant test**

Add a test near the existing `createOrgForUser` tests:

```ts
it("always creates a trialing org with a future trialEndsAt", async () => {
  vi.setSystemTime(new Date("2026-06-24T15:00:00.000Z"));
  const { db, inserts } = buildCreateOrgDb({
    createdOrg: {
      id: "org-1",
      name: "Angel's Organization",
      slug: "angel-org-123",
      subscriptionStatus: "trialing",
      trialStartedAt: new Date("2026-06-24T15:00:00.000Z"),
      trialEndsAt: new Date("2026-07-24T15:00:00.000Z"),
    },
  });

  const result = await createOrgForUser(db as never, {
    userId: "user-1",
    userName: "Angel",
  });

  expect(result.subscriptionStatus).toBe("trialing");
  expect(result.trialEndsAt).toEqual(new Date("2026-07-24T15:00:00.000Z"));
  expect(inserts.organizations[0]).toMatchObject({
    subscriptionStatus: "trialing",
    trialStartedAt: new Date("2026-06-24T15:00:00.000Z"),
    trialEndsAt: new Date("2026-07-24T15:00:00.000Z"),
  });
});
```

- [ ] **Step 2: Run the focused test and confirm red or existing green**

Run:

```bash
pnpm --filter @grantpipe/api test -- src/domains/auth/service.test.ts
```

Expected if the invariant is already covered by implementation: PASS. If the helper test fixture does not expose the inserted org, update only the fixture until the test proves the insert payload.

- [ ] **Step 3: Implement only if red for the real invariant**

If the test proves `trialEndsAt` can be omitted, update `createOrgForUser()` so it always inserts:

```ts
const trialStartedAt = new Date();
const trialEndsAt = new Date(trialStartedAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
```

and includes both values in the SQL insert.

- [ ] **Step 4: Run the focused test again**

Run:

```bash
pnpm --filter @grantpipe/api test -- src/domains/auth/service.test.ts
```

Expected: PASS with the trial invariant covered.

### Task 2: Add Shared Paywall Copy

**Files:**

- Create: `apps/web/src/lib/billing-checkout-copy.ts`
- Create: `apps/web/src/lib/billing-checkout-copy.test.ts`

- [ ] **Step 1: Write the failing copy test**

```ts
import { describe, expect, it } from "vitest";
import { getBlockedBillingCopy } from "./billing-checkout-copy";

describe("getBlockedBillingCopy", () => {
  it("uses data-retention copy for expired trials", () => {
    expect(getBlockedBillingCopy("trial_expired", "admin")).toEqual({
      title: "Pick a plan to keep your data",
      body: "Your free trial ended. Choose a plan to keep using GrantPipe with the records you already set up.",
      primaryCta: "See plans",
      secondaryCta: "Sign out",
    });
  });

  it("routes non-admins to an admin without offering checkout", () => {
    expect(getBlockedBillingCopy("trial_expired", "viewer").primaryCta).toBeNull();
    expect(getBlockedBillingCopy("trial_expired", "viewer").body).toContain("Ask an admin");
  });
});
```

- [ ] **Step 2: Run the test and confirm red**

Run:

```bash
pnpm --filter @grantpipe/web test -- src/lib/billing-checkout-copy.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the copy helper**

```ts
import type { Role } from "@grantpipe/shared";
import type { PaywallReason } from "@grantpipe/shared";

type BlockedBillingRole = Role | null;

export type BlockedBillingCopy = {
  title: string;
  body: string;
  primaryCta: string | null;
  secondaryCta: "Sign out";
};

export function getBlockedBillingCopy(
  reason: PaywallReason,
  role: BlockedBillingRole,
): BlockedBillingCopy {
  const admin = role === "admin";
  if (reason === "trial_expired") {
    return {
      title: "Pick a plan to keep your data",
      body: admin
        ? "Your free trial ended. Choose a plan to keep using GrantPipe with the records you already set up."
        : "Your free trial ended. Ask an admin to choose a plan so your team can keep using GrantPipe.",
      primaryCta: admin ? "See plans" : null,
      secondaryCta: "Sign out",
    };
  }
  return {
    title: "Billing action required",
    body: admin
      ? "Add billing to get back in."
      : "Ask an admin to add billing so your team can get back in.",
    primaryCta: admin ? "Add billing" : null,
    secondaryCta: "Sign out",
  };
}
```

- [ ] **Step 4: Run the copy test**

Run:

```bash
pnpm --filter @grantpipe/web test -- src/lib/billing-checkout-copy.test.ts
```

Expected: PASS.

### Task 3: Share Checkout Mutation Behavior

**Files:**

- Modify: `apps/web/src/hooks/use-org-settings.ts`
- Modify: `apps/web/src/hooks/use-org-settings.test.ts`

- [ ] **Step 1: Write the failing hook test**

Add a test proving the checkout mutation posts the chosen plan, cycle, promo, and surface:

```ts
it("starts billing checkout with plan, cycle, promo, and surface", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    jsonResponse({
      url: "https://checkout.stripe.com/c/session",
    }),
  );
  vi.stubGlobal("fetch", fetchMock);

  const { result } = renderHook(() => useBillingCheckoutMutation(), {
    wrapper: createQueryClientWrapper(),
  });

  await result.current.mutateAsync({
    planTier: "growth",
    billingCycle: "annual",
    promoCode: "Y80OFF",
    surface: "paywall",
  });

  expect(fetchMock).toHaveBeenCalledWith(
    "/api/org/billing/checkout",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        planTier: "growth",
        billingCycle: "annual",
        promoCode: "Y80OFF",
        surface: "paywall",
      }),
    }),
  );
});
```

- [ ] **Step 2: Run the hook test and confirm red**

Run:

```bash
pnpm --filter @grantpipe/web test -- src/hooks/use-org-settings.test.ts
```

Expected: FAIL because `surface` is not accepted or the mutation is not exported.

- [ ] **Step 3: Implement the shared mutation**

Extend the checkout input type in `use-org-settings.ts`:

```ts
type BillingCheckoutSurface = "settings" | "paywall" | "feature_gate";

type BillingCheckoutInput = {
  planTier: SelfServePlanTier;
  billingCycle: BillingCycle;
  promoCode?: string;
  surface?: BillingCheckoutSurface;
};
```

Export `useBillingCheckoutMutation()` if it is currently local to the settings panel. Its mutation function must POST to `/api/org/billing/checkout` and return `{ url: string }`.

- [ ] **Step 4: Run the hook test**

Run:

```bash
pnpm --filter @grantpipe/web test -- src/hooks/use-org-settings.test.ts
```

Expected: PASS.

### Task 4: Record Checkout Surface And Failures On The API

**Files:**

- Modify: `packages/shared/src/constants/analytics.ts`
- Modify: `packages/shared/src/constants/analytics.test.ts`
- Modify: `apps/api/src/domains/org/routes.ts`
- Modify: `apps/api/src/domains/org/routes.expanded.test.ts`

- [ ] **Step 1: Write the analytics constant test**

```ts
it("exposes checkout failure analytics for trial-to-pay recovery", () => {
  expect(ANALYTICS_EVENTS.checkoutStartFailed).toBe("checkout_start_failed");
  expect(isAnalyticsEventName("checkout_start_failed")).toBe(true);
});
```

- [ ] **Step 2: Run the shared analytics test**

Run:

```bash
pnpm --filter @grantpipe/shared test -- src/constants/analytics.test.ts
```

Expected: PASS if the constant already exists; otherwise FAIL until added.

- [ ] **Step 3: Write the API failure test**

In `apps/api/src/domains/org/routes.expanded.test.ts`, add a case where `createBillingCheckoutSession()` throws. Assert response status is the existing error-handler status and analytics captures `checkout_start_failed` with `billing_surface: "paywall"`.

Expected assertion shape:

```ts
expect(analytics.capture).toHaveBeenCalledWith(
  expect.objectContaining({
    eventName: ANALYTICS_EVENTS.checkoutStartFailed,
    payload: expect.objectContaining({
      billing_surface: "paywall",
      plan_tier: "growth",
      billing_cycle: "annual",
    }),
  }),
);
```

- [ ] **Step 4: Run the API route test and confirm red**

Run:

```bash
pnpm --filter @grantpipe/api test -- src/domains/org/routes.expanded.test.ts
```

Expected: FAIL because the failure event is not captured yet.

- [ ] **Step 5: Implement route-level success/failure capture**

In `POST /billing/checkout`, read `surface` from the validated body with default `"settings"`. Capture `checkout_started` after success and `checkout_start_failed` in a `catch` block before rethrowing. Use `swallowCapture()` for analytics and existing Sentry/error middleware for exception capture.

The payload keys must be snake_case:

```ts
{
  org_id: c.get("orgId")!,
  plan_tier: data.planTier,
  billing_cycle: data.billingCycle,
  billing_surface: data.surface ?? "settings",
}
```

- [ ] **Step 6: Run API tests**

Run:

```bash
pnpm --filter @grantpipe/api test -- src/domains/org/routes.expanded.test.ts
```

Expected: PASS.

### Task 5: Start Checkout From The Expired-Trial Wall

**Files:**

- Modify: `apps/web/src/routes/_authenticated.tsx`
- Modify: `apps/web/src/routes/_authenticated.test.tsx`
- Modify: `apps/web/src/lib/billing-checkout-copy.ts`

- [ ] **Step 1: Write the failing paywall UI test**

Add a test for an admin on `trial_expired`:

```tsx
it("lets admins start checkout from the expired-trial wall", async () => {
  mockUsePaywall.mockReturnValue({
    state: { allowed: false, reason: "trial_expired", trialEndsAt: new Date("2026-06-01") },
    isLoading: false,
    isError: false,
  });
  mockUseSession.mockReturnValue({
    ...baseSession,
    memberRole: "admin",
    orgSubscription: { planTier: "growth", billingCycle: "annual" },
  });
  mockUseBillingCheckoutMutation.mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/c/session" }),
    isPending: false,
  });

  renderAuthenticatedShellAt("/dashboard");

  await userEvent.click(screen.getByRole("button", { name: "See plans" }));

  expect(mockBillingCheckoutMutate).toHaveBeenCalledWith({
    planTier: "growth",
    billingCycle: "annual",
    surface: "paywall",
  });
});
```

- [ ] **Step 2: Run the route test and confirm red**

Run:

```bash
pnpm --filter @grantpipe/web test -- src/routes/_authenticated.test.tsx
```

Expected: FAIL because the expired wall uses a link, not the checkout mutation.

- [ ] **Step 3: Implement the wall action**

In `_authenticated.tsx`:

- Import `getBlockedBillingCopy`.
- Import `useBillingCheckoutMutation`.
- Determine default plan/cycle from `session.orgSubscription.planTier` and `billingCycle`, falling back to `growth` and `annual`.
- Render a pill `Button` for admins.
- On click, call `mutateAsync({ planTier, billingCycle, surface: "paywall" })`.
- If the result has `url`, set `window.location.href = url`.
- If the mutation errors, show the existing toast/error affordance already used in the shell.

- [ ] **Step 4: Run the route test**

Run:

```bash
pnpm --filter @grantpipe/web test -- src/routes/_authenticated.test.tsx
```

Expected: PASS.

### Task 6: Preserve Settings Billing Behavior

**Files:**

- Modify: `apps/web/src/components/settings-billing-panel.tsx`
- Modify: `apps/web/src/components/settings-billing-panel.test.tsx`

- [ ] **Step 1: Write or update the settings test**

Assert settings still starts checkout with `surface: "settings"`:

```ts
expect(mockBillingCheckoutMutate).toHaveBeenCalledWith(
  expect.objectContaining({
    planTier: "growth",
    billingCycle: "annual",
    surface: "settings",
  }),
);
```

- [ ] **Step 2: Run the settings billing test and confirm red if surface is missing**

Run:

```bash
pnpm --filter @grantpipe/web test -- src/components/settings-billing-panel.test.tsx
```

Expected: FAIL until the component sends the surface, or PASS if Task 3 already defaulted it at the hook boundary.

- [ ] **Step 3: Implement the minimal update**

Pass `surface: "settings"` from the settings billing panel when starting checkout. Keep current plan/cycle/promo behavior unchanged.

- [ ] **Step 4: Run the settings billing test**

Run:

```bash
pnpm --filter @grantpipe/web test -- src/components/settings-billing-panel.test.tsx
```

Expected: PASS.

### Task 7: Copy Gate Evidence

**Files:**

- Create: `docs/offers/copy-gates/wave0-trial-to-pay-copy-gate.md`

- [ ] **Step 1: Draft the exact customer-facing lines**

Record these exact lines:

- `Pick a plan to keep your data`
- `Your free trial ended. Choose a plan to keep using GrantPipe with the records you already set up.`
- `Ask an admin to choose a plan so your team can keep using GrantPipe.`
- `See plans`
- `Add billing`
- `Sign out`

- [ ] **Step 2: Run the required copy review**

Use the repo-required order:

1. `humanizer`
2. `third-grade-copy`
3. zero-lies review against current code
4. fit-context review against the expired-trial wall

Record the result in the markdown file with the date, reviewer, and line list. Do not claim an external legal or accounting outcome.

- [ ] **Step 3: Search for banned placeholders and internal labels**

Run:

```bash
rg -n "[T]ODO|[T]BD|[n]ew lead magnet|image [s]uggestion|internal [p]roduction|[f]ake|[l]orem" docs/offers/copy-gates/wave0-trial-to-pay-copy-gate.md apps/web/src/routes/_authenticated.tsx apps/web/src/lib/billing-checkout-copy.ts
```

Expected: no matches.

### Task 8: Targeted Verification

**Files:** no new source files; verification only.

- [ ] **Step 1: Run focused package tests**

Run:

```bash
pnpm --filter @grantpipe/shared test -- src/constants/analytics.test.ts src/utils/paywall.test.ts
pnpm --filter @grantpipe/api test -- src/domains/auth/service.test.ts src/domains/org/routes.expanded.test.ts src/domains/org/service.test.ts
pnpm --filter @grantpipe/web test -- src/lib/billing-checkout-copy.test.ts src/hooks/use-org-settings.test.ts src/routes/_authenticated.test.tsx src/components/settings-billing-panel.test.tsx
```

Expected: all focused tests pass.

- [ ] **Step 2: Run typechecks for touched apps/packages**

Run:

```bash
pnpm --filter @grantpipe/shared typecheck
pnpm --filter @grantpipe/api typecheck
pnpm --filter @grantpipe/web typecheck
```

Expected: all typechecks pass.

- [ ] **Step 3: Run build gates likely to catch route and bundle regressions**

Run:

```bash
pnpm --filter @grantpipe/web build
```

Expected: build succeeds, AI-CS knowledge validation succeeds, and analytics build verification succeeds.

- [ ] **Step 4: Request review**

Dispatch a spec-compliance review and a UX/copy review. Required review prompts:

- Spec review: compare code against roadmap items 0.1 and 0.2 plus this plan.
- UX/copy review: verify the wall is clear, honest, not coercive, and the CTA is a pill.

- [ ] **Step 5: Fix every Critical and Important issue**

Apply fixes with new failing tests first when behavior changes. Re-run the focused command that proves each fix.

- [ ] **Step 6: Merge and deploy only after review is clean**

When review is clean:

```bash
git status --short
git add apps/api apps/web packages/shared docs/offers/copy-gates
git commit -m "feat(funnel): add trial-to-pay checkout wall"
git checkout master
git pull
git merge --no-ff codex/roadmap-wave0-planning
pnpm run deploy:changed
```

Then verify production with:

```bash
pnpm run deploy:changed:dry-run
```

and a browser E2E using the disposable `GRANTPIPE_E2E_*` account against `GRANTPIPE_E2E_APP_URL`. The live check must prove an expired-trial admin sees the plan wall and a checkout-start request returns a Stripe Checkout URL without printing secrets.

---

## Completion Evidence Required

- Focused tests and typechecks listed above pass fresh in the implementing turn.
- Copy gate evidence exists at `docs/offers/copy-gates/wave0-trial-to-pay-copy-gate.md`.
- Sub-agent spec review and UX/copy review have no open Critical or Important findings.
- Changes are merged to `master`.
- Affected apps are deployed through the repo Wrangler scripts.
- Live E2E proves the expired-trial wall and checkout-start path.
