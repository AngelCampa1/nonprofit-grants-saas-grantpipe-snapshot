import { Link } from "@tanstack/react-router";
import {
  DEFAULT_BILLING_CYCLE,
  GRANTPIPE_GUARANTEE_COPY,
  PLAN_LABELS,
  PLAN_TIERS,
  formatCurrencyCents,
  getPricingPlan,
  isPlanTierAtLeast,
  isSelfServePlan,
  FOUNDER_CONTACT_EMAIL,
  FOUNDER_LINKEDIN_URL,
  FOUNDER_BOOKING_URLS,
  type BillingCycle,
  type PlanTier,
  type SelfServePlanTier,
} from "@grantpipe/shared";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Separator,
} from "@grantpipe/ui";

import { useOrgBilling, useOrgSettingsMutations } from "../hooks/use-org-settings";
import { useSession } from "../hooks/use-session";
import { useTrialFeatureUsage } from "../hooks/use-trial-feature-usage";
import { diffEntitlements, formatPriceCents, PLAN_DISPLAY } from "../lib/plan-display";
import { isAllowedBillingUrl } from "../lib/billing-redirect";
import { clearPendingPlan, readPendingPlan } from "../routes/signup";
import { captureEvent } from "../lib/analytics";
import { captureAppException } from "../lib/sentry";

type PendingPlan = {
  planTier?: PlanTier;
  billingCycle?: BillingCycle;
  promoCode?: string;
};

export type BillingPanelSearch = {
  checkout?: string;
  cycle?: string;
  plan?: string;
  portal?: string;
  promo?: string;
};

type SettingsBillingPanelProps = {
  search?: BillingPanelSearch;
  showBackLink?: boolean;
};

type BillingPriceDisplay = {
  amount: string;
  detail: string;
};

const SELF_SERVE_BILLING_TIERS = PLAN_TIERS.filter(isSelfServePlan);

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function normalizePlanTier(value?: string | null): PlanTier {
  return value === "starter" ||
    value === "growth" ||
    value === "audit_ready" ||
    value === "enterprise"
    ? value
    : "starter";
}

function isSearchPlanTier(value?: string | null): value is PlanTier {
  return PLAN_TIERS.some((tier) => tier === value);
}

function isSearchBillingCycle(value?: string | null): value is BillingCycle {
  return value === "monthly" || value === "annual";
}

function getPendingPlanFromSearch(search: BillingPanelSearch): PendingPlan | null {
  const pendingPlan: PendingPlan = {};

  if (isSearchPlanTier(search.plan)) {
    pendingPlan.planTier = search.plan;
  }

  if (isSearchBillingCycle(search.cycle)) {
    pendingPlan.billingCycle = search.cycle;
  }

  const promoCode = search.promo?.trim().toUpperCase();
  if (promoCode) {
    pendingPlan.promoCode = promoCode;
  }

  return Object.keys(pendingPlan).length > 0 ? pendingPlan : null;
}

function formatBillingPlanPrice(tier: PlanTier, cycle: BillingCycle): BillingPriceDisplay {
  const prices = getPricingPlan(tier).prices;
  if (!prices) {
    return {
      amount: "Contact founder",
      detail: "Custom billing.",
    };
  }

  if (cycle === "annual") {
    return {
      amount: `${formatCurrencyCents(prices.annualMonthlyEquivalentCents)}/mo`,
      detail: `Billed annually at ${formatCurrencyCents(prices.annualCents)}/yr. 20% off monthly.`,
    };
  }

  return {
    amount: formatPriceCents(prices.monthlyCents, cycle),
    detail: "Billed monthly.",
  };
}

