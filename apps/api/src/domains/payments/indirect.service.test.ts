import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Database } from "@grantpipe/db";

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn().mockResolvedValue(undefined),
}));

import { recordActivityLog } from "../../lib/activity-log";

function withTransaction<T extends object>(
  dbMock: T,
): T & { transaction: ReturnType<typeof vi.fn> } {
  const wrapped = {
    ...dbMock,
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(wrapped)),
  };
  return wrapped as T & { transaction: ReturnType<typeof vi.fn> };
}
import {
  listIndirectCostRules,
  createIndirectCostRule,
  updateIndirectCostRule,
  deleteIndirectCostRule,
  computeIndirectLine,
} from "./indirect.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRule(overrides: Record<string, unknown> = {}) {
  return {
    id: "rule-1",
    orgId: "org-1",
    grantId: null,
    base: "direct_costs",
    rateBasisPoints: 2000, // 20%
    effectiveFrom: new Date("2026-01-01"),
    effectiveTo: null,
    createdAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: "req-1",
    orgId: "org-1",
    grantId: "grant-1",
    requestNumber: 1,
    status: "draft",
    requestedAmountCents: 0,
    approvedAmountCents: 0,
    deletedAt: null,
    ...overrides,
  };
}

function makeDirectLine(amountCents: number, description = "Office supplies") {
  return {
    amountCents,
    description,
  };
}

// ---------------------------------------------------------------------------
// listIndirectCostRules
// ---------------------------------------------------------------------------

describe("listIndirectCostRules", () => {
  it("returns all rules for org when no grantId filter", async () => {
    const rule = makeRule();
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([rule]),
        }),
      }),
    } as unknown as Database;

    const result = await listIndirectCostRules(db, { orgId: "org-1" });
    expect(result).toEqual([rule]);
  });

  it("returns grant-specific and org-wide rules when grantId provided", async () => {
    const orgRule = makeRule({ grantId: null });
    const grantRule = makeRule({ id: "rule-2", grantId: "grant-1" });
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([orgRule, grantRule]),
        }),
      }),
    } as unknown as Database;

    const result = await listIndirectCostRules(db, { orgId: "org-1", grantId: "grant-1" });
    expect(result).toHaveLength(2);
  });

  it("returns empty array when no rules", async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
    } as unknown as Database;

    const result = await listIndirectCostRules(db, { orgId: "org-1" });
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// createIndirectCostRule
// ---------------------------------------------------------------------------

describe("createIndirectCostRule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects invalid input before writing a rule", async () => {
    const db = {
      insert: vi.fn(),
    } as unknown as Database;

    await expect(
      createIndirectCostRule(db, {
        orgId: "org-1",
        actorId: "user-1",
        data: {
          base: "direct_costs",
          rateBasisPoints: 0,
          effectiveFrom: "2026-01-01T00:00:00.000Z",
        },
      }),
    ).rejects.toThrow();

    expect(db.insert).not.toHaveBeenCalled();
    expect(recordActivityLog).not.toHaveBeenCalled();
  });

  it("creates an org-wide rule (no grantId)", async () => {
    const rule = makeRule();
    const db = withTransaction({
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([rule]),
        }),
      }),
    }) as unknown as Database;

    const result = await createIndirectCostRule(db, {
      orgId: "org-1",
      actorId: "user-1",
      data: {
        base: "direct_costs",
        rateBasisPoints: 2000,
        effectiveFrom: "2026-01-01T00:00:00.000Z",
      },
    });

    expect(result.rateBasisPoints).toBe(2000);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "created", entityType: "indirect_cost_rule" }),
    );
  });

  it("verifies grant exists when grantId provided", async () => {
    const db = {
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue(null) },
      },
    } as unknown as Database;

    await expect(
      createIndirectCostRule(db, {
        orgId: "org-1",
        actorId: "user-1",
        data: {
          grantId: "bad-grant",
          base: "direct_costs",
          rateBasisPoints: 1500,
          effectiveFrom: "2026-01-01T00:00:00.000Z",
        },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("creates a grant-specific rule when grant exists", async () => {
    const rule = makeRule({ grantId: "grant-1" });
    const db = withTransaction({
      query: {
        grants: { findFirst: vi.fn().mockResolvedValue({ id: "grant-1" }) },
      },
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([rule]),
        }),
      }),
    }) as unknown as Database;

    const result = await createIndirectCostRule(db, {
      orgId: "org-1",
      actorId: "user-1",
      data: {
        grantId: "grant-1",
        base: "direct_costs",
        rateBasisPoints: 2000,
        effectiveFrom: "2026-01-01T00:00:00.000Z",
      },
    });

    expect(result.grantId).toBe("grant-1");
  });

  it("throws internalError when insert returns nothing", async () => {
    const db = withTransaction({
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    }) as unknown as Database;

    await expect(
      createIndirectCostRule(db, {
        orgId: "org-1",
        actorId: "user-1",
        data: {
          base: "direct_costs",
          rateBasisPoints: 2000,
          effectiveFrom: "2026-01-01T00:00:00.000Z",
        },
      }),
    ).rejects.toMatchObject({ status: 500 });
  });
});

