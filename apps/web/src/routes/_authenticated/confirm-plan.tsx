import { createFileRoute, Link } from "@tanstack/react-router";
import { Alert, Button } from "@grantpipe/ui";
import { PLAN_LABELS, type BillingCycle, type PlanTier } from "@grantpipe/shared";
import React, { useMemo } from "react";
import { z } from "zod";

import { clearPendingPlan, readPendingPlan } from "../signup";

const searchSchema = z.object({
  checkout: z.enum(["cancelled"]).optional().catch(undefined),
});

export const Route = createFileRoute("/_authenticated/confirm-plan")({
  validateSearch: searchSchema,
  component: ConfirmPlanPage,
});

type PendingPlan = {
  planTier?: PlanTier;
  billingCycle?: BillingCycle;
};

export function ConfirmPlanPage() {
  const { checkout } = Route.useSearch();
  const pendingPlan = useMemo(() => readPendingPlan() as PendingPlan | null, []);

  return (
    <div className="flex min-h-screen items-start justify-center bg-background px-4 py-12 sm:py-16">
      <div className="w-full max-w-3xl space-y-8">
        <header className="text-center">
          <h1 className="font-heading text-3xl font-bold text-foreground sm:text-4xl">
            Your trial is active
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
            No credit card needed. Add billing anytime from the billing page.
          </p>
        </header>

        {checkout === "cancelled" ? (
          <Alert title="Checkout cancelled">
            Your trial is still active. You can add billing later from the billing page.
          </Alert>
        ) : null}

        <section className="rounded-2xl border border-border bg-card p-6 text-sm text-foreground">
          <p>
            {pendingPlan?.planTier ? (
              <>
                You&apos;re exploring <strong>{PLAN_LABELS[pendingPlan.planTier]}</strong>
                {pendingPlan.billingCycle ? ` on ${pendingPlan.billingCycle} billing` : ""}.
              </>
            ) : (
              <>You can keep exploring the product now and choose a paid plan later.</>
            )}
          </p>
        </section>

        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link to="/dashboard">
            <Button type="button" onClick={() => clearPendingPlan()}>
              Continue to dashboard
            </Button>
          </Link>
          <Link
            to="/settings"
            hash="billing"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Review billing options
          </Link>
        </div>
      </div>
    </div>
  );
}
