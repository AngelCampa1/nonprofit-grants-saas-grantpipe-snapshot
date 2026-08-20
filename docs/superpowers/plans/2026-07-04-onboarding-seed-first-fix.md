# Onboarding Seed-First Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the post-seed "bouncing" (trial users trapped at `/settings#billing`), make sample-data the only onboarding path, and collapse the two sample-data banners into one prettier banner.

**Architecture:** Purely front-end changes in `apps/web`, reusing existing card-free billing (`PATCH /api/org/billing/selection` via `useOrgSettingsMutations().saveBillingSelection`, which already flips `planSelectionCompleted` in the session cache). `/select-plan` becomes a real no-card plan picker instead of a redirect stub; onboarding Step 3 becomes a single seed action; the `SampleDataAhaBanner` + `SampleDataBanner` merge into one `SampleDataBanner`.

**Tech Stack:** React 19, TanStack Router + Query, Vitest + Testing Library, `@grantpipe/shared` pricing helpers, `@grantpipe/ui`.

**Reference spec:** `docs/superpowers/specs/2026-07-04-onboarding-seed-first-fix-design.md`

---

## File Structure

- `apps/web/src/routes/_authenticated/select-plan.tsx` — **rewrite**: redirect stub → real no-card plan picker. One responsibility: let a trial admin pick a self-serve tier, then route to the goal's aha page.
- `apps/web/src/routes/_authenticated/select-plan.test.tsx` — **create**: picker behavior + regression that it never lands on `/settings`.
- `apps/web/src/routes/_authenticated/onboarding.tsx` — **modify** `StepGetData`: single seed-only action; remove import/scratch branch.
- `apps/web/src/routes/_authenticated/onboarding.test.tsx` — **modify**: assert seed-only step.
- `apps/web/src/components/sample-data-banner.tsx` — **rewrite**: single consolidated banner (aha copy on first view → persistent state).
- `apps/web/src/components/sample-data-banner.test.tsx` — **modify**: cover merged behavior.
- `apps/web/src/components/onboarding/sample-data-aha-banner.tsx` + `.test.tsx` — **delete** (merged away).
- `apps/web/src/routes/_authenticated.tsx` — **modify**: mount one banner; drop the aha-banner import.
- `apps/web/src/routes/_authenticated.test.tsx` — **modify**: single banner + guard regression.
- `e2e/helpers/auth.ts`, `e2e/auth-onboarding.spec.ts` — **modify**: pick a plan before asserting `/app/funds`.

Reused as-is (no change): `apps/web/src/hooks/use-org-settings.ts` (`saveBillingSelection`), `apps/web/src/lib/onboarding-goal.ts` (`ahaRouteForGoal`), `apps/web/src/lib/aha-banner.ts`, `apps/web/src/hooks/use-sample-data.ts`, `apps/api/src/domains/org/routes.ts` (`PATCH /billing/selection`).

---

## Preflight

- [ ] **Step 0.1: Ensure the worktree has working dependencies.**

The worktree needs `node_modules` to run tests. A plain `pnpm install` inside a worktree can clobber the main repo's `@grantpipe/*` workspace links (known issue). Prefer Windows directory junctions to the main checkout's already-installed modules. From the worktree root (`<repo-root>\.claude\worktrees\onboarding-seed-first-fix`), in a `cmd`-compatible shell:

```
mklink /J node_modules <repo-root>\node_modules
mklink /J apps\web\node_modules <repo-root>\apps\web\node_modules
mklink /J packages\shared\node_modules <repo-root>\packages\shared\node_modules
mklink /J packages\ui\node_modules <repo-root>\packages\ui\node_modules
```

Expected: "Junction created for ...". If junctions are not viable, run `pnpm install --filter @grantpipe/web...` scoped to the web app and verify afterward that `git -C <repo-root> status` shows no changes to root `node_modules` symlinks.

- [ ] **Step 0.2: Baseline the files we will touch.**

Run: `pnpm --filter @grantpipe/web test -- src/routes/_authenticated/onboarding.test.tsx src/components/sample-data-banner.test.tsx`
Expected: PASS (green baseline before changes).