// ---------------------------------------------------------------------------
// updateIndirectCostRule
// ---------------------------------------------------------------------------

describe("updateIndirectCostRule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects invalid input before loading the rule", async () => {
    const findFirst = vi.fn();
    const db = {
      query: {
        grantIndirectCostRules: { findFirst },
      },
      update: vi.fn(),
    } as unknown as Database;

    await expect(
      updateIndirectCostRule(db, {
        orgId: "org-1",
        actorId: "user-1",
        ruleId: "rule-1",
        data: { rateBasisPoints: 0 },
      }),
    ).rejects.toThrow();

    expect(findFirst).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
    expect(recordActivityLog).not.toHaveBeenCalled();
  });

  it("updates an existing rule", async () => {
    const existing = makeRule();
    const updated = makeRule({ rateBasisPoints: 2500 });

    const db = withTransaction({
      query: {
        grantIndirectCostRules: { findFirst: vi.fn().mockResolvedValue(existing) },
      },
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updated]),
          }),
        }),
      }),
    }) as unknown as Database;

    const result = await updateIndirectCostRule(db, {
      orgId: "org-1",
      actorId: "user-1",
      ruleId: "rule-1",
      data: { rateBasisPoints: 2500 },
    });

    expect(result.rateBasisPoints).toBe(2500);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "updated" }),
    );
  });

  it("moves a rule only to a grant in the active entity", async () => {
    const updated = makeRule({ grantId: "grant-2" });
    const grantLookup = vi.fn().mockResolvedValue({ id: "grant-2" });
    const db = withTransaction({
      query: {
        grantIndirectCostRules: { findFirst: vi.fn().mockResolvedValue(makeRule()) },
        grants: { findFirst: grantLookup },
      },
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([updated]) }),
        }),
      }),
    }) as unknown as Database;

    const result = await updateIndirectCostRule(db, {
      orgId: "org-1",
      entityId: "entity-1",
      actorId: "user-1",
      ruleId: "rule-1",
      data: { grantId: "grant-2" },
    });

    expect(grantLookup).toHaveBeenCalledOnce();
    expect(result.grantId).toBe("grant-2");
  });

  it("throws notFound when rule not found", async () => {
    const db = {
      query: {
        grantIndirectCostRules: { findFirst: vi.fn().mockResolvedValue(null) },
      },
    } as unknown as Database;

    await expect(
      updateIndirectCostRule(db, {
        orgId: "org-1",
        actorId: "user-1",
        ruleId: "bad",
        data: { rateBasisPoints: 1000 },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws notFound when update returns nothing", async () => {
    const existing = makeRule();
    const db = withTransaction({
      query: {
        grantIndirectCostRules: { findFirst: vi.fn().mockResolvedValue(existing) },
      },
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    }) as unknown as Database;

    await expect(
      updateIndirectCostRule(db, {
        orgId: "org-1",
        actorId: "user-1",
        ruleId: "rule-1",
        data: { rateBasisPoints: 1000 },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("handles effectiveTo update", async () => {
    const existing = makeRule();
    const updated = makeRule({ effectiveTo: new Date("2026-12-31") });

    const db = withTransaction({
      query: {
        grantIndirectCostRules: { findFirst: vi.fn().mockResolvedValue(existing) },
      },
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updated]),
          }),
        }),
      }),
    }) as unknown as Database;

    const result = await updateIndirectCostRule(db, {
      orgId: "org-1",
      actorId: "user-1",
      ruleId: "rule-1",
      data: { effectiveTo: "2026-12-31T00:00:00.000Z" },
    });

    expect(result.effectiveTo).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// deleteIndirectCostRule
// ---------------------------------------------------------------------------

describe("deleteIndirectCostRule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("soft deletes a rule", async () => {
    const existing = makeRule();
    const db = withTransaction({
      query: {
        grantIndirectCostRules: { findFirst: vi.fn().mockResolvedValue(existing) },
      },
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    }) as unknown as Database;

    await deleteIndirectCostRule(db, { orgId: "org-1", actorId: "user-1", ruleId: "rule-1" });

    expect(db.update).toHaveBeenCalled();
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "deleted" }),
    );
  });

  it("throws notFound when rule not found", async () => {
    const db = {
      query: {
        grantIndirectCostRules: { findFirst: vi.fn().mockResolvedValue(null) },
      },
    } as unknown as Database;

    await expect(
      deleteIndirectCostRule(db, { orgId: "org-1", actorId: "user-1", ruleId: "bad" }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

// ---------------------------------------------------------------------------
// computeIndirectLine
// ---------------------------------------------------------------------------

describe("computeIndirectLine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no active rule found", async () => {
    const request = makeRequest();
    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      select: vi.fn().mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
    } as unknown as Database;

    const result = await computeIndirectLine(db, { orgId: "org-1", requestId: "req-1" });
    expect(result).toBeNull();
  });

  it("throws notFound when request not found", async () => {
    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(null) },
      },
    } as unknown as Database;

    await expect(
      computeIndirectLine(db, { orgId: "org-1", requestId: "bad" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("computes indirect amount using direct_costs base", async () => {
    const request = makeRequest();
    const rule = makeRule({ rateBasisPoints: 2000, base: "direct_costs" }); // 20%
    const lines = [makeDirectLine(10000, "Office supplies"), makeDirectLine(5000, "Travel")];

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([rule]),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(lines),
          }),
        }),
    } as unknown as Database;

    const result = await computeIndirectLine(db, { orgId: "org-1", requestId: "req-1" });

    expect(result).not.toBeNull();
    expect(result?.baseAmountCents).toBe(15000);
    expect(result?.indirectAmountCents).toBe(3000); // 15000 * 20% = 3000
    expect(result?.rateBasisPoints).toBe(2000);
  });

  it("computes indirect amount using salaries_only base", async () => {
    const request = makeRequest();
    const rule = makeRule({ rateBasisPoints: 1000, base: "salaries_only" }); // 10%
    const lines = [
      makeDirectLine(20000, "Executive Director salary"),
      makeDirectLine(10000, "Office supplies"),
    ];

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([rule]),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(lines),
          }),
        }),
    } as unknown as Database;

    const result = await computeIndirectLine(db, { orgId: "org-1", requestId: "req-1" });

    expect(result?.baseAmountCents).toBe(20000); // only salary line
    expect(result?.indirectAmountCents).toBe(2000); // 20000 * 10%
  });

  it("computes indirect amount using modified_total_direct base (excludes equipment)", async () => {
    const request = makeRequest();
    const rule = makeRule({ rateBasisPoints: 500, base: "modified_total_direct" }); // 5%
    const lines = [
      makeDirectLine(10000, "Staff training"),
      makeDirectLine(50000, "Equipment purchase"),
      makeDirectLine(5000, "Travel"),
    ];

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([rule]),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(lines),
          }),
        }),
    } as unknown as Database;

    const result = await computeIndirectLine(db, { orgId: "org-1", requestId: "req-1" });

    expect(result?.baseAmountCents).toBe(15000); // excludes equipment
    expect(result?.indirectAmountCents).toBe(750); // 15000 * 5%
  });

  it("prefers grant-specific rule over org-wide rule", async () => {
    const request = makeRequest();
    const orgRule = makeRule({ id: "rule-org", grantId: null, rateBasisPoints: 1000 });
    const grantRule = makeRule({ id: "rule-grant", grantId: "grant-1", rateBasisPoints: 3000 });

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([orgRule, grantRule]),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([makeDirectLine(10000)]),
          }),
        }),
    } as unknown as Database;

    const result = await computeIndirectLine(db, { orgId: "org-1", requestId: "req-1" });

    expect(result?.ruleId).toBe("rule-grant");
    expect(result?.rateBasisPoints).toBe(3000);
  });

  it("returns 0 indirect when no direct lines", async () => {
    const request = makeRequest();
    const rule = makeRule({ rateBasisPoints: 2000, base: "direct_costs" });

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([rule]),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
    } as unknown as Database;

    const result = await computeIndirectLine(db, { orgId: "org-1", requestId: "req-1" });

    expect(result?.baseAmountCents).toBe(0);
    expect(result?.indirectAmountCents).toBe(0);
  });

  it("handles capital exclusion in modified_total_direct", async () => {
    const request = makeRequest();
    const rule = makeRule({ rateBasisPoints: 1000, base: "modified_total_direct" });
    const lines = [
      makeDirectLine(20000, "Program staff"),
      makeDirectLine(100000, "Capital expenditure for building"),
    ];

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([rule]),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(lines),
          }),
        }),
    } as unknown as Database;

    const result = await computeIndirectLine(db, { orgId: "org-1", requestId: "req-1" });

    expect(result?.baseAmountCents).toBe(20000);
    expect(result?.indirectAmountCents).toBe(2000);
  });

  it("handles description-less lines in salaries_only base", async () => {
    const request = makeRequest();
    const rule = makeRule({ rateBasisPoints: 500, base: "salaries_only" });
    const lines = [makeDirectLine(10000, undefined as unknown as string)];

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([rule]),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(lines),
          }),
        }),
    } as unknown as Database;

    const result = await computeIndirectLine(db, { orgId: "org-1", requestId: "req-1" });

    // No salary keywords → base is 0
    expect(result?.baseAmountCents).toBe(0);
    expect(result?.indirectAmountCents).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeIndirectLine — additional branch coverage
