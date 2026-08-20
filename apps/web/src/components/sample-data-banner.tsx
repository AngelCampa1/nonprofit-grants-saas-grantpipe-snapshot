import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@grantpipe/ui";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";
import type { OnboardingGoal } from "@grantpipe/shared";
import { useClearSampleData, useSampleDataStatus } from "../hooks/use-sample-data";
import { useSession } from "../hooks/use-session";
import { captureEvent } from "../lib/analytics";
import { ahaBannerCopy, clearAhaBannerPending, readPendingAhaGoal } from "../lib/aha-banner";

// One banner for all sample-data states. On the first view right after onboarding
// it shows the goal-aware "aha" copy (armed via markAhaBannerPending); once the
// user dismisses that emphasis it settles into a calm persistent reminder. The
// useClearSampleData hook owns the PostHog/Sentry instrumentation for the clear
// success/failure paths — this banner only adds the onboarding-specific aha
// view/clear events on top of it.

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

  // Only admin/editor can clear sample data — the same roles the API enforces with
  // requirePermission("donors", "edit"). Viewers and auditors still see the banner
  // so they know the records are examples, but without an action that would fail.
  const canRemove = memberRole === "admin" || memberRole === "editor";
  const message =
    ahaGoal !== null
      ? ahaBannerCopy(ahaGoal)
      : canRemove
        ? "You’re exploring sample data. Clear it anytime and add your own."
        : "You’re exploring sample data. An admin can clear it.";

  const dismissAha = () => {
    clearAhaBannerPending(orgId);
    setAhaGoal(null);
  };

  const handleClear = async () => {
    setHasError(false);
    // Scope the try to the mutation only. The clear failure path is what should
    // surface an error; the post-success analytics/localStorage calls below are
    // already exception-safe and must never render a false "that didn't work".
    // The hook's onError (use-sample-data) captures the real error to Sentry;
    // here we add the client-side PostHog failure event so it is visible in
    // analytics alongside the success event.
    try {
      await clear.mutateAsync();
    } catch {
      setHasError(true);
      captureEvent(
        ANALYTICS_EVENTS.onboardingAhaExamplesClearFailed,
        ahaGoal !== null ? { goal: ahaGoal } : undefined,
      );
      return;
    }

    if (ahaGoal !== null) {
      captureEvent(ANALYTICS_EVENTS.onboardingAhaExamplesCleared, { goal: ahaGoal });
    }
    clearAhaBannerPending(orgId);
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
              className="rounded-full border-warning/40 bg-warning/15 text-warning-foreground hover:bg-warning/25"
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
          That didn&rsquo;t work. Try again.
        </p>
      ) : null}
    </div>
  );
}