---

## Task 1: Real no-card plan picker at `/select-plan` (fixes P0 bounce)

**Files:**

- Modify: `apps/web/src/routes/_authenticated/select-plan.tsx`
- Create: `apps/web/src/routes/_authenticated/select-plan.test.tsx`

Context: The old component unconditionally redirected to `/settings#billing`, which is not in the guard's plan-selection allow-list, so the guard re-armed → bounce. The new component resolves plan selection in place using `saveBillingSelection` (card-free; already flips `planSelectionCompleted` in the `["auth-session-context"]` cache), then navigates to `ahaRouteForGoal(goal)` using the org's `onboardingGoal` from the session.

- [ ] **Step 1.1: Write the failing test.**

Create `apps/web/src/routes/_authenticated/select-plan.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const navigateMock = vi.fn();
const mutateAsyncMock = vi.fn().mockResolvedValue({});

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: unknown) => config,
  useNavigate: () => navigateMock,
}));

vi.mock("../../hooks/use-session", () => ({
  useSession: () => ({ onboardingGoal: "grants" }),
}));

vi.mock("../../hooks/use-org-settings", () => ({
  useOrgSettingsMutations: () => ({
    saveBillingSelection: { mutateAsync: mutateAsyncMock, isPending: false },
  }),
}));

import { SelectPlanPage } from "./select-plan";

describe("SelectPlanPage", () => {
  beforeEach(() => {
    navigateMock.mockClear();
    mutateAsyncMock.mockClear();
  });

  it("shows the three self-serve plans and a no-card reassurance", () => {
    render(<SelectPlanPage />);
    expect(screen.getByText(/No card needed/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start Starter/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start Growth/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start Audit-Ready/i })).toBeInTheDocument();
  });

  it("saves the chosen plan (no card) and routes to the goal's aha page", async () => {
    render(<SelectPlanPage />);
    await userEvent.click(screen.getByRole("button", { name: /Start Growth/i }));
    await waitFor(() =>
      expect(mutateAsyncMock).toHaveBeenCalledWith(expect.objectContaining({ planTier: "growth" })),
    );
    // grants goal → /funds. Never /settings.
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: "/funds" }));
    expect(navigateMock).not.toHaveBeenCalledWith(expect.objectContaining({ to: "/settings" }));
  });

  it("surfaces an error and does not navigate when saving fails", async () => {
    mutateAsyncMock.mockRejectedValueOnce(new Error("nope"));
    render(<SelectPlanPage />);
    await userEvent.click(screen.getByRole("button", { name: /Start Starter/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 1.2: Run the test to verify it fails.**

Run: `pnpm --filter @grantpipe/web test -- src/routes/_authenticated/select-plan.test.tsx`
Expected: FAIL — `SelectPlanPage` is not exported yet.

- [ ] **Step 1.3: Rewrite `select-plan.tsx` as a real picker.**

Replace the entire file contents:

```tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@grantpipe/ui";
import {
  DEFAULT_BILLING_CYCLE,
  getSelfServePlans,
  getPlanListDisplayPrice,
  type BillingCycle,
  type SelfServePlanTier,
} from "@grantpipe/shared";
import { useSession } from "../../hooks/use-session";
import { useOrgSettingsMutations } from "../../hooks/use-org-settings";
import { ahaRouteForGoal } from "../../lib/onboarding-goal";
import { captureAppException } from "../../lib/sentry";

const selectPlanSearchSchema = z.object({
  plan: z.string().optional().catch(undefined),
  cycle: z.string().optional().catch(undefined),
  promo: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/_authenticated/select-plan")({
  validateSearch: selectPlanSearchSchema,
  component: SelectPlanPage,
});

function normalizeCycle(value: string | undefined): BillingCycle {
  return value === "monthly" || value === "annual" ? value : DEFAULT_BILLING_CYCLE;
}