// ---------------------------------------------------------------------------

describe("computeIndirectLine — sort and keyword branches", () => {
  it("prefers most recent effectiveFrom when two rules have same specificity", async () => {
    const request = makeRequest();
    // Two org-wide rules — older vs newer; newer should win
    const olderRule = makeRule({
      id: "rule-old",
      grantId: null,
      effectiveFrom: new Date("2024-01-01"),
      rateBasisPoints: 500,
    });
    const newerRule = makeRule({
      id: "rule-new",
      grantId: null,
      effectiveFrom: new Date("2026-01-01"),
      rateBasisPoints: 2500,
    });

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([olderRule, newerRule]),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ amountCents: 10000, description: "Supplies" }]),
          }),
        }),
    } as unknown as Database;

    const result = await computeIndirectLine(db, { orgId: "org-1", requestId: "req-1" });

    expect(result?.ruleId).toBe("rule-new");
    expect(result?.rateBasisPoints).toBe(2500);
  });

  it("handles effectiveFrom as ISO string in sort (not a Date instance)", async () => {
    const request = makeRequest();
    // Simulate DB returning effectiveFrom as a string (not a Date object)
    const rule1 = makeRule({
      id: "rule-a",
      grantId: null,
      effectiveFrom: "2025-01-01" as unknown as Date,
      rateBasisPoints: 1000,
    });
    const rule2 = makeRule({
      id: "rule-b",
      grantId: null,
      effectiveFrom: "2026-06-01" as unknown as Date,
      rateBasisPoints: 3000,
    });

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([rule1, rule2]),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ amountCents: 5000, description: "Consulting" }]),
          }),
        }),
    } as unknown as Database;

    const result = await computeIndirectLine(db, { orgId: "org-1", requestId: "req-1" });
    // rule-b has the later date, so it should be chosen
    expect(result?.ruleId).toBe("rule-b");
  });

  it("computes salaries_only using payroll keyword", async () => {
    const request = makeRequest();
    const rule = makeRule({ rateBasisPoints: 1000, base: "salaries_only" });
    const lines = [
      { amountCents: 20000, description: "Payroll — Q1" },
      { amountCents: 5000, description: "Travel" },
    ];

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([rule]),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(lines),
          }),
        }),
    } as unknown as Database;

    const result = await computeIndirectLine(db, { orgId: "org-1", requestId: "req-1" });
    expect(result?.baseAmountCents).toBe(20000);
  });

  it("computes salaries_only using compensation keyword", async () => {
    const request = makeRequest();
    const rule = makeRule({ rateBasisPoints: 1000, base: "salaries_only" });
    const lines = [
      { amountCents: 15000, description: "Staff Compensation Package" },
      { amountCents: 3000, description: "Supplies" },
    ];

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([rule]),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(lines),
          }),
        }),
    } as unknown as Database;

    const result = await computeIndirectLine(db, { orgId: "org-1", requestId: "req-1" });
    expect(result?.baseAmountCents).toBe(15000);
  });

  it("excludes capital keyword in modified_total_direct", async () => {
    const request = makeRequest();
    const rule = makeRule({ rateBasisPoints: 1000, base: "modified_total_direct" });
    const lines = [
      { amountCents: 30000, description: "Program staff salaries" },
      { amountCents: 50000, description: "Capital improvements" },
    ];

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([rule]),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(lines),
          }),
        }),
    } as unknown as Database;

    const result = await computeIndirectLine(db, { orgId: "org-1", requestId: "req-1" });
    // "capital" keyword should be excluded
    expect(result?.baseAmountCents).toBe(30000);
  });
});

