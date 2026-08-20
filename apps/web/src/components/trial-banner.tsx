import { Link } from "@tanstack/react-router";
import { AlertTriangle, Clock3 } from "lucide-react";
import { AttentionBanner, Button, cn } from "@grantpipe/ui";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";
import { usePaywall } from "../hooks/use-paywall";
import { captureEvent } from "../lib/analytics";

function getTrialUrgency(daysRemaining: number) {
  if (daysRemaining <= 1) return "critical";
  if (daysRemaining <= 7) return "elevated";
  return "normal";
}

function formatTrialTitle(daysRemaining: number) {
  if (daysRemaining <= 1) return "Trial ends tomorrow";
  return `Trial ends in ${daysRemaining} days`;
}

interface TrialBannerProps {
  canManageBilling?: boolean;
}

function formatTrialChipLabel(daysRemaining: number) {
  if (daysRemaining <= 1) return "Trial ends tomorrow";
  return `${daysRemaining}d`;
}

function trialChipClassName(urgency: ReturnType<typeof getTrialUrgency>) {
  return cn(
    "mr-2 inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium",
    "transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
    urgency === "normal" && "border-border bg-muted/65 text-muted-foreground hover:bg-muted",
    urgency === "elevated" &&
      "border-warning/35 bg-warning/15 text-warning-foreground hover:bg-warning/20",
    urgency === "critical" &&
      "border-warning/50 bg-warning/25 text-warning-foreground hover:bg-warning/30",
  );
}

export function TrialBanner({ canManageBilling = false }: TrialBannerProps) {
  const { state } = usePaywall();
  if (!state) return null;
  if (state.allowed && state.status === "active") return null;

  if (state.allowed && state.status === "trialing") {
    const urgency = getTrialUrgency(state.daysRemaining);
    const title = formatTrialTitle(state.daysRemaining);
    const chipLabel = formatTrialChipLabel(state.daysRemaining);
    const chipClassName = trialChipClassName(urgency);
    const content = (
      <>
        <Clock3 className="size-3.5" aria-hidden />
        {state.daysRemaining <= 1 ? (
          <span>{chipLabel}</span>
        ) : (
          <>
            <span>Trial</span>
            <span className="font-mono text-[11px] text-foreground">{chipLabel}</span>
          </>
        )}
      </>
    );

    if (canManageBilling) {
      return (
        <Link
          to="/settings"
          hash="billing"
          data-testid="trial-banner"
          data-urgency={urgency}
          aria-label={`Add billing, ${title.toLowerCase()}`}
          className={chipClassName}
          onClick={() => captureEvent(ANALYTICS_EVENTS.upgradeClicked, { surface: "topbar_chip" })}
        >
          {content}
        </Link>
      );
    }

    return (
      <div
        data-testid="trial-banner"
        data-urgency={urgency}
        role="status"
        aria-label={title}
        className={chipClassName}
      >
        {content}
      </div>
    );
  }

  const title =
    state.reason === "trial_expired"
      ? "Free trial ended"
      : state.reason === "subscription_canceled"
        ? "Subscription canceled"
        : "Billing action required";
  const message =
    state.reason === "trial_expired"
      ? "Choose a plan to keep using GrantPipe."
      : state.reason === "subscription_canceled"
        ? "Reactivate billing to restore access."
        : "Update billing to restore access.";

  return (
    <AttentionBanner
      data-testid="paywall-banner"
      variant="destructive"
      title={title}
      description={message}
      icon={<AlertTriangle className="size-4" aria-hidden />}
      className="border-b border-x-0 border-t-0"
      action={
        <Button asChild variant="destructive" size="sm" className="min-h-11 sm:min-h-8">
          <Link to="/settings" hash="billing">
            Restore access
          </Link>
        </Button>
      }
    />
  );
}
