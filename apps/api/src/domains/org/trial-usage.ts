import { eq, sql } from "drizzle-orm";
import { orgTrialFeatureUsage, type Database } from "@grantpipe/db";
import { PLAN_TIERS, getPlanTierRank, type PlanTier } from "@grantpipe/shared";

/**
 * Tiers for which we record trial feature usage. "starter" is the default plan;
 * tracking starter accesses provides no signal because every trial org sits at
 * starter or above. We only care about which higher tiers were actually used.
 */
const TRACKED_TIERS: ReadonlySet<PlanTier> = new Set<PlanTier>([
  "growth",
  "audit_ready",
  "enterprise",
]);

export interface RecordTrialFeatureUsageParams {
  orgId: string;
  requiredTier: PlanTier;
}

/**
 * Record that an org accessed a tier-gated feature during its trial.
 *
 * UPSERT semantics: on first access for a (orgId, requiredTier) pair, inserts
 * a row with use_count=1. On subsequent accesses, increments use_count and
 * bumps last_used_at. Returns silently for "starter" — that tier is the trial
 * default and is not tracked.
 */
export async function recordTrialFeatureUsage(
  db: Database,
  params: RecordTrialFeatureUsageParams,
): Promise<void> {
  if (!TRACKED_TIERS.has(params.requiredTier)) {
    return;
  }
  const now = new Date();
  await db
    .insert(orgTrialFeatureUsage)
    .values({
      orgId: params.orgId,
      requiredTier: params.requiredTier,
      firstUsedAt: now,
      lastUsedAt: now,
      useCount: 1,
    })
    .onConflictDoUpdate({
      target: [orgTrialFeatureUsage.orgId, orgTrialFeatureUsage.requiredTier],
      set: {
        lastUsedAt: now,
        useCount: sql`${orgTrialFeatureUsage.useCount} + 1`,
      },
    });
}

export interface TrialFeatureUsageSummary {
  highestTier: PlanTier | null;
  tiersUsed: PlanTier[];
}

function isPlanTier(value: string): value is PlanTier {
  return (PLAN_TIERS as readonly string[]).includes(value);
}

/**
 * Return the highest tier the org has used during their trial along with the
 * full ordered list of tiers used.
 *
 * Used by the billing-time downgrade warning UI to surface "you used X
 * during your trial — this paid plan won't include it".
 */
export async function getTrialFeatureUsage(
  db: Database,
  orgId: string,
): Promise<TrialFeatureUsageSummary> {
  const rows = await db
    .select({ requiredTier: orgTrialFeatureUsage.requiredTier })
    .from(orgTrialFeatureUsage)
    .where(eq(orgTrialFeatureUsage.orgId, orgId));

  const tiers: PlanTier[] = [];
  for (const row of rows) {
    if (isPlanTier(row.requiredTier)) {
      tiers.push(row.requiredTier);
    }
  }
  tiers.sort((a, b) => getPlanTierRank(a) - getPlanTierRank(b));

  const lastTier = tiers[tiers.length - 1];
  if (lastTier === undefined) {
    return { highestTier: null, tiersUsed: [] };
  }
  return { highestTier: lastTier, tiersUsed: tiers };
}