describe("computeIndirectLine — two grant-specific rules (same specificity)", () => {
  it("picks the most recent when both rules are grant-specific", async () => {
    const request = makeRequest();
    // Both rules are grant-specific (grantId != null)
    const olderGrantRule = makeRule({
      id: "rule-grant-old",
      grantId: "grant-1",
      effectiveFrom: new Date("2024-06-01"),
      rateBasisPoints: 800,
    });
    const newerGrantRule = makeRule({
      id: "rule-grant-new",
      grantId: "grant-1",
      effectiveFrom: new Date("2026-01-01"),
      rateBasisPoints: 1500,
    });

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([olderGrantRule, newerGrantRule]),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ amountCents: 10000, description: "Consulting" }]),
          }),
        }),
    } as unknown as Database;

    const result = await computeIndirectLine(db, { orgId: "org-1", requestId: "req-1" });

    // Should pick the newer grant-specific rule
    expect(result?.ruleId).toBe("rule-grant-new");
    expect(result?.rateBasisPoints).toBe(1500);
  });
});

// ---------------------------------------------------------------------------
// updateIndirectCostRule — additional branch coverage
// ---------------------------------------------------------------------------

describe("updateIndirectCostRule — effectiveFrom and effectiveTo null branches", () => {
  it("updates effectiveFrom when provided", async () => {
    const existing = makeRule();
    const updated = makeRule({ effectiveFrom: new Date("2026-06-01") });

    const db = withTransaction({
      query: {
        grantIndirectCostRules: { findFirst: vi.fn().mockResolvedValue(existing) },
      },
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updated]),
          }),
        }),
      }),
    }) as unknown as Database;

    const result = await updateIndirectCostRule(db, {
      orgId: "org-1",
      actorId: "user-1",
      ruleId: "rule-1",
      data: { effectiveFrom: "2026-06-01T00:00:00.000Z" },
    });

    expect(result.effectiveFrom).toBeInstanceOf(Date);
  });

  it("sets effectiveTo to null when provided as null", async () => {
    const existing = makeRule({ effectiveTo: new Date("2026-12-31") });
    const updated = makeRule({ effectiveTo: null });

    const db = withTransaction({
      query: {
        grantIndirectCostRules: { findFirst: vi.fn().mockResolvedValue(existing) },
      },
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updated]),
          }),
        }),
      }),
    }) as unknown as Database;

    const result = await updateIndirectCostRule(db, {
      orgId: "org-1",
      actorId: "user-1",
      ruleId: "rule-1",
      data: { effectiveTo: undefined },
    });

    expect(result.effectiveTo).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createIndirectCostRule — effectiveTo provided (truthy branch)
