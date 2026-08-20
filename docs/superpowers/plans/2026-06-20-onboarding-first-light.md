# First Light Onboarding Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-curate GrantPipe first-run onboarding into a calm, value-first, novice-friendly "First Light" flow that gets a brand-new user to a populated, real-feeling workspace in three screens, then consolidates the dashboard to a single onboarding nudge.

**Architecture:** Edit the existing 3-step wizard at `apps/web/src/routes/_authenticated/onboarding.tsx` in place (no new route, no schema change). Screen 2 drops the fiscal-year + timezone form controls and instead auto-detects timezone in the browser and defaults fiscal month to January, still sending all fields through the existing authoritative `onboarding.$patch`. A new dismissible aha banner component renders in the authenticated layout after a sample-data seed. The floating 30-day overlay is retired so the inline checklist is the single dashboard nudge. Three privacy-safe analytics events are added to the shared taxonomy.

**Tech Stack:** React 19, TanStack Router/Query, Hono RPC client, Tailwind CSS 4, Shadcn/UI, Vitest + Testing Library, PostHog (`captureEvent`), Sentry (`captureQueryError`).

---

## File map

- `packages/shared/src/constants/analytics.ts` — add 3 events (modify)
- `packages/shared/src/constants/analytics.test.ts` — assert new keys/values (modify)
- `apps/web/src/routes/_authenticated/onboarding.tsx` — Screens 1–3 re-curation, timezone auto-detect, default fiscal, set aha flag on seed (modify)
- `apps/web/src/routes/_authenticated/onboarding.test.tsx` — update + extend (modify)
- `apps/web/src/components/onboarding/goal-step.tsx` — accessibility polish (modify)
- `apps/web/src/lib/aha-banner.ts` — Create: flag helpers + copy-by-goal (create)
- `apps/web/src/lib/aha-banner.test.ts` — Test (create)
- `apps/web/src/components/onboarding/sample-data-aha-banner.tsx` — Create: the calm banner (create)
- `apps/web/src/components/onboarding/sample-data-aha-banner.test.tsx` — Test (create)
- `apps/web/src/routes/_authenticated.tsx` — mount the banner (modify)
- `apps/web/src/routes/_authenticated/dashboard.tsx` — remove `<OnboardingOverlay />` + import (modify)
- `apps/web/src/components/onboarding-overlay.tsx` — delete (remove)
- `apps/web/src/components/onboarding-overlay.test.tsx` — delete (remove)
- `apps/web/src/routes/_authenticated/dashboard.test.tsx` — drop overlay assertions (modify)

---

## Task 1: Add three privacy-safe analytics events

**Files:**

- Modify: `packages/shared/src/constants/analytics.ts`
- Test: `packages/shared/src/constants/analytics.test.ts`

- [ ] **Step 1: Write failing test** — add to analytics.test.ts:

```ts
it("exposes First Light onboarding aha events", () => {
  expect(ANALYTICS_EVENTS.onboardingTimezoneAutodetected).toBe("onboarding_timezone_autodetected");
  expect(ANALYTICS_EVENTS.onboardingAhaBannerViewed).toBe("onboarding_aha_banner_viewed");
  expect(ANALYTICS_EVENTS.onboardingAhaExamplesCleared).toBe("onboarding_aha_examples_cleared");
});
```

- [ ] **Step 2: Run** `pnpm --filter @grantpipe/shared test` — expect FAIL (undefined keys).

- [ ] **Step 3: Implement** — in analytics.ts, after `onboardingAbandoned`:

```ts
  onboardingTimezoneAutodetected: "onboarding_timezone_autodetected",
  onboardingAhaBannerViewed: "onboarding_aha_banner_viewed",
  onboardingAhaExamplesCleared: "onboarding_aha_examples_cleared",
```

- [ ] **Step 4: Run** `pnpm --filter @grantpipe/shared test` — expect PASS.

- [ ] **Step 5: Commit** `feat(analytics): add First Light onboarding aha events`.

---

## Task 2: aha-banner lib (flag helpers + copy)

**Files:**

- Create: `apps/web/src/lib/aha-banner.ts`
- Test: `apps/web/src/lib/aha-banner.test.ts`

Responsibility: a one-shot, per-org "just seeded sample data, show the aha banner" signal stored in `localStorage`, plus goal-specific banner copy. Copy here is final-gated (humanizer + third-grade) in Task 7.

