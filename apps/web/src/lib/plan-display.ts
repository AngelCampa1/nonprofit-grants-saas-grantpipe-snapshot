import {
  PLAN_CATALOG,
  PLAN_ENTITLEMENT_LABELS,
  PLAN_ENTITLEMENTS,
  formatCurrencyCents,
  getPlanPriceCents as getSharedPlanPriceCents,
  type BillingCycle,
  type PlanEntitlements,
  type PlanTier,
} from "@grantpipe/shared";

export type PlanDisplay = {
  name: string;
  monthlyCents?: number;
  annualCents?: number;
  description: string;
  features: readonly string[];
  highlighted: boolean;
};

export const PLAN_DISPLAY: Record<PlanTier, PlanDisplay> = Object.fromEntries(
  PLAN_CATALOG.map((plan) => [
    plan.tier,
    {
      name: plan.name,
      ...(plan.prices ? { monthlyCents: plan.prices.monthlyCents } : {}),
      ...(plan.prices ? { annualCents: plan.prices.annualCents } : {}),
      description: plan.description,
      features: plan.features,
      highlighted: plan.highlighted,
    },
  ]),
) as Record<PlanTier, PlanDisplay>;

export function formatPriceCents(cents: number, cycle: BillingCycle): string {
  const suffix = cycle === "annual" ? "/yr" : "/mo";
  return `${formatCurrencyCents(cents)}${suffix}`;
}

export function getPlanPriceCents(tier: PlanTier, cycle: BillingCycle): number {
  return getSharedPlanPriceCents(tier, cycle);
}

/**
 * Human-readable labels for every entitlement key on a plan. Used by the
 * settings billing panel to explain which features a tenant would lose when
 * downgrading from a higher trial tier.
 */
export const ENTITLEMENT_LABELS: Record<keyof PlanEntitlements, string> = PLAN_ENTITLEMENT_LABELS;

function formatGrantCap(cap: number): string {
  return Number.isFinite(cap) ? cap.toLocaleString("en-US") : "Unlimited";
}

/**
 * Returns human-readable labels for entitlements that exist on `higher` but
 * are missing or smaller on `lower`. Used to explain feature loss when a
 * trialing tenant downgrades from a higher tier they actively used.
 */
export function diffEntitlements(higher: PlanTier, lower: PlanTier): string[] {
  const higherEntitlements = PLAN_ENTITLEMENTS[higher];
  const lowerEntitlements = PLAN_ENTITLEMENTS[lower];
  const lost: string[] = [];

  for (const key of Object.keys(ENTITLEMENT_LABELS) as Array<keyof PlanEntitlements>) {
    if (key === "activeGrantCap") {
      const higherCap = higherEntitlements.activeGrantCap;
      const lowerCap = lowerEntitlements.activeGrantCap;
      if (higherCap > lowerCap) {
        lost.push(
          `Higher active grants cap (${formatGrantCap(lowerCap)} -> ${formatGrantCap(higherCap)})`,
        );
      }
      continue;
    }

    const higherValue = higherEntitlements[key];
    const lowerValue = lowerEntitlements[key];
    if (higherValue === true && lowerValue === false) {
      lost.push(ENTITLEMENT_LABELS[key]);
    }
  }

  return lost;
}