// ---------------------------------------------------------------------------

describe("createIndirectCostRule — with effectiveTo provided", () => {
  it("stores effectiveTo as a Date when a date string is provided", async () => {
    const rule = makeRule({ effectiveTo: new Date("2026-12-31") });
    const db = withTransaction({
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([rule]),
        }),
      }),
    }) as unknown as Database;

    const result = await createIndirectCostRule(db, {
      orgId: "org-1",
      actorId: "user-1",
      data: {
        base: "direct_costs",
        rateBasisPoints: 2000,
        effectiveFrom: "2026-01-01T00:00:00.000Z",
        effectiveTo: "2026-12-31T00:00:00.000Z",
      },
    });

    expect(result.effectiveTo).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// updateIndirectCostRule — base provided (true branch at line 112)
// ---------------------------------------------------------------------------

describe("updateIndirectCostRule — base update", () => {
  it("updates base when provided", async () => {
    const existing = makeRule({ base: "direct_costs" });
    const updated = makeRule({ base: "salaries_only" });

    const db = withTransaction({
      query: {
        grantIndirectCostRules: { findFirst: vi.fn().mockResolvedValue(existing) },
      },
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updated]),
          }),
        }),
      }),
    }) as unknown as Database;

    const result = await updateIndirectCostRule(db, {
      orgId: "org-1",
      actorId: "user-1",
      ruleId: "rule-1",
      data: { base: "salaries_only" },
    });

    expect(result.base).toBe("salaries_only");
  });
});