- [ ] **Step 1: Write failing test** `aha-banner.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import {
  ahaBannerStorageKey,
  markAhaBannerPending,
  readPendingAhaGoal,
  clearAhaBannerPending,
  ahaBannerCopy,
} from "./aha-banner";

afterEach(() => localStorage.clear());

describe("aha-banner pending flag", () => {
  it("namespaces the key by org", () => {
    expect(ahaBannerStorageKey("org_1")).toBe("gp:aha-banner:org_1");
  });

  it("round-trips a pending goal then clears", () => {
    markAhaBannerPending("org_1", "donors");
    expect(readPendingAhaGoal("org_1")).toBe("donors");
    clearAhaBannerPending("org_1");
    expect(readPendingAhaGoal("org_1")).toBeNull();
  });

  it("returns null for an unknown stored goal", () => {
    localStorage.setItem(ahaBannerStorageKey("org_1"), "not-a-goal");
    expect(readPendingAhaGoal("org_1")).toBeNull();
  });

  it("returns null when org id is missing", () => {
    expect(readPendingAhaGoal(null)).toBeNull();
    expect(readPendingAhaGoal(undefined)).toBeNull();
  });

  it("provides goal-specific copy with a fallback", () => {
    expect(ahaBannerCopy("donors").length).toBeGreaterThan(0);
    expect(ahaBannerCopy("grants").length).toBeGreaterThan(0);
    expect(ahaBannerCopy("compliance").length).toBeGreaterThan(0);
    expect(ahaBannerCopy(null)).toBe(ahaBannerCopy("donors"));
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter @grantpipe/web test src/lib/aha-banner.test.ts` — expect FAIL (module missing).

- [ ] **Step 3: Implement** `aha-banner.ts`:

```ts
import type { OnboardingGoal } from "@grantpipe/shared";

const PREFIX = "gp:aha-banner:";
const VALID_GOALS: OnboardingGoal[] = ["donors", "grants", "compliance"];

export function ahaBannerStorageKey(orgId: string): string {
  return `${PREFIX}${orgId}`;
}

function isGoal(value: unknown): value is OnboardingGoal {
  return typeof value === "string" && (VALID_GOALS as string[]).includes(value);
}

export function markAhaBannerPending(orgId: string, goal: OnboardingGoal): void {
  try {
    localStorage.setItem(ahaBannerStorageKey(orgId), goal);
  } catch {
    // storage unavailable (private mode / quota) — banner is best-effort
  }
}

export function readPendingAhaGoal(orgId: string | null | undefined): OnboardingGoal | null {
  if (!orgId) return null;
  try {
    const raw = localStorage.getItem(ahaBannerStorageKey(orgId));
    return isGoal(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function clearAhaBannerPending(orgId: string | null | undefined): void {
  if (!orgId) return;
  try {
    localStorage.removeItem(ahaBannerStorageKey(orgId));
  } catch {
    // ignore
  }
}

const COPY: Record<OnboardingGoal, string> = {
  donors:
    "This is your donor list. We filled it with examples so you can see how it works. You can clear them anytime.",
  grants:
    "These are your funds, filled with examples so you can see how money is tracked. You can clear them anytime.",
  compliance:
    "These are your reports, filled with examples so you can see what they look like. You can clear them anytime.",
};

export function ahaBannerCopy(goal: OnboardingGoal | null | undefined): string {
  return goal && goal in COPY ? COPY[goal] : COPY.donors;
}
```

- [ ] **Step 4: Run** the test — expect PASS.

- [ ] **Step 5: Commit** `feat(onboarding): aha-banner pending-flag lib`.

---

## Task 3: SampleDataAhaBanner component

**Files:**

- Create: `apps/web/src/components/onboarding/sample-data-aha-banner.tsx`
- Test: `apps/web/src/components/onboarding/sample-data-aha-banner.test.tsx`

Responsibility: when an org has a pending aha goal AND sample data is seeded, render a calm dismissible banner with a "Clear examples" button. Fires `onboarding_aha_banner_viewed` once on mount; "Clear examples" calls `useClearSampleData` and fires `onboarding_aha_examples_cleared`; dismiss/clear both clear the pending flag.

