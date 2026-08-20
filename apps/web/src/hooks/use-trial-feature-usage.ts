import { useQuery } from "@tanstack/react-query";
import { PLAN_TIERS, type PlanTier } from "@grantpipe/shared";

import { createOrgRequestInit } from "../lib/org-context";

export type TrialFeatureUsage = {
  highestTier: PlanTier | null;
  tiersUsed: PlanTier[];
};

type RawTrialFeatureUsage = {
  highestTier?: string | null;
  tiersUsed?: unknown;
};

function isPlanTier(value: unknown): value is PlanTier {
  return typeof value === "string" && (PLAN_TIERS as readonly string[]).includes(value);
}

function normalizeTrialFeatureUsage(payload: RawTrialFeatureUsage): TrialFeatureUsage {
  const tiersUsed: PlanTier[] = Array.isArray(payload.tiersUsed)
    ? payload.tiersUsed.filter(isPlanTier)
    : [];

  const highestTier = isPlanTier(payload.highestTier) ? payload.highestTier : null;

  return { highestTier, tiersUsed };
}

type QueryOptions = {
  enabled?: boolean;
  orgId?: string | null;
};

const TRIAL_FEATURE_USAGE_PATH = "/api/org/trial-feature-usage";

export function useTrialFeatureUsage(options: QueryOptions = {}) {
  return useQuery({
    queryKey: ["trial-feature-usage", options.orgId ?? null],
    enabled: options.enabled ?? true,
    queryFn: async (): Promise<TrialFeatureUsage> => {
      const response = await fetch(TRIAL_FEATURE_USAGE_PATH, createOrgRequestInit());
      if (!response.ok) {
        throw new Error(
          `Failed to load trial feature usage (status ${response.status.toString()})`,
        );
      }
      const payload = (await response.json()) as RawTrialFeatureUsage;
      return normalizeTrialFeatureUsage(payload);
    },
  });
}