// ---------------------------------------------------------------------------
// computeIndirectLine — null description triggers ?? "" fallback
// ---------------------------------------------------------------------------

describe("computeIndirectLine — null description in filters", () => {
  it("handles null description in salaries_only filter (not a salary match)", async () => {
    const request = makeRequest();
    const rule = makeRule({ rateBasisPoints: 1000, base: "salaries_only" });
    // description is explicitly null (not undefined) — exercises (l.description ?? "")
    const lines = [{ amountCents: 10000, description: null }];

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([rule]),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(lines),
          }),
        }),
    } as unknown as Database;

    const result = await computeIndirectLine(db, { orgId: "org-1", requestId: "req-1" });
    // null description → empty string → no keyword match → base is 0
    expect(result?.baseAmountCents).toBe(0);
  });

  it("handles null description in modified_total_direct filter (included, not excluded)", async () => {
    const request = makeRequest();
    const rule = makeRule({ rateBasisPoints: 1000, base: "modified_total_direct" });
    // description is explicitly null — exercises (l.description ?? "") in modified_total_direct
    const lines = [{ amountCents: 8000, description: null }];

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([rule]),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(lines),
          }),
        }),
    } as unknown as Database;

    const result = await computeIndirectLine(db, { orgId: "org-1", requestId: "req-1" });
    // null description → empty string → doesn't include "equipment" or "capital" → included
    expect(result?.baseAmountCents).toBe(8000);
  });
});

describe("computeIndirectLine — mixed salaries and non-salaries", () => {
  it("includes only salary-matched lines and excludes non-salary lines in salaries_only", async () => {
    const request = makeRequest();
    const rule = makeRule({ rateBasisPoints: 1000, base: "salaries_only" });
    const lines = [
      { amountCents: 10000, description: "Salary for outreach staff" },
      { amountCents: 5000, description: "Office Supplies" },
      { amountCents: 8000, description: "Payroll taxes" },
      { amountCents: 3000, description: "Benefits and compensation" },
      { amountCents: 2000, description: "Utilities" },
    ];

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([rule]),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(lines),
          }),
        }),
    } as unknown as Database;

    const result = await computeIndirectLine(db, { orgId: "org-1", requestId: "req-1" });
    // 10000 (salary) + 8000 (payroll) + 3000 (compensation) = 21000
    expect(result?.baseAmountCents).toBe(21000);
  });

  it("includes all lines except equipment and capital in modified_total_direct", async () => {
    const request = makeRequest();
    const rule = makeRule({ rateBasisPoints: 500, base: "modified_total_direct" });
    const lines = [
      { amountCents: 10000, description: "Program salaries" },
      { amountCents: 25000, description: "Equipment maintenance" },
      { amountCents: 50000, description: "Capital expenditure" },
      { amountCents: 3000, description: "Travel" },
    ];

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([rule]),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(lines),
          }),
        }),
    } as unknown as Database;

    const result = await computeIndirectLine(db, { orgId: "org-1", requestId: "req-1" });
    // Program salaries (10000) + Travel (3000) = 13000 (excludes equipment + capital)
    expect(result?.baseAmountCents).toBe(13000);
  });
});

