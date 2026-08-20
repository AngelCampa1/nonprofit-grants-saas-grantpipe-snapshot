import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { recordTrialFeatureUsage, getTrialFeatureUsage } from "./trial-usage";

const trialUsageSource = readFileSync(
  join(process.cwd(), "src/domains/org/trial-usage.ts"),
  "utf8",
);

describe("trial usage pricing source contract", () => {
  it("uses shared plan helpers instead of local tier-order aliases", () => {
    expect(trialUsageSource).toContain("getPlanTierRank");
    expect(trialUsageSource).not.toContain("PLAN_TIER_ORDER");
  });
});

describe("recordTrialFeatureUsage", () => {
  it("returns early for starter tier without touching the db", async () => {
    const insert = vi.fn();
    const db = { insert } as never;

    await recordTrialFeatureUsage(db, { orgId: "org-1", requiredTier: "starter" });

    expect(insert).not.toHaveBeenCalled();
  });

  it("inserts with on-conflict update for growth tier", async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const insert = vi.fn().mockReturnValue({ values });
    const db = { insert } as never;

    await recordTrialFeatureUsage(db, { orgId: "org-1", requiredTier: "growth" });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledTimes(1);
    const valuesArg = values.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(valuesArg.orgId).toBe("org-1");
    expect(valuesArg.requiredTier).toBe("growth");
    expect(valuesArg.useCount).toBe(1);
    expect(valuesArg.firstUsedAt).toBeInstanceOf(Date);
    expect(valuesArg.lastUsedAt).toBeInstanceOf(Date);
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
    const conflictArg = onConflictDoUpdate.mock.calls[0]?.[0] as {
      target: unknown[];
      set: Record<string, unknown>;
    };
    expect(Array.isArray(conflictArg.target)).toBe(true);
    expect(conflictArg.target).toHaveLength(2);
    expect(conflictArg.set.lastUsedAt).toBeInstanceOf(Date);
    // useCount is bumped via a sql expression — should be a non-Date value
    expect(conflictArg.set.useCount).toBeDefined();
    expect(conflictArg.set.useCount).not.toBeInstanceOf(Date);
  });

  it("records audit_ready tier", async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const insert = vi.fn().mockReturnValue({ values });
    const db = { insert } as never;

    await recordTrialFeatureUsage(db, { orgId: "org-2", requiredTier: "audit_ready" });

    const valuesArg = values.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(valuesArg.requiredTier).toBe("audit_ready");
  });

  it("records enterprise tier", async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const insert = vi.fn().mockReturnValue({ values });
    const db = { insert } as never;

    await recordTrialFeatureUsage(db, { orgId: "org-3", requiredTier: "enterprise" });

    const valuesArg = values.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(valuesArg.requiredTier).toBe("enterprise");
  });
});

describe("getTrialFeatureUsage", () => {
  function dbWithRows(rows: Array<{ requiredTier: string }>) {
    const where = vi.fn().mockResolvedValue(rows);
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    return { select } as never;
  }

  it("returns null/empty when no usage rows exist", async () => {
    const db = dbWithRows([]);
    const result = await getTrialFeatureUsage(db, "org-1");
    expect(result).toEqual({ highestTier: null, tiersUsed: [] });
  });

  it("returns highestTier=growth when only growth used", async () => {
    const db = dbWithRows([{ requiredTier: "growth" }]);
    const result = await getTrialFeatureUsage(db, "org-1");
    expect(result.highestTier).toBe("growth");
    expect(result.tiersUsed).toEqual(["growth"]);
  });

  it("orders tiersUsed by the shared plan order and reports highest", async () => {
    const db = dbWithRows([
      { requiredTier: "audit_ready" },
      { requiredTier: "growth" },
      { requiredTier: "enterprise" },
    ]);
    const result = await getTrialFeatureUsage(db, "org-1");
    expect(result.tiersUsed).toEqual(["growth", "audit_ready", "enterprise"]);
    expect(result.highestTier).toBe("enterprise");
  });

  it("ignores rows with unknown tier strings", async () => {
    const db = dbWithRows([{ requiredTier: "growth" }, { requiredTier: "garbage_value" }]);
    const result = await getTrialFeatureUsage(db, "org-1");
    expect(result.tiersUsed).toEqual(["growth"]);
    expect(result.highestTier).toBe("growth");
  });

  it("returns null/empty when all rows have unknown tier strings", async () => {
    const db = dbWithRows([{ requiredTier: "garbage_value" }]);
    const result = await getTrialFeatureUsage(db, "org-1");
    expect(result).toEqual({ highestTier: null, tiersUsed: [] });
  });

  it("scopes the query by orgId via select->from->where chain", async () => {
    const where = vi.fn().mockResolvedValue([]);
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const db = { select } as never;

    await getTrialFeatureUsage(db, "org-42");

    expect(select).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledTimes(1);
  });
});