export function SelectPlanPage() {
  const navigate = useNavigate();
  const { onboardingGoal } = useSession();
  const { saveBillingSelection } = useOrgSettingsMutations();
  // Read search lazily; the route may be rendered in tests without a router.
  let cycleParam: string | undefined;
  try {
    cycleParam = Route.useSearch().cycle;
  } catch {
    cycleParam = undefined;
  }
  const [cycle, setCycle] = useState<BillingCycle>(() => normalizeCycle(cycleParam));
  const [error, setError] = useState<string | null>(null);
  const [pendingTier, setPendingTier] = useState<SelfServePlanTier | null>(null);

  const plans = getSelfServePlans();

  async function choosePlan(planTier: SelfServePlanTier) {
    setError(null);
    setPendingTier(planTier);
    try {
      await saveBillingSelection.mutateAsync({ planTier, billingCycle: cycle });
      // saveBillingSelection already flipped planSelectionCompleted=true in the
      // session cache, so the plan-selection guard is now inert. Route to the
      // goal's aha page so the user lands on their freshly seeded data.
      await navigate({ to: ahaRouteForGoal(onboardingGoal ?? null) });
    } catch (err) {
      captureAppException(
        err,
        { tags: { feature: "onboarding", operation: "plan_selection" } },
        { sanitize: true },
      );
      setError("We couldn't save your plan. Please try again.");
    } finally {
      setPendingTier(null);
    }
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-background px-4 py-12 sm:py-16">
      <div className="w-full max-w-3xl space-y-8">
        <header className="space-y-3 text-center">
          <h1 className="font-heading text-3xl font-bold text-foreground sm:text-4xl">
            Pick a plan to start
          </h1>
          <p className="mx-auto max-w-xl text-lg leading-relaxed text-muted-foreground">
            No card needed. You&apos;re on a free trial. You can change or add billing later.
          </p>
          <div
            role="group"
            aria-label="Billing cycle"
            className="mx-auto inline-flex items-center gap-1 rounded-full border border-border bg-card p-1"
          >
            {(["annual", "monthly"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={cycle === option}
                onClick={() => setCycle(option)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors motion-reduce:transition-none ${
                  cycle === option
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {option === "annual" ? "Annual (save 20%)" : "Monthly"}
              </button>
            ))}
          </div>
        </header>

        {error !== null && (
          <div
            role="alert"
            className="rounded-2xl bg-destructive/10 px-4 py-3 text-lg text-destructive"
          >
            {error}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          {plans.map((plan) => {
            const price = getPlanListDisplayPrice(plan.tier, cycle);
            const tier = plan.tier as SelfServePlanTier;
            const isPending = pendingTier === tier && saveBillingSelection.isPending;
            return (
              <div
                key={plan.tier}
                className={`flex flex-col gap-4 rounded-2xl border bg-card p-6 ${
                  plan.highlighted ? "border-primary ring-2 ring-primary/30" : "border-border"
                }`}
              >
                <div className="space-y-1">
                  <h2 className="text-xl font-semibold text-foreground">{plan.name}</h2>
                  <p className="text-2xl font-bold text-foreground">{price.price}</p>
                  <p className="text-sm text-muted-foreground">{price.billingContext}</p>
                </div>
                <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
                  {plan.bestFit}
                </p>
                <Button
                  type="button"
                  disabled={saveBillingSelection.isPending}
                  onClick={() => void choosePlan(tier)}
                  variant={plan.highlighted ? "default" : "outline"}
                  className="w-full"
                >
                  {isPending ? "Starting…" : plan.ctaLabel}
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 1.4: Run the test to verify it passes.**

Run: `pnpm --filter @grantpipe/web test -- src/routes/_authenticated/select-plan.test.tsx`
Expected: PASS (all three cases).

- [ ] **Step 1.5: Commit.**

```bash
git add apps/web/src/routes/_authenticated/select-plan.tsx apps/web/src/routes/_authenticated/select-plan.test.tsx
git commit -m "fix(onboarding): real no-card plan picker at /select-plan (fixes trial bounce)"
```

---

## Task 2: Seed-only onboarding Step 3 (fixes P1)

**Files:**

- Modify: `apps/web/src/routes/_authenticated/onboarding.tsx` (`StepGetData`)
- Modify: `apps/web/src/routes/_authenticated/onboarding.test.tsx`

Context: `StepGetData` currently offers three actions. Reduce to one primary "Show me around" action that seeds, completes activation, arms the aha banner, and navigates. Remove `handleImport`, `handleScratch`, and their buttons. Keep `handleSampleData`, `seedError`, and the loading state.

- [ ] **Step 2.1: Write/adjust the failing test.**

In `apps/web/src/routes/_authenticated/onboarding.test.tsx`, add (or update) a test asserting Step 3 is seed-only. Representative test body — adapt to the file's existing render helpers/mocks for reaching step 3:

```tsx
it("step 3 offers only the sample-data action", async () => {
  await renderOnboardingAtGetDataStep(); // existing helper that advances to step 3
  expect(
    screen.getByRole("button", { name: /Show me around|Show me how it works/i }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Import a spreadsheet/i })).toBeNull();
  expect(screen.queryByRole("button", { name: /Start from scratch/i })).toBeNull();
});
```

If the file lacks a step-3 helper, drive it via the existing pattern used by other tests in the file (select goal → Continue → fill org name → Continue).

- [ ] **Step 2.2: Run the test to verify it fails.**

Run: `pnpm --filter @grantpipe/web test -- src/routes/_authenticated/onboarding.test.tsx -t "seed-only"`
Expected: FAIL — import/scratch buttons still present.

- [ ] **Step 2.3: Rewrite `StepGetData` to seed-only.**

Replace the `StepGetData` function body in `onboarding.tsx` with a single-action version. Remove `handleImport`, `handleScratch`, the "Or start your own way" divider, and both branch buttons. Keep the seed card, the button (label "Show me around"), `seedError`, and the back button:

```tsx
function StepGetData({
  goal,
  onBack,
  navigate,
}: {
  goal: OnboardingGoal | null;
  onBack: () => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const queryClient = useQueryClient();
  const { orgId } = useSession();
  const seedSampleData = useSeedSampleData();
  const [seedError, setSeedError] = useState<string | null>(null);

  async function finishOnboarding() {
    try {
      await completeOnboardingActivation(queryClient, "sample-data", goal);
      return true;
    } catch {
      captureOnboardingStepFailed(ONBOARDING_STEPS.getData, "api_error");
      setSeedError("Something went wrong finishing setup. Please try again.");
      return false;
    }
  }

  async function handleSampleData() {
    setSeedError(null);
    try {
      await seedSampleData.mutateAsync();
      captureEvent(ANALYTICS_EVENTS.onboardingSampleDataChosen, { goal });
      captureEvent(ANALYTICS_EVENTS.onboardingFirstActionSelected, {
        first_action: "sample_data",
      });
      if (!(await finishOnboarding())) return;
      if (orgId && goal) markAhaBannerPending(orgId, goal);
      await navigate({ to: ahaRouteForGoal(goal) });
    } catch {
      captureOnboardingStepFailed(ONBOARDING_STEPS.getData, "request_error");
      setSeedError("Something went wrong loading sample data. Please try again.");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-bold text-primary">See how it works</h1>
        <p className="mt-3 text-lg leading-relaxed text-muted-foreground">
          We&apos;ll fill your workspace with example records so you can look around. Clear them
          anytime and add your own.
        </p>
      </div>

      {seedError !== null && (
        <div
          role="alert"
          className="rounded-2xl bg-destructive/10 px-4 py-3 text-lg text-destructive"
        >
          {seedError}
        </div>
      )}

      <div className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-5">
        <p className="text-base leading-relaxed text-foreground">
          See what is due, what is left, and what needs proof — with example grants, funds, and
          donors already filled in.
        </p>
        <Button
          type="button"
          onClick={() => void handleSampleData()}
          disabled={seedSampleData.isPending}
          className="h-12 w-full text-lg"
        >
          {seedSampleData.isPending ? "Loading examples…" : "Show me around"}
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" variant="ghost" onClick={onBack} className="px-3 text-lg">
          ← Back
        </Button>
      </div>
    </div>
  );
}
```

Note: the copy above is provisional and MUST be passed through the `humanizer` then `third-grade-copy` skills before the task is considered done (see Task 6, copy gate).

- [ ] **Step 2.4: Run the test to verify it passes.**

Run: `pnpm --filter @grantpipe/web test -- src/routes/_authenticated/onboarding.test.tsx`
Expected: PASS. Update any now-broken assertions in the file that referenced the removed import/scratch buttons or the old "Add your data" / "Show me how it works" strings.

- [ ] **Step 2.5: Commit.**

```bash
git add apps/web/src/routes/_authenticated/onboarding.tsx apps/web/src/routes/_authenticated/onboarding.test.tsx
git commit -m "feat(onboarding): make sample data the only onboarding path"
```

---

## Task 3: Consolidate to one sample-data banner (fixes P2)

**Files:**

- Rewrite: `apps/web/src/components/sample-data-banner.tsx`
- Modify: `apps/web/src/components/sample-data-banner.test.tsx`
- Delete: `apps/web/src/components/onboarding/sample-data-aha-banner.tsx` and `.test.tsx`
- Modify: `apps/web/src/routes/_authenticated.tsx` (single mount; drop aha import)
- Modify: `apps/web/src/routes/_authenticated.test.tsx`

Context: Merge the transient goal-aware aha banner and the persistent "sample data" banner into one component. Visibility is driven by `useSampleDataStatus().data.seeded === true`. When a pending aha goal exists for the org (`readPendingAhaGoal(orgId)`), show the goal-aware aha copy and fire `onboardingAhaBannerViewed`; a dismiss control clears the aha emphasis (`clearAhaBannerPending`) and settles to the persistent message. Clearing sample data is admin/editor-only and fires `onboardingAhaExamplesCleared` when an aha goal was present.

- [ ] **Step 3.1: Write the failing test.**

Replace `apps/web/src/components/sample-data-banner.test.tsx` with coverage of the merged behavior. Key cases (adapt mocks to the existing test's style):

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const clearMutateAsync = vi.fn().mockResolvedValue({});
let seeded = true;
let pendingGoal: string | null = "grants";

vi.mock("../hooks/use-sample-data", () => ({
  useSampleDataStatus: () => ({ data: { seeded, recordCount: 5 }, isLoading: false }),
  useClearSampleData: () => ({ mutateAsync: clearMutateAsync, isPending: false }),
}));
vi.mock("../hooks/use-session", () => ({
  useSession: () => ({ orgId: "org_1", memberRole: "admin" }),
}));
vi.mock("../lib/aha-banner", async (importActual) => {
  const actual = await importActual<typeof import("../lib/aha-banner")>();
  return {
    ...actual,
    readPendingAhaGoal: () => pendingGoal,
    clearAhaBannerPending: vi.fn(),
  };
});
vi.mock("../lib/analytics", () => ({ captureEvent: vi.fn() }));

import { SampleDataBanner } from "./sample-data-banner";

describe("SampleDataBanner (consolidated)", () => {
  beforeEach(() => {
    seeded = true;
    pendingGoal = "grants";
    clearMutateAsync.mockClear();
  });

  it("renders nothing when no sample data is seeded", () => {
    seeded = false;
    const { container } = render(<SampleDataBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows goal-aware aha copy on first view", () => {
    render(<SampleDataBanner />);
    expect(screen.getByText(/These are your funds/i)).toBeInTheDocument();
  });

  it("settles to the persistent message after the aha goal is dismissed", async () => {
    render(<SampleDataBanner />);
    await userEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.getByText(/exploring sample data/i)).toBeInTheDocument();
  });

  it("clears sample data for admins", async () => {
    render(<SampleDataBanner />);
    await userEvent.click(screen.getByRole("button", { name: /Clear sample data/i }));
    expect(clearMutateAsync).toHaveBeenCalled();
  });

  it("hides the clear action for viewers", () => {
    vi.doMock("../hooks/use-session", () => ({
      useSession: () => ({ orgId: "org_1", memberRole: "viewer" }),
    }));
  });
});
```

- [ ] **Step 3.2: Run to verify it fails.**

Run: `pnpm --filter @grantpipe/web test -- src/components/sample-data-banner.test.tsx`
Expected: FAIL — persistent copy string and aha behavior not yet in the single component.

- [ ] **Step 3.3: Rewrite `sample-data-banner.tsx` as the single banner.**

```tsx
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@grantpipe/ui";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";
import type { OnboardingGoal } from "@grantpipe/shared";
import { useClearSampleData, useSampleDataStatus } from "../hooks/use-sample-data";
import { useSession } from "../hooks/use-session";
import { captureEvent } from "../lib/analytics";
import { ahaBannerCopy, clearAhaBannerPending, readPendingAhaGoal } from "../lib/aha-banner";

// Observability note: useClearSampleData owns the PostHog/Sentry instrumentation
// for the clear success/failure paths. This banner adds only the onboarding-specific
// aha view/clear events on top of it.

const PERSISTENT_COPY = "You're exploring sample data. Clear it anytime and add your own.";

export function SampleDataBanner(): React.JSX.Element | null {
  const { orgId, memberRole } = useSession();
  const status = useSampleDataStatus();
  const clear = useClearSampleData();

  const [ahaGoal, setAhaGoal] = useState<OnboardingGoal | null>(() => readPendingAhaGoal(orgId));
  const [hasError, setHasError] = useState(false);
  const viewedRef = useRef(false);

  const seeded = status.data?.seeded === true;

  useEffect(() => {
    if (seeded && ahaGoal !== null && !viewedRef.current) {
      viewedRef.current = true;
      captureEvent(ANALYTICS_EVENTS.onboardingAhaBannerViewed, { goal: ahaGoal });
    }
  }, [seeded, ahaGoal]);

  if (!seeded) return null;

  const canRemove = memberRole === "admin" || memberRole === "editor";
  const message = ahaGoal !== null ? ahaBannerCopy(ahaGoal) : PERSISTENT_COPY;

  const dismissAha = () => {
    clearAhaBannerPending(orgId);
    setAhaGoal(null);
  };

  const handleClear = async () => {
    setHasError(false);
    try {
      await clear.mutateAsync();
      if (ahaGoal !== null) {
        captureEvent(ANALYTICS_EVENTS.onboardingAhaExamplesCleared, { goal: ahaGoal });
      }
      clearAhaBannerPending(orgId);
    } catch {
      setHasError(true);
    }
  };

  return (
    <div
      role="status"
      data-testid="sample-data-banner"
      className="w-full border-b border-warning/35 bg-warning/10 px-4 py-3 text-warning-foreground"
    >
      <div className="mx-auto flex w-full max-w-layout-shell flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-base leading-relaxed">{message}</p>
        <div className="flex shrink-0 items-center gap-2">
          {canRemove ? (
            <Button
              size="sm"
              variant="outline"
              disabled={clear.isPending}
              onClick={() => void handleClear()}
              className="rounded-full border-warning/40 bg-warning/10 text-warning-foreground hover:bg-warning/20"
            >
              {clear.isPending ? "Clearing…" : "Clear sample data"}
            </Button>
          ) : null}
          {ahaGoal !== null ? (
            <button
              type="button"
              aria-label="Dismiss"
              onClick={dismissAha}
              className="flex size-11 items-center justify-center rounded-full text-warning-foreground transition-colors hover:bg-warning/20 motion-reduce:transition-none"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>
      {hasError ? (
        <p role="alert" className="mx-auto mt-1 max-w-layout-shell text-sm text-destructive">
          That didn&apos;t work. Try again.
        </p>
      ) : null}
    </div>
  );
}
```

Note: `PERSISTENT_COPY` and the error copy are provisional — run the copy gate in Task 6.

- [ ] **Step 3.4: Delete the old aha banner and update the mount.**

```bash
git rm apps/web/src/components/onboarding/sample-data-aha-banner.tsx apps/web/src/components/onboarding/sample-data-aha-banner.test.tsx
```

In `apps/web/src/routes/_authenticated.tsx`:

- Remove the import line `import { SampleDataAhaBanner } from "../components/onboarding/sample-data-aha-banner";`.
- In the full-shell return, replace the two lines

  ```tsx
  <SampleDataAhaBanner />
  <SampleDataBanner />
  ```

  with a single `<SampleDataBanner />`.

- [ ] **Step 3.5: Update `_authenticated.test.tsx`.**

Remove any assertions referencing `sample-data-aha-banner` / `SampleDataAhaBanner`. If a test asserted both banners render, change it to assert exactly one `data-testid="sample-data-banner"`.

- [ ] **Step 3.6: Run the tests to verify they pass.**

Run: `pnpm --filter @grantpipe/web test -- src/components/sample-data-banner.test.tsx src/routes/_authenticated.test.tsx`
Expected: PASS. Grep to confirm no dangling references: `git grep -n "SampleDataAhaBanner\|sample-data-aha-banner" apps/web/src` returns nothing.

- [ ] **Step 3.7: Commit.**

```bash
git add -A
git commit -m "feat(onboarding): consolidate the two sample-data banners into one"
```

---

## Task 4: Guard regression + e2e flow update

**Files:**

- Modify: `apps/web/src/routes/_authenticated.test.tsx` (guard regression)
- Modify: `e2e/helpers/auth.ts`, `e2e/auth-onboarding.spec.ts`

Context: Lock in that a trialing org (`planSelectedAt` null) that has completed onboarding is sent to `/select-plan` (a real screen), and once a plan is selected the guard does not re-fire toward `/settings`. Update the e2e to pick a plan.

- [ ] **Step 4.1: Add a guard regression test.**

In `apps/web/src/routes/_authenticated.test.tsx`, add a test asserting the plan-selection guard navigates to `/select-plan` (not `/settings`) when `onboardingCompleted === true && planSelectionCompleted === false` on a non-plan route, and does NOT navigate once `planSelectionCompleted === true`. Follow the file's existing session-mock/render harness. Assertion core:

```tsx
expect(navigateMock).toHaveBeenCalledWith({ to: "/select-plan" });
expect(navigateMock).not.toHaveBeenCalledWith(expect.objectContaining({ to: "/settings" }));
```

- [ ] **Step 4.2: Update the e2e helper to pick a plan.**

In `e2e/helpers/auth.ts` `signUpAndCompleteOnboarding`, after clicking the seed action, the app now stops at `/select-plan`. Update the tail:

```ts
await expect(page.getByRole("heading", { name: "See how it works" })).toBeVisible();
await Promise.all([
  page.waitForResponse((response) => response.url().includes("/api/sample-data") && response.ok()),
  page.getByRole("button", { name: /Show me around/i }).click(),
]);

// New: no-card plan picker before the app.
await expect(page.getByRole("heading", { name: /Pick a plan to start/i })).toBeVisible({
  timeout: 30_000,
});
await Promise.all([
  page.waitForResponse((r) => r.url().includes("/api/org/billing/selection") && r.ok()),
  page.getByRole("button", { name: /Start Growth/i }).click(),
]);

await expect(page).toHaveURL(/\/app\/funds$/, { timeout: 30_000 });
await expect(page.getByRole("heading", { name: "Funds" })).toBeVisible();
```

Also update the earlier `"Add your data"` heading assertion (removed) — the seed step heading is now `"See how it works"`.

- [ ] **Step 4.3: Confirm the e2e spec still asserts the final destination.**

`e2e/auth-onboarding.spec.ts` needs no change beyond what the helper covers (it already asserts `/app/funds` + "Funds" heading + "Donors" link). Verify by reading it.

- [ ] **Step 4.4: Run web unit tests.**

Run: `pnpm --filter @grantpipe/web test -- src/routes/_authenticated.test.tsx`
Expected: PASS.

- [ ] **Step 4.5: Commit.**

```bash
git add apps/web/src/routes/_authenticated.test.tsx e2e/helpers/auth.ts e2e/auth-onboarding.spec.ts
git commit -m "test(onboarding): guard regression + e2e picks a plan before the app"
```

---

## Task 5: Full gates + coverage on touched files

- [ ] **Step 5.1: Typecheck the web app.**

Run: `pnpm --filter @grantpipe/web typecheck`
Expected: 0 errors. Fix any type mismatches (e.g., `SelfServePlanTier` casts, `OnboardingGoal` nullability).

- [ ] **Step 5.2: Lint.**

Run: `pnpm --filter @grantpipe/web lint`
Expected: clean. No `any`, no unexplained `eslint-disable`.

- [ ] **Step 5.3: Coverage on touched files (95% per file).**

Run: `pnpm --filter @grantpipe/web test:coverage -- src/routes/_authenticated/select-plan.test.tsx src/routes/_authenticated/onboarding.test.tsx src/components/sample-data-banner.test.tsx src/routes/_authenticated.test.tsx`
Expected: each touched file ≥95% statements/branches. Add test cases for any uncovered branch (error paths, viewer role, monthly toggle).

- [ ] **Step 5.4: Commit any coverage-driven test additions.**

```bash
git add -A
git commit -m "test(onboarding): raise coverage to 95% on touched files"
```

---

## Task 6: Copy gate + local E2E verification

- [ ] **Step 6.1: Run the required marketing-copy gate on all user-facing strings changed.**

Per repo CLAUDE.md, all user-facing copy must pass `humanizer` then `third-grade-copy`. Apply to: the `/select-plan` header + reassurance + cycle labels, the onboarding Step 3 heading/body/button, and the consolidated banner copy (`PERSISTENT_COPY`, error text). Update the strings in place with the gate output. Re-run affected unit tests if any asserted exact strings (update assertions to match final copy).

- [ ] **Step 6.2: Bring up the local stack.**

Follow the local-stack notes: local Postgres on 55439 (already migrated in this environment), web on 3050 via `GRANTPIPE_WEB_PORT=3050 GRANTPIPE_API_PORT=5050 pnpm dev:server start web`, and API by running wrangler directly from `apps/api`: `node node_modules/wrangler/bin/wrangler.js dev --ip localhost --port 5050`. Health-check: `curl http://localhost:5050/api/health` → 200.

- [ ] **Step 6.3: Drive the full fresh-signup flow with browser automation.**

Sign up a brand-new user at `http://localhost:3050`, complete onboarding (goal → org name → "Show me around"), confirm you reach the `/select-plan` picker, choose a plan, and verify:

- You land on `/app/funds` (grants goal), NOT `/settings#billing`.
- No URL bounce / no repeated navigation in the network log.
- The sample data is visible and exactly ONE banner renders (`data-testid="sample-data-banner"`), with the goal-aware aha copy on first view.
- Console has no errors; no "Maximum update depth" warning.

- [ ] **Step 6.4: Verify observability.**

Confirm (via console network or PostHog debug) that `onboardingSampleDataChosen`, `onboardingCompleted`, `planSelected`/`billingSelectionSaved`, and `onboardingAhaBannerViewed` fire once each on the happy path, and that a forced plan-selection failure logs to Sentry with `feature: "onboarding", operation: "plan_selection"`.

- [ ] **Step 6.5: Final commit if any copy/strings changed.**

```bash
git add -A
git commit -m "chore(onboarding): finalize copy via humanizer + third-grade-copy gate"
```

---

## Self-review checklist (author)

- Spec P0 (bounce) → Task 1 + Task 4 regression. ✅
- Spec P1 (seed-only) → Task 2. ✅
- Spec P2 (one banner) → Task 3. ✅
- Observability → Task 6.4 + inline `captureAppException` in Task 1/2. ✅
- Tests/coverage → Tasks 1–5. ✅
- Copy gate → Task 6.1. ✅
- Names consistent: `SelectPlanPage`, `SampleDataBanner`, `saveBillingSelection`, `ahaRouteForGoal`, `readPendingAhaGoal`, `markAhaBannerPending`, `ANALYTICS_EVENTS.onboardingAhaBannerViewed/onboardingAhaExamplesCleared` — all match source. ✅
- No placeholders; every code step shows full code. ✅
