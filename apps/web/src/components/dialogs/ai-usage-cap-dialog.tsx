import { useEffect } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@grantpipe/ui";
import { useNavigate } from "@tanstack/react-router";
import { ANALYTICS_EVENTS, PLAN_LABELS, type AiUsageCapPayload } from "@grantpipe/shared";
import { captureEvent } from "../../lib/analytics";
import { captureAppException } from "../../lib/sentry";

interface AiUsageCapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payload: AiUsageCapPayload | null;
}

function getNextResetDate(): string {
  const now = new Date();
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(nextMonth);
}

export function AiUsageCapDialog({ open, onOpenChange, payload }: AiUsageCapDialogProps) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!open || !payload) return;
    try {
      captureEvent(ANALYTICS_EVENTS.aiUsageCapPromptViewed, {
        feature: payload.feature,
        plan: payload.currentPlan,
      });
    } catch (error) {
      captureAppException(error, {
        tags: { feature: "ai_usage_cap_dialog", operation: "analytics" },
      });
    }
  }, [open, payload]);

  if (!payload) {
    return <Dialog open={false} onOpenChange={onOpenChange} />;
  }

  const isAwardIntake = payload.feature === "award_intake";
  const title = isAwardIntake
    ? "You're out of AI intakes this month"
    : "You're out of AI questions this month";
  const nounPhrase = isAwardIntake ? "AI award intakes" : "AI ledger questions";
  const resetDate = getNextResetDate();

  const upgradePlanLabel =
    payload.upgradeToPlan !== null ? PLAN_LABELS[payload.upgradeToPlan] : null;

  function handleUpgradeClick() {
    try {
      captureEvent(ANALYTICS_EVENTS.aiUsageCapPromptClicked, {
        feature: payload!.feature,
        plan: payload!.currentPlan,
      });
    } catch (error) {
      captureAppException(error, {
        tags: { feature: "ai_usage_cap_dialog", operation: "analytics" },
      });
    }
    void navigate({ to: "/settings/billing" });
  }

  function handleDismiss() {
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {`You used all ${payload.cap} ${nounPhrase} this month. They reset on ${resetDate}.`}
            {upgradePlanLabel !== null
              ? ` Want more now? Upgrade to ${upgradePlanLabel} for unlimited AI.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex gap-2 justify-end">
          <Button variant="outline" className="rounded-full" onClick={handleDismiss}>
            Not now
          </Button>
          {upgradePlanLabel !== null ? (
            <Button className="rounded-full" onClick={handleUpgradeClick}>
              Get unlimited AI
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
