import { and, eq, gte, count as drizzleCount, sql } from "drizzle-orm";
import { aiUsageEvents } from "@grantpipe/db";
import type { TransactionDatabase } from "@grantpipe/db";
import {
  AI_USAGE_CAP_REACHED,
  capForFeature,
  nextPlanAboveCap,
  type AiCappedFeature,
} from "@grantpipe/shared";
import type { PlanTier } from "@grantpipe/shared";
import { AppError } from "./app-error";

// ---------------------------------------------------------------------------
// monthStartUtc
// ---------------------------------------------------------------------------

/**
 * Returns the first instant of the UTC calendar month that contains `now`.
 * E.g. 2026-06-20T12:34:00Z → 2026-06-01T00:00:00.000Z
 */
export function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

// ---------------------------------------------------------------------------
// getMonthlyAiUsage
// ---------------------------------------------------------------------------

/**
 * Counts the number of AI usage events for the given org+feature within the
 * current UTC calendar month (i.e. createdAt >= monthStartUtc(now)).
 */
export async function getMonthlyAiUsage(
  db: TransactionDatabase,
  {
    orgId,
    feature,
    now,
  }: {
    orgId: string;
    feature: AiCappedFeature;
    now: Date;
  },
): Promise<number> {
  const rows = await db
    .select({ count: drizzleCount() })
    .from(aiUsageEvents)
    .where(
      and(
        eq(aiUsageEvents.orgId, orgId),
        eq(aiUsageEvents.feature, feature),
        gte(aiUsageEvents.createdAt, monthStartUtc(now)),
      ),
    );
  return Number(rows[0]?.count ?? 0);
}

/**
 * Serializes finite monthly quota decisions for one org and feature. This must
 * be called inside the same transaction that checks and records usage.
 */
export async function lockAiUsageQuota(
  db: TransactionDatabase,
  {
    orgId,
    feature,
    planTier,
    now,
  }: {
    orgId: string;
    feature: AiCappedFeature;
    planTier: PlanTier;
    now: Date;
  },
): Promise<void> {
  if (!Number.isFinite(capForFeature(feature, planTier))) return;

  const quotaKey = `${orgId}:${feature}:${monthStartUtc(now).toISOString()}`;
  await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${quotaKey}, 0))`);
}

// ---------------------------------------------------------------------------
// recordAiUsage
// ---------------------------------------------------------------------------

/**
 * Inserts a new AI usage event row.
 *
 * For award_intake, referenceId is set to the extractionId so that the
 * partial UNIQUE index on (org_id, feature, reference_id) provides natural
 * idempotency — if the same extraction is processed again, the duplicate-key
 * error is swallowed and the function resolves normally.
 *
 * For ask_your_ledger, referenceId is null (every call counts separately).
 */
export async function recordAiUsage(
  db: TransactionDatabase,
  {
    orgId,
    feature,
    referenceId,
    now,
  }: {
    orgId: string;
    feature: AiCappedFeature;
    referenceId?: string;
    now?: Date;
  },
): Promise<void> {
  try {
    await db.insert(aiUsageEvents).values({
      orgId,
      feature,
      referenceId: referenceId ?? null,
      createdAt: now ?? new Date(),
    });
  } catch (err: unknown) {
    // Swallow PostgreSQL unique-violation (23505) — idempotent dedupe for
    // award_intake retries that hit the partial unique index.
    if (isUniqueViolation(err)) {
      return;
    }
    throw err;
  }
}

function isUniqueViolation(err: unknown): boolean {
  if (err == null || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  if (e["code"] === "23505") return true;
  const msg = typeof e["message"] === "string" ? e["message"] : "";
  const causeMsg =
    e["cause"] != null &&
    typeof e["cause"] === "object" &&
    typeof (e["cause"] as Record<string, unknown>)["message"] === "string"
      ? ((e["cause"] as Record<string, unknown>)["message"] as string)
      : "";
  return msg.includes("duplicate key") || causeMsg.includes("duplicate key");
}

// ---------------------------------------------------------------------------
// assertAiUsageWithinCap
// ---------------------------------------------------------------------------

/**
 * Throws a 402 cap error if the org has reached or exceeded their monthly
 * AI usage cap for the given feature on their plan tier.
 *
 * For uncapped tiers (growth, audit_ready, enterprise) this is a no-op that
 * returns immediately without querying the database.
 */
export async function assertAiUsageWithinCap(
  db: TransactionDatabase,
  {
    orgId,
    feature,
    planTier,
    now,
  }: {
    orgId: string;
    feature: AiCappedFeature;
    planTier: PlanTier;
    now: Date;
  },
): Promise<void> {
  const cap = capForFeature(feature, planTier);

  // Uncapped tiers — skip the DB query entirely.
  if (!Number.isFinite(cap)) return;

  const used = await getMonthlyAiUsage(db, { orgId, feature, now });

  if (used >= cap) {
    throw new AppError(402, AI_USAGE_CAP_REACHED, AI_USAGE_CAP_REACHED, {
      feature,
      cap,
      used,
      currentPlan: planTier,
      upgradeToPlan: nextPlanAboveCap(feature, planTier),
    });
  }
}
