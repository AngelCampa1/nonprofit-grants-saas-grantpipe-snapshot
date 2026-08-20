import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
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
  const { plan: planParam, cycle: cycleParam } = Route.useSearch();
  const [cycle, setCycle] = useState<BillingCycle>(() => normalizeCycle(cycleParam));
  const [error, setError] = useState<string | null>(null);
  const [pendingTier, setPendingTier] = useState<SelfServePlanTier | null>(null);

  // An explicit plan intent (e.g. from pricing or the billing page) means "I want to
  // buy this plan", not "let me pick a trial plan". Forward it to the billing page so
  // the user can add a card. The no-param case (the guard's plan-selection gate) falls
  // through to the trial picker below. Retired promo params are dropped so stale launch
  // links cannot reach checkout.
  const hasBillingIntent = typeof planParam === "string" && planParam.length > 0;

  useEffect(() => {
    if (!hasBillingIntent) return;
    void navigate({
      to: "/settings",
      hash: "billing",
      search: { plan: planParam, cycle: cycleParam } as never,
      replace: true,
    });
  }, [hasBillingIntent, planParam, cycleParam, navigate]);

  const plans = getSelfServePlans();

  async function choosePlan(planTier: SelfServePlanTier) {
    setError(null);
    setPendingTier(planTier);
    try {
      await saveBillingSelection.mutateAsync({ planTier, billingCycle: cycle });
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

  if (hasBillingIntent) {
    return (
      <div
        data-testid="select-plan-redirecting"
        role="status"
        aria-live="polite"
        className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center"
      >
        <Loader2 aria-hidden className="size-6 animate-spin text-muted-foreground" />
        <p className="text-base text-muted-foreground">Taking you to billing…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-background px-4 py-12 sm:py-16">
      <div className="w-full max-w-3xl space-y-8">
        <header className="space-y-3 text-center">
          <span className="mx-auto inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
            <CheckCircle2 aria-hidden className="size-4" />
            No credit card required
          </span>
          <h1 className="font-heading text-3xl font-bold text-foreground sm:text-4xl">
            Try any plan free for a month
          </h1>
          <p className="mx-auto max-w-xl text-lg leading-relaxed text-muted-foreground">
            You won&apos;t pay today. We don&apos;t ask for a card now. Change or cancel anytime.
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
          <p className="text-sm text-muted-foreground">
            This sets the price after your free month.
          </p>
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
                  <p className="text-sm font-semibold text-primary">Free for 1 month</p>
                  <p className="text-2xl font-bold text-foreground">then {price.price}</p>
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

        <p className="text-center text-sm text-muted-foreground">
          No card needed to start. Add billing later when you&apos;re ready.
        </p>
      </div>
    </div>
  );
}