export function SettingsBillingPanel({
  search = {},
  showBackLink = false,
}: SettingsBillingPanelProps) {
  const { cycle: searchCycle, plan: searchPlan, promo: searchPromo } = search;
  const { memberRole, orgId } = useSession();
  const billing = useOrgBilling({ enabled: memberRole === "admin" });
  const trialFeatureUsage = useTrialFeatureUsage({
    enabled: memberRole === "admin",
    orgId,
  });
  const { saveBillingSelection, startCheckout, openPortal } = useOrgSettingsMutations();
  const [pendingPlan, setPendingPlan] = useState<PendingPlan | null>(
    () => getPendingPlanFromSearch(search) ?? (readPendingPlan() as PendingPlan | null),
  );
  const [selectedPlan, setSelectedPlan] = useState<PlanTier>("starter");
  const [selectedCycle, setSelectedCycle] = useState<BillingCycle>(DEFAULT_BILLING_CYCLE);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [warningOpen, setWarningOpen] = useState(false);

  useEffect(() => {
    const directPendingPlan = getPendingPlanFromSearch({
      cycle: searchCycle,
      plan: searchPlan,
      promo: searchPromo,
    });
    if (directPendingPlan) {
      setPendingPlan(directPendingPlan);
    }
  }, [searchCycle, searchPlan, searchPromo]);

  useEffect(() => {
    if (!billing.data) {
      return;
    }

    const shouldUsePendingPlan =
      billing.data.status === "trialing" &&
      billing.data.subscriptionId == null &&
      pendingPlan != null;

    const trialAutoSuggestTier =
      billing.data.status === "trialing" &&
      billing.data.subscriptionId == null &&
      pendingPlan == null &&
      trialFeatureUsage.data?.highestTier
        ? trialFeatureUsage.data.highestTier
        : null;

    setSelectedPlan(
      shouldUsePendingPlan && pendingPlan.planTier
        ? pendingPlan.planTier
        : (trialAutoSuggestTier ?? normalizePlanTier(billing.data.planTier)),
    );
    setSelectedCycle(
      shouldUsePendingPlan && pendingPlan.billingCycle
        ? pendingPlan.billingCycle
        : (billing.data.billingCycle ?? DEFAULT_BILLING_CYCLE),
    );
  }, [billing.data, pendingPlan, trialFeatureUsage.data?.highestTier]);

  const billingSummary = billing.data;
  const isTrialing = billingSummary?.status === "trialing";
  const highestTrialTier = trialFeatureUsage.data?.highestTier ?? null;

  const featuresLost = useMemo<string[]>(() => {
    if (!highestTrialTier) return [];
    if (isPlanTierAtLeast(selectedPlan, highestTrialTier)) return [];
    return diffEntitlements(highestTrialTier, selectedPlan);
  }, [highestTrialTier, selectedPlan]);

  const shouldShowDowngradeWarning = isTrialing && featuresLost.length > 0;

  async function handleBillingRedirect(mutation: () => Promise<{ url?: string | null }>) {
    try {
      const result = await mutation();
      if (!result.url) {
        throw new Error("Billing redirect URL was not returned.");
      }
      if (!isAllowedBillingUrl(result.url)) {
        throw new Error("Billing redirect URL is not trusted.");
      }

      setBillingError(null);
      window.location.assign(result.url);
    } catch (error) {
      setBillingError(getErrorMessage(error));
      captureAppException(
        error,
        {
          tags: { feature: "billing", operation: "redirect" },
        },
        { sanitize: true },
      );
    }
  }

  async function persistSelection() {
    await saveBillingSelection.mutateAsync({
      planTier: selectedPlan as SelfServePlanTier,
      billingCycle: selectedCycle,
    });
    clearPendingPlan();
    setPendingPlan(null);
  }

  async function fireCheckout(planTier: PlanTier) {
    await handleBillingRedirect(async () => {
      return startCheckout.mutateAsync({
        planTier: planTier as SelfServePlanTier,
        billingCycle: selectedCycle,
        promoCode: undefined,
      });
    });
  }

  function handlePrimaryClick() {
    if (shouldShowDowngradeWarning) {
      setWarningOpen(true);
      return;
    }
    void fireCheckout(selectedPlan);
  }

  const canOpenPortal =
    billingSummary?.customerId != null || billingSummary?.subscriptionId != null;
  const trialDaysRemaining = billingSummary?.trialEndsAt
    ? Math.max(
        0,
        Math.ceil(
          (new Date(billingSummary.trialEndsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
        ),
      )
    : null;
  const selectedPriceDisplay = formatBillingPlanPrice(selectedPlan, selectedCycle);
  const selectedPlanFeatures = PLAN_DISPLAY[selectedPlan].features;

  if (memberRole !== "admin") {
    return (
      <section aria-labelledby="section-billing">
        <h2 id="section-billing" className="font-heading text-base font-semibold text-foreground">
          Billing
        </h2>
        <Separator className="mb-6 mt-2" />
        <Alert>Ask an organization admin to manage billing for this workspace.</Alert>
      </section>
    );
  }

  return (
    <section aria-labelledby="section-billing">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="section-billing" className="font-heading text-base font-semibold text-foreground">
            Billing
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a plan. Add billing details when you are ready.
          </p>
        </div>
        {showBackLink ? (
          <Button asChild variant="outline">
            <Link to="/settings" hash="billing">
              Back to settings
            </Link>
          </Button>
        ) : null}
      </div>

      <Separator className="mb-6 mt-4" />

      {search.checkout === "success" ? (
        <Alert variant="success" className="mb-4">
          Billing details added successfully.
        </Alert>
      ) : null}
      {search.checkout === "cancel" ? (
        <Alert className="mb-4">
          Checkout was canceled. Your saved plan selection is unchanged.
        </Alert>
      ) : null}
      {search.portal ? <Alert className="mb-4">Stripe billing portal opened.</Alert> : null}

      {billing.isLoading ? <Alert>Loading billing details…</Alert> : null}
      {billing.isError ? (
        <Alert variant="destructive" title="Unable to load billing details.">
          {getErrorMessage(billing.error)}
        </Alert>
      ) : null}

      {!billing.isLoading && !billing.isError && billingSummary ? (
        <>
          {isTrialing && trialDaysRemaining !== null ? (
            <p className="mb-4 text-sm text-muted-foreground" data-testid="billing-trial-countdown">
              {trialDaysRemaining} {trialDaysRemaining === 1 ? "day" : "days"} left in your free
              trial.
            </p>
          ) : null}

          <div className="mb-6 max-w-sm">
            <Label className="text-sm font-medium">Billing cycle</Label>
            <div
              className="mt-2 grid grid-cols-2 gap-2"
              role="radiogroup"
              aria-label="Billing cycle"
            >
              {(["monthly", "annual"] as const).map((cycle) => (
                // Raw <button> to avoid Button's pill defaults (h-9, whitespace-nowrap,
                // items-center justify-center, text-sm) fighting our toggle styling.
                <button
                  key={cycle}
                  type="button"
                  role="radio"
                  aria-checked={selectedCycle === cycle}
                  data-testid={`billing-cycle-${cycle}`}
                  onClick={() => setSelectedCycle(cycle)}
                  className={`inline-flex items-center justify-center rounded-full border px-4 py-2 text-sm font-medium transition outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                    selectedCycle === cycle
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {cycle === "annual" ? "Annual" : "Monthly"}
                </button>
              ))}
            </div>
          </div>

          <div
            className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
            role="radiogroup"
            aria-label="Plan tier"
          >
            {SELF_SERVE_BILLING_TIERS.map((tier) => {
              const display = PLAN_DISPLAY[tier];
              const pricing = getPricingPlan(tier);
              const selected = selectedPlan === tier;
              const priceDisplay = formatBillingPlanPrice(tier, selectedCycle);

              const handleSelect = () => setSelectedPlan(tier);

              return (
                <div
                  key={tier}
                  role="radio"
                  tabIndex={selected ? 0 : -1}
                  aria-checked={selected}
                  data-testid={`billing-plan-${tier}`}
                  onClick={handleSelect}
                  onKeyDown={(event) => {
                    if (event.key === " " || event.key === "Enter") {
                      event.preventDefault();
                      handleSelect();
                    }
                  }}
                  className={`flex h-full cursor-pointer flex-col rounded-2xl border p-6 text-left transition outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                    selected
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border bg-card hover:border-primary/40 hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-heading text-lg font-semibold text-foreground">
                        {display.name}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        {display.description}
                      </p>
                    </div>
                    {selected ? (
                      <span className="shrink-0 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
                        Selected
                      </span>
                    ) : highestTrialTier === tier && isTrialing ? (
                      <span
                        className="shrink-0 rounded-full bg-warning/15 px-2.5 py-1 text-xs font-semibold text-warning-foreground"
                        data-testid={`billing-plan-${tier}-recommended`}
                      >
                        Recommended
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-5 font-heading text-3xl font-semibold tracking-tight text-foreground">
                    {priceDisplay.amount}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{priceDisplay.detail}</p>
                  <p className="mt-4 text-xs font-medium uppercase tracking-caps text-muted-foreground">
                    Who it fits
                  </p>
                  <p className="mt-1 text-sm text-foreground">{pricing.bestFit}</p>
                  <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
                    {display.features.map((feature) => (
                      <li key={feature} className="flex gap-2">
                        <span
                          aria-hidden="true"
                          className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/60"
                        />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          <div
            className="mt-4 flex flex-col gap-4 rounded-2xl border border-border bg-muted/30 p-5 sm:flex-row sm:items-center sm:justify-between"
            data-testid="billing-enterprise-custom-path"
          >
            <div>
              <h3 className="font-heading text-base font-semibold text-foreground">
                Need a custom path?
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                For larger teams or unusual grant work, email Angel or connect on LinkedIn.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <a
                href={`mailto:${FOUNDER_CONTACT_EMAIL}`}
                className="inline-flex min-h-10 items-center justify-center rounded-full border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:border-primary/40 hover:text-primary"
              >
                Email Angel
              </a>
              <a
                href={FOUNDER_LINKEDIN_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center justify-center rounded-full border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:border-primary/40 hover:text-primary"
              >
                LinkedIn
              </a>
              <a
                href={FOUNDER_BOOKING_URLS.discoveryCall}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center justify-center rounded-full border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:border-primary/40 hover:text-primary"
              >
                Book a 30-min call
              </a>
            </div>
          </div>

          <div className="mt-8 rounded-2xl border border-border bg-muted/30 p-6">
            <p className="text-sm text-muted-foreground">You&apos;re picking</p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {PLAN_LABELS[selectedPlan]} - {selectedCycle === "annual" ? "Annual" : "Monthly"}{" "}
              billing - {selectedPriceDisplay.amount}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{selectedPriceDisplay.detail}</p>
            <p className="mt-4 text-sm font-medium text-foreground">This plan includes:</p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {selectedPlanFeatures.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>

            {shouldShowDowngradeWarning && highestTrialTier ? (
              <Alert variant="warning" className="mt-4" data-testid="billing-downgrade-callout">
                <p className="text-sm font-semibold">
                  Your team used {PLAN_LABELS[highestTrialTier]} features during the trial.
                </p>
                <p className="mt-1 text-sm">
                  If you pick {PLAN_LABELS[selectedPlan]}, you&apos;ll lose:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {featuresLost.map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
              </Alert>
            ) : null}
          </div>

          {billingError ? (
            <Alert variant="destructive" className="mt-4">
              {billingError}
            </Alert>
          ) : null}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            {isSelfServePlan(selectedPlan) ? (
              <Button
                type="button"
                className="w-full sm:w-auto"
                disabled={saveBillingSelection.isPending || startCheckout.isPending}
                onClick={handlePrimaryClick}
              >
                {isTrialing
                  ? `Add billing details for ${PLAN_LABELS[selectedPlan]}`
                  : `Update billing for ${PLAN_LABELS[selectedPlan]}`}
              </Button>
            ) : (
              <Button asChild className="w-full sm:w-auto">
                <a
                  href={FOUNDER_BOOKING_URLS.discoveryCall}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Contact founder
                </a>
              </Button>
            )}
            {canOpenPortal ? (
              <Button
                type="button"
                className="w-full sm:w-auto"
                variant="outline"
                disabled={saveBillingSelection.isPending || openPortal.isPending}
                onClick={() => {
                  captureEvent("cancellation_started", { source: "billing_portal" });
                  void handleBillingRedirect(async () => {
                    return openPortal.mutateAsync({ returnPath: "/settings#billing" });
                  });
                }}
              >
                Open portal
              </Button>
            ) : null}
            <Button
              type="button"
              className="w-full sm:w-auto"
              variant="ghost"
              disabled={saveBillingSelection.isPending || !isSelfServePlan(selectedPlan)}
              onClick={async () => {
                try {
                  await persistSelection();
                  setBillingError(null);
                } catch (error) {
                  setBillingError(getErrorMessage(error));
                }
              }}
            >
              {isSelfServePlan(selectedPlan) ? "Save selection" : "Contact founder"}
            </Button>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">{GRANTPIPE_GUARANTEE_COPY}</p>

          {highestTrialTier && featuresLost.length > 0 ? (
            <Dialog open={warningOpen} onOpenChange={setWarningOpen}>
              <DialogContent data-testid="billing-downgrade-modal">
                <DialogHeader>
                  <DialogTitle>
                    You&apos;re about to lose access to higher-tier features
                  </DialogTitle>
                  <DialogDescription>
                    Your team used {PLAN_LABELS[highestTrialTier]} features during the trial.
                    Switching to {PLAN_LABELS[selectedPlan]} will turn these off:
                  </DialogDescription>
                </DialogHeader>
                <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
                  {featuresLost.map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setWarningOpen(false);
                      void fireCheckout(selectedPlan);
                    }}
                  >
                    Continue with {PLAN_LABELS[selectedPlan]}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      setSelectedPlan(highestTrialTier);
                      setWarningOpen(false);
                      void fireCheckout(highestTrialTier);
                    }}
                  >
                    Upgrade to {PLAN_LABELS[highestTrialTier]}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
