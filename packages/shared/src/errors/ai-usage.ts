import { PLAN_TIERS, PLAN_ENTITLEMENTS, type PlanTier } from "../constants";

export const AI_USAGE_CAP_REACHED = "ai_usage_cap_reached" as const;

export type AiCappedFeature = "award_intake" | "ask_your_ledger";

const CAP_FIELD: Record<AiCappedFeature, "awardIntakeMonthlyCap" | "askYourLedgerMonthlyCap"> = {
  award_intake: "awardIntakeMonthlyCap",
  ask_your_ledger: "askYourLedgerMonthlyCap",
};

export type AiUsageCapPayload = {
  error: typeof AI_USAGE_CAP_REACHED;
  feature: AiCappedFeature;
  cap: number;
  used: number;
  currentPlan: PlanTier;
  upgradeToPlan: PlanTier | null;
};

export function capForFeature(feature: AiCappedFeature, plan: PlanTier): number {
  return PLAN_ENTITLEMENTS[plan][CAP_FIELD[feature]];
}

export function nextPlanAboveCap(feature: AiCappedFeature, plan: PlanTier): PlanTier | null {
  const current = capForFeature(feature, plan);
  if (!Number.isFinite(current)) return null;
  const startIdx = PLAN_TIERS.indexOf(plan);
  for (let i = startIdx + 1; i < PLAN_TIERS.length; i++) {
    const tier = PLAN_TIERS[i]!;
    if (capForFeature(feature, tier) > current) return tier;
  }
  return null;
}
