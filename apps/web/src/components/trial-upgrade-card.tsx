import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles, X } from "lucide-react";
import { Button, cn } from "@grantpipe/ui";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";
import { usePaywall } from "../hooks/use-paywall";
import { useSession } from "../hooks/use-session";
import { useTrialFeatureUsage } from "../hooks/use-trial-feature-usage";
import { captureEvent } from "../lib/analytics";

function dismissStorageKey(orgId: string) {
  return `gp-trial-upgrade-card-dismissed:${orgId}`;
}

function readDismissed(orgId: string | null): boolean {
  if (!orgId) return false;
  try {
    return localStorage.getItem(dismissStorageKey(orgId)) === "1";
  } catch {
    return false;
  }
}

function persistDismissed(orgId: string) {
  try {
    localStorage.setItem(dismissStorageKey(orgId), "1");
  } catch {
    // Best-effort; storage failures must never break the dashboard.
  }
}

export function TrialUpgradeCard() {
  const { state } = usePaywall();
  const { memberRole, onboardingCompleted, orgId } = useSession();
  const featureUsage = useTrialFeatureUsage();

  const [dismissed, setDismissed] = useState(() => readDismissed(orgId));
  // Reset dismissal when the active org changes (adjust state during render — no effect).
  const [trackedOrgId, setTrackedOrgId] = useState(orgId);
  if (orgId !== trackedOrgId) {
    setTrackedOrgId(orgId);
    setDismissed(readDismissed(orgId));
  }

  const usage = featureUsage.data;
  const hasActivation = usage ? usage.tiersUsed.length > 0 || usage.highestTier !== null : false;
  const highestTier = usage?.highestTier ?? null;

  const isTrialing = state?.allowed === true && state.status === "trialing";
  const isAdmin = memberRole === "admin";
  const visible = isTrialing && onboardingCompleted && isAdmin && hasActivation && !dismissed;

  const shownRef = useRef(false);
  useEffect(() => {
    if (visible && !shownRef.current) {
      shownRef.current = true;
      captureEvent(ANALYTICS_EVENTS.upgradePromptShown, {
        surface: "dashboard_card",
        plan_tier_used: highestTier,
      });
    }
  }, [visible, highestTier]);

  if (!visible) return null;

  function handleDismiss() {
    if (orgId) persistDismissed(orgId);
    setDismissed(true);
  }

  function handleUpgradeClick() {
    captureEvent(ANALYTICS_EVENTS.upgradeClicked, { surface: "dashboard_card" });
  }

  return (
    <section
      data-testid="trial-upgrade-card"
      aria-labelledby="trial-upgrade-card-heading"
      className="relative rounded-2xl border border-primary/25 bg-primary/5 p-5 shadow-sm"
    >
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss"
        className={cn(
          "absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-full",
          "text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        )}
      >
        <X className="size-4" aria-hidden />
      </button>

      <div className="flex items-start gap-3 pr-8">
        <span
          className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
          aria-hidden
        >
          <Sparkles className="size-4.5" />
        </span>
        <div className="space-y-1">
          <h2 id="trial-upgrade-card-heading" className="text-base font-semibold text-foreground">
            Pick the plan that fits
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            You are up and running. Choose the plan you want to keep when your trial ends.
          </p>
        </div>
      </div>

      <div className="mt-4 pl-12">
        <Button asChild className="rounded-full">
          <Link to="/settings" hash="billing" onClick={handleUpgradeClick}>
            See plans
          </Link>
        </Button>
      </div>
    </section>
  );
}