- [ ] **Step 1: Write failing test** covering: (a) renders nothing with no pending goal; (b) renders copy + fires `onboarding_aha_banner_viewed {goal}` once when pending; (c) "Clear examples" calls clear mutation + fires `onboarding_aha_examples_cleared {goal}` + hides; (d) dismiss hides + clears flag without firing the cleared event. Mock `../../lib/analytics` `captureEvent`, `../../hooks/use-sample-data` (`useSampleDataStatus` → seeded true, `useClearSampleData` → `{ mutateAsync, isPending }`), and `../../hooks/use-session` (`{ orgId: "org_1" }`). Use `markAhaBannerPending("org_1","donors")` in setup.

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const captureEvent = vi.fn();
vi.mock("../../lib/analytics", () => ({ captureEvent: (...a: unknown[]) => captureEvent(...a) }));
const mutateAsync = vi.fn().mockResolvedValue(undefined);
vi.mock("../../hooks/use-sample-data", () => ({
  useSampleDataStatus: () => ({ data: { seeded: true }, isLoading: false }),
  useClearSampleData: () => ({ mutateAsync, isPending: false }),
}));
vi.mock("../../hooks/use-session", () => ({ useSession: () => ({ orgId: "org_1" }) }));

import { SampleDataAhaBanner } from "./sample-data-aha-banner";
import { markAhaBannerPending } from "../../lib/aha-banner";

beforeEach(() => {
  localStorage.clear();
  captureEvent.mockClear();
  mutateAsync.mockClear();
});
afterEach(() => localStorage.clear());