describe("createIndirectCostRule — atomicity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs insert + log in one transaction (happy path)", async () => {
    const rule = makeRule();
    const db = withTransaction({
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([rule]),
        }),
      }),
    });

    const result = await createIndirectCostRule(db as unknown as Database, {
      orgId: "org-1",
      actorId: "user-1",
      data: {
        base: "direct_costs",
        rateBasisPoints: 2000,
        effectiveFrom: "2026-01-01T00:00:00.000Z",
      },
    });

    expect(db.transaction).toHaveBeenCalledOnce();
    expect(result.id).toBe("rule-1");
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "indirect_cost_rule", action: "created" }),
    );
  });

  it("rolls back when audit log fails", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const rule = makeRule();
    const db = withTransaction({
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([rule]),
        }),
      }),
    });

    await expect(
      createIndirectCostRule(db as unknown as Database, {
        orgId: "org-1",
        actorId: "user-1",
        data: {
          base: "direct_costs",
          rateBasisPoints: 2000,
          effectiveFrom: "2026-01-01T00:00:00.000Z",
        },
      }),
    ).rejects.toThrow("audit log down");
  });
});

describe("updateIndirectCostRule — atomicity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs update + log in one transaction (happy path)", async () => {
    const existing = makeRule();
    const updated = makeRule({ rateBasisPoints: 3000 });
    const db = withTransaction({
      query: { grantIndirectCostRules: { findFirst: vi.fn().mockResolvedValue(existing) } },
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updated]),
          }),
        }),
      }),
    });

    const result = await updateIndirectCostRule(db as unknown as Database, {
      orgId: "org-1",
      actorId: "user-1",
      ruleId: "rule-1",
      data: { rateBasisPoints: 3000 },
    });

    expect(db.transaction).toHaveBeenCalledOnce();
    expect(result.rateBasisPoints).toBe(3000);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "indirect_cost_rule", action: "updated" }),
    );
  });

  it("rolls back when audit log fails", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const existing = makeRule();
    const updated = makeRule({ rateBasisPoints: 3000 });
    const db = withTransaction({
      query: { grantIndirectCostRules: { findFirst: vi.fn().mockResolvedValue(existing) } },
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updated]),
          }),
        }),
      }),
    });

    await expect(
      updateIndirectCostRule(db as unknown as Database, {
        orgId: "org-1",
        actorId: "user-1",
        ruleId: "rule-1",
        data: { rateBasisPoints: 3000 },
      }),
    ).rejects.toThrow("audit log down");
  });
});

describe("deleteIndirectCostRule — atomicity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs soft-delete + log in one transaction (happy path)", async () => {
    const existing = makeRule();
    const db = withTransaction({
      query: { grantIndirectCostRules: { findFirst: vi.fn().mockResolvedValue(existing) } },
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    });

    await deleteIndirectCostRule(db as unknown as Database, {
      orgId: "org-1",
      actorId: "user-1",
      ruleId: "rule-1",
    });

    expect(db.transaction).toHaveBeenCalledOnce();
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "indirect_cost_rule", action: "deleted" }),
    );
  });

  it("rolls back when audit log fails", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const existing = makeRule();
    const db = withTransaction({
      query: { grantIndirectCostRules: { findFirst: vi.fn().mockResolvedValue(existing) } },
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    });

    await expect(
      deleteIndirectCostRule(db as unknown as Database, {
        orgId: "org-1",
        actorId: "user-1",
        ruleId: "rule-1",
      }),
    ).rejects.toThrow("audit log down");
  });
});
