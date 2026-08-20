import type { BillingCycle } from "./constants";

export type LaunchPromoCode = "M80OFF" | "Y80OFF";

export type LaunchPromo = {
  code: LaunchPromoCode;
  id: LaunchPromoCode;
  name: string;
  label: string;
  description: string;
  percentOff: 80;
  maxRedemptions: number;
  eligibleBillingCycles: readonly BillingCycle[];
  billingContext: string;
};

export type PromoKind = "discount";

export type Promo = {
  slug: string;
  name: string;
  kind: PromoKind;
  window: { startsAt?: string; endsAt?: string };
  discount: {
    kind: "percent" | "amount";
    value: number;
    appliesToCycle: "monthly" | "annual" | "both";
  };
  redemptionCaps?: Partial<Record<LaunchPromoCode, number>>;
  phases: readonly LaunchPromo[];
  bonuses?: readonly string[];
  addedSupport?: string | null;
  copy: {
    badge: string;
    headline: string;
    bannerEyebrow: string;
    bannerMessage: string;
    deadlineLine: string;
  };
};

export const LAUNCH_PROMO_PHASES = [
  {
    code: "M80OFF" as const,
    id: "M80OFF" as const,
    name: "Retired launch code - Monthly",
    percentOff: 80 as const,
    label: "Retired launch code",
    description: "Retired monthly launch code",
    maxRedemptions: 100,
    eligibleBillingCycles: ["monthly"] as const,
    billingContext: "for the first 12 months",
  },
  {
    code: "Y80OFF" as const,
    id: "Y80OFF" as const,
    name: "Retired launch code - Yearly",
    percentOff: 80 as const,
    label: "Retired launch code",
    description: "Retired annual launch code",
    maxRedemptions: 200,
    eligibleBillingCycles: ["annual"] as const,
    billingContext: "for the first year",
  },
] as const satisfies readonly LaunchPromo[];

// backward-compat alias
export const LAUNCH_PROMO: LaunchPromo = LAUNCH_PROMO_PHASES[0];

export function getLaunchPromoForBillingCycle(cycle: BillingCycle): LaunchPromo {
  return LAUNCH_PROMO_PHASES.find((promo) =>
    (promo.eligibleBillingCycles as readonly BillingCycle[]).includes(cycle),
  )!;
}

export function pickActiveLaunchPhase(
  redemptionsByCode: Partial<Record<LaunchPromoCode, number>>,
): LaunchPromo {
  for (const phase of LAUNCH_PROMO_PHASES) {
    const redeemed = redemptionsByCode[phase.code] ?? 0;
    if (redeemed < phase.maxRedemptions) return phase;
  }
  return LAUNCH_PROMO_PHASES[LAUNCH_PROMO_PHASES.length - 1]!;
}

export const LAUNCH_PROMO_DEADLINE_ISO = "2026-07-04T06:59:59.000Z";

export function getPromoDeadlineLabel(): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  }).format(new Date(LAUNCH_PROMO_DEADLINE_ISO));
}

export const PROMO_CATALOG: readonly Promo[] = [] as const;

export function isPromoWindowOpen(promo: Promo, now: Date = new Date()): boolean {
  const nowTime = now.getTime();
  if (promo.window.startsAt !== undefined) {
    if (nowTime < Date.parse(promo.window.startsAt)) return false;
  }
  if (promo.window.endsAt !== undefined) {
    if (nowTime > Date.parse(promo.window.endsAt)) return false;
  }
  return true;
}

export function getActivePromo(now: Date = new Date()): Promo | null {
  return PROMO_CATALOG.find((p) => isPromoWindowOpen(p, now)) ?? null;
}