describe("SampleDataAhaBanner", () => {
  it("renders nothing without a pending goal", () => {
    const { container } = render(<SampleDataAhaBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows copy and fires viewed once", async () => {
    markAhaBannerPending("org_1", "donors");
    render(<SampleDataAhaBanner />);
    expect(await screen.findByText(/donor list/i)).toBeInTheDocument();
    await waitFor(() =>
      expect(captureEvent).toHaveBeenCalledWith("onboarding_aha_banner_viewed", { goal: "donors" }),
    );
    expect(
      captureEvent.mock.calls.filter((c) => c[0] === "onboarding_aha_banner_viewed"),
    ).toHaveLength(1);
  });

  it("clears examples", async () => {
    markAhaBannerPending("org_1", "grants");
    render(<SampleDataAhaBanner />);
    fireEvent.click(await screen.findByRole("button", { name: /clear examples/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(captureEvent).toHaveBeenCalledWith("onboarding_aha_examples_cleared", {
      goal: "grants",
    });
  });

  it("dismiss hides without firing cleared", async () => {
    markAhaBannerPending("org_1", "donors");
    render(<SampleDataAhaBanner />);
    fireEvent.click(await screen.findByRole("button", { name: /dismiss/i }));
    await waitFor(() => expect(screen.queryByText(/donor list/i)).not.toBeInTheDocument());
    expect(captureEvent).not.toHaveBeenCalledWith(
      "onboarding_aha_examples_cleared",
      expect.anything(),
    );
  });
});
```

- [ ] **Step 2: Run** — expect FAIL (module missing).

- [ ] **Step 3: Implement** `sample-data-aha-banner.tsx`. Use `useState` initialized from `readPendingAhaGoal(orgId)`; a `useEffect` (guarded by a ref so it fires once) fires `captureEvent(ANALYTICS_EVENTS.onboardingAhaBannerViewed, { goal })` when a goal is shown and sample data is seeded. Render only when `goal && status?.seeded`. Pill buttons (`rounded-full`), `role="status"`, body text ≥18px, dismiss button has `aria-label="Dismiss"`. "Clear examples" → `await clear.mutateAsync()` then `captureEvent(onboardingAhaExamplesCleared,{goal})`, then `clearAhaBannerPending(orgId)` + hide. Dismiss → `clearAhaBannerPending(orgId)` + hide. (Sentry on the clear mutation is already wired inside `useClearSampleData` via `captureQueryError`.)

- [ ] **Step 4: Run** — expect PASS.

- [ ] **Step 5: Commit** `feat(onboarding): calm sample-data aha banner`.

---

## Task 4: Mount the banner in the authenticated layout

**Files:**

- Modify: `apps/web/src/routes/_authenticated.tsx`

- [ ] **Step 1: Write failing test** — extend `_authenticated.test.tsx` (or add) asserting `SampleDataAhaBanner` renders inside the full shell branch. If the existing layout test harness is heavy, instead assert via an integration check that the import + element exist (the component self-suppresses, so a render with a pending flag shows it). Minimum: a test that the full-shell render includes the banner element when `markAhaBannerPending` is set. If the layout test is impractical, document that the component's own test (Task 3) covers behavior and this step only wires placement.

- [ ] **Step 2: Run** — expect FAIL or N/A per above.

- [ ] **Step 3: Implement** — import `SampleDataAhaBanner` and render it right above `<SampleDataBanner />` inside the main `AppShell` return (line ~390), so it appears on every authenticated content surface (the goal landing route is one of them):

```tsx
import { SampleDataAhaBanner } from "../components/onboarding/sample-data-aha-banner";
// ...
        <SampleDataAhaBanner />
        <SampleDataBanner />
        <Outlet />
```

- [ ] **Step 4: Run** web tests for the file — expect PASS.

- [ ] **Step 5: Commit** `feat(onboarding): surface aha banner in authenticated shell`.

---

## Task 5: Screen 2 — single org-name field, auto-detect timezone, default fiscal

**Files:**

- Modify: `apps/web/src/routes/_authenticated/onboarding.tsx`
- Test: `apps/web/src/routes/_authenticated/onboarding.test.tsx`

Remove the fiscal-year `Select` and the timezone `Select` from `StepOrgSetup`. Keep the org-name input. Compute timezone once via `Intl.DateTimeFormat().resolvedOptions().timeZone`, validate against `ORG_TIMEZONES`, fall back to `America/New_York`. Default `fiscalYearStartMonth` to `1`. Keep the authoritative PATCH sending `{ orgName, fiscalYearStartMonth, timezone, onboardingGoal }`. Fire `captureEvent(ANALYTICS_EVENTS.onboardingTimezoneAutodetected, { detected })` where `detected` is whether the browser value was in the allowed list.

- [ ] **Step 1: Write failing tests** in onboarding.test.tsx: (a) Step 2 shows the org-name field and shows NO "Fiscal year" and NO "Time zone" labels; (b) submitting Step 2 calls the PATCH with a valid `timezone` from `ORG_TIMEZONES` and `fiscalYearStartMonth: 1`; (c) `onboarding_timezone_autodetected` fired with `{ detected: boolean }`. Mock `Intl.DateTimeFormat` to return an allowed zone in one test and a junk zone in another (assert fallback `America/New_York` + `detected:false`).

- [ ] **Step 2: Run** `pnpm --filter @grantpipe/web test src/routes/_authenticated/onboarding.test.tsx` — expect FAIL.

- [ ] **Step 3: Implement** — add a helper near the top of onboarding.tsx:

```ts
import { ORG_TIMEZONES, type OrgTimezone } from "../../lib/timezones";

function detectTimezone(): { timezone: OrgTimezone; detected: boolean } {
  let raw = "";
  try {
    raw = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    raw = "";
  }
  const match = (ORG_TIMEZONES as readonly string[]).includes(raw);
  return { timezone: match ? (raw as OrgTimezone) : "America/New_York", detected: match };
}
```

In `StepOrgSetup`: delete the two `Select` blocks and their state; keep only the name input (large, ≥18px, label "What's your organization called?", helper "This is the name we'll put on your reports. You can change it later."). Add a quiet line "You can fine-tune fiscal year and time zone in Settings later." On Continue, call `detectTimezone()`, `captureEvent(onboardingTimezoneAutodetected, { detected })`, and PATCH `{ orgName, fiscalYearStartMonth: 1, timezone, onboardingGoal: goal ?? undefined }`. Remove now-unused fiscal/timezone imports.

- [ ] **Step 4: Run** the onboarding test — expect PASS. Then `turbo typecheck --filter=@grantpipe/web` to catch unused imports.

- [ ] **Step 5: Commit** `feat(onboarding): drop fiscal/timezone form, auto-detect timezone`.

---

## Task 6: Screen 3 — sample-data hero + set aha flag on seed

**Files:**

- Modify: `apps/web/src/routes/_authenticated/onboarding.tsx`
- Test: `apps/web/src/routes/_authenticated/onboarding.test.tsx`

Re-curate `StepGetData` so "Show me an example" (seed sample data) is the dominant, recommended path; "I'll add my own data" and "Import a spreadsheet" are quieter secondary options; "Do this later" stays quiet. On a successful seed, call `markAhaBannerPending(orgId, goal)` before navigating to `ahaRouteForGoal(goal)`.

- [ ] **Step 1: Write failing tests:** (a) the three options render with the sample-data option as the visually-primary (assert it is a primary `Button`, others `variant="outline"`/link); (b) choosing "Show me an example" seeds then calls `markAhaBannerPending` (assert via spying on localStorage key `gp:aha-banner:{orgId}` set to goal) and navigates to the goal route; (c) existing `onboarding_sample_data_chosen` / `onboarding_first_action_selected` still fire.

- [ ] **Step 2: Run** — expect FAIL.

- [ ] **Step 3: Implement** — import `markAhaBannerPending` from `../../lib/aha-banner`; in the seed success path (after `seed.mutateAsync()` resolves, before navigate) add `if (orgId && goal) markAhaBannerPending(orgId, goal);`. Restyle the three cards: sample-data as a single large primary pill CTA at top with a one-line benefit; the other two as a quieter row below. Keep all existing analytics calls.

- [ ] **Step 4: Run** the onboarding test — expect PASS.

- [ ] **Step 5: Commit** `feat(onboarding): sample-data hero + arm aha banner on seed`.

---

## Task 7: Screen 1 + global accessibility & copy gate

**Files:**

- Modify: `apps/web/src/components/onboarding/goal-step.tsx`
- Modify: `apps/web/src/routes/_authenticated/onboarding.tsx` (headings/body sizing)

- [ ] **Step 1:** Run the copy gate on every new/changed onboarding string (Screens 1–3 + aha banner copy in `aha-banner.ts`): `humanizer` then `third-grade-copy`, then zero-lies + fit-context check. Apply edits to the string literals.
- [ ] **Step 2:** Accessibility polish: onboarding body text ≥18px (`text-lg`+), headings ≥28px, line-height ≥1.5, single column, goal cards ≥44px effective target with clear selected ring, 4.5:1 contrast on helper/secondary text, buttons remain pills, `prefers-reduced-motion` respected on any transition. Keep "Step n of 3".
- [ ] **Step 3:** Run `pnpm --filter @grantpipe/web test src/routes/_authenticated/onboarding.test.tsx src/components/onboarding` — expect PASS.
- [ ] **Step 4: Commit** `style(onboarding): novice-friendly sizing + gated copy`.

---

## Task 8: Dashboard single-nudge — retire the floating overlay

**Files:**

- Modify: `apps/web/src/routes/_authenticated/dashboard.tsx`
- Remove: `apps/web/src/components/onboarding-overlay.tsx`, `apps/web/src/components/onboarding-overlay.test.tsx`
- Modify: `apps/web/src/routes/_authenticated/dashboard.test.tsx`

- [ ] **Step 1: Write/adjust failing test** — in dashboard.test.tsx, assert the "Your first 30 days" overlay text is NOT rendered (the inline checklist remains the single nudge). Remove obsolete overlay-present assertions.
- [ ] **Step 2: Run** dashboard test — expect FAIL (overlay still present).
- [ ] **Step 3: Implement** — remove `<OnboardingOverlay />` (dashboard.tsx ~1955) and its import; delete `onboarding-overlay.tsx` + its test. `grep` for any other importers and clean them.
- [ ] **Step 4: Run** `pnpm --filter @grantpipe/web test src/routes/_authenticated/dashboard.test.tsx` + `turbo typecheck --filter=@grantpipe/web` — expect PASS / no dangling refs.
- [ ] **Step 5: Commit** `feat(dashboard): retire floating onboarding overlay for single nudge`.

---

## Task 9: Full gate + browser verification

- [ ] **Step 1:** `turbo typecheck` then `turbo test --filter=@grantpipe/web --filter=@grantpipe/shared` (use `--force` after any merge). Confirm 95% per-file coverage on every touched file (`pnpm --filter @grantpipe/web test:coverage`).
- [ ] **Step 2:** Sub-agent code review of the full worktree diff; fix every finding.
- [ ] **Step 3:** Sub-agent UX critique against the spec's senior/novice criteria; fix findings.
- [ ] **Step 4:** Browser verification with preview tools: run the 3 screens as a new admin, confirm no timezone/fiscal questions, sample-data seed → land on goal route → aha banner appears → "Clear examples" works; confirm only one dashboard nudge. Capture a screenshot.
- [ ] **Step 5:** Merge to `master`, remove worktree, deploy `grantpipe-web` (api unchanged → skip). Update memory.

---

## Self-review

- **Spec coverage:** Screen 1 (Task 7) · Screen 2 single field + timezone auto-detect + default fiscal (Task 5) · Screen 3 hero (Task 6) · aha banner + Clear examples (Tasks 2–4, 6) · dashboard single nudge (Task 8) · a11y + copy gate (Task 7) · analytics events (Task 1) · Sentry via existing wrappers (Tasks 3/5 note) · tests (every task) · verify+deploy (Task 9). All 6 acceptance criteria mapped.
- **Placeholder scan:** none — code shown for each code step; Task 4 explicitly allows a wiring-only step because behavior is covered in Task 3.
- **Type consistency:** `markAhaBannerPending(orgId, goal)`, `readPendingAhaGoal(orgId)`, `clearAhaBannerPending(orgId)`, `ahaBannerCopy(goal)`, `detectTimezone()` used identically across tasks; event keys match Task 1 exactly.
