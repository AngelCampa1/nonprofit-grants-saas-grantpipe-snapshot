import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@grantpipe/db";
import { computeIndirectLine } from "./indirect.service";
import { evaluateUniformGuidanceCostGuardrails } from "./ug-guardrails.service";

vi.mock("./indirect.service", () => ({
  computeIndirectLine: vi.fn(),
}));

function makeDb(overrides: Record<string, unknown> = {}) {
  return {
    query: {
      grantPaymentRequests: {
        findFirst: vi.fn().mockResolvedValue({
          id: "req-1",
          orgId: "org-1",
          grantId: "grant-1",
          status: "draft",
        }),
      },
      grantFederalAwardMetadata: {
        findFirst: vi.fn().mockResolvedValue({
          id: "fed-1",
          orgId: "org-1",
          grantId: "grant-1",
        }),
      },
      grantBudgetLines: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      expenses: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    },
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
    ...overrides,
  } as unknown as Database;
}

describe("evaluateUniformGuidanceCostGuardrails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(computeIndirectLine).mockResolvedValue(null);
  });

  it("returns a non-applicable clear result when the payment request is not tied to federal award metadata", async () => {
    const db = makeDb({
      query: {
        grantPaymentRequests: {
          findFirst: vi.fn().mockResolvedValue({
            id: "req-1",
            orgId: "org-1",
            grantId: "grant-1",
            status: "draft",
          }),
        },
        grantFederalAwardMetadata: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
        grantBudgetLines: { findFirst: vi.fn() },
        expenses: { findFirst: vi.fn() },
      },
    });

    const result = await evaluateUniformGuidanceCostGuardrails(db, {
      orgId: "org-1",
      requestId: "req-1",
      data: {
        expenseId: "exp-1",
        amountCents: 12000,
        category: "direct",
        sortOrder: 0,
      },
    });

    expect(result).toMatchObject({
      applicable: false,
      status: "clear",
      findings: [],
    });
    expect(result.regulatoryFacts).toEqual({
      deMinimisRatePercent: 15,
      mtdcSubawardCapCents: 5_000_000,
      equipmentThresholdCents: 1_000_000,
    });
  });

  it("throws when the payment request does not exist", async () => {
    const db = makeDb({
      query: {
        grantPaymentRequests: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
        grantFederalAwardMetadata: { findFirst: vi.fn() },
        grantBudgetLines: { findFirst: vi.fn() },
        expenses: { findFirst: vi.fn() },
      },
    });

    await expect(
      evaluateUniformGuidanceCostGuardrails(db, {
        orgId: "org-1",
        requestId: "missing-request",
        data: {
          expenseId: "exp-1",
          amountCents: 12000,
          category: "direct",
          sortOrder: 0,
        },
      }),
    ).rejects.toThrow("Payment request not found");
  });

  it("blocks a federal line tied to an unallowable budget line", async () => {
    const db = makeDb();
    vi.mocked(db.query.grantBudgetLines.findFirst).mockResolvedValue({
      id: "budget-line-1",
      orgId: "org-1",
      allowable: false,
      category: "Lobbying",
      budgetVersion: {
        orgId: "org-1",
        grantId: "grant-1",
        deletedAt: null,
      },
    } as never);

    const result = await evaluateUniformGuidanceCostGuardrails(db, {
      orgId: "org-1",
      requestId: "req-1",
      data: {
        budgetLineId: "budget-line-1",
        amountCents: 25000,
        category: "direct",
        sortOrder: 0,
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "unallowable_budget_line",
        severity: "block",
        source: "budget_line",
      }),
    );
  });

  it("rejects a budget line that is not valid for the request grant", async () => {
    const db = makeDb();
    vi.mocked(db.query.grantBudgetLines.findFirst).mockResolvedValue({
      id: "budget-line-1",
      orgId: "org-1",
      allowable: true,
      category: "Travel",
      budgetVersion: {
        orgId: "org-1",
        grantId: "other-grant",
        deletedAt: null,
      },
    } as never);

    await expect(
      evaluateUniformGuidanceCostGuardrails(db, {
        orgId: "org-1",
        requestId: "req-1",
        data: {
          budgetLineId: "budget-line-1",
          amountCents: 25000,
          category: "direct",
          sortOrder: 0,
        },
      }),
    ).rejects.toThrow("Budget line not found");
  });

  it("returns clear when a federal budget line is allowable", async () => {
    const db = makeDb();
    vi.mocked(db.query.grantBudgetLines.findFirst).mockResolvedValue({
      id: "budget-line-1",
      orgId: "org-1",
      allowable: true,
      category: "Travel",
      budgetVersion: {
        orgId: "org-1",
        grantId: "grant-1",
        deletedAt: null,
      },
    } as never);

    const result = await evaluateUniformGuidanceCostGuardrails(db, {
      orgId: "org-1",
      requestId: "req-1",
      data: {
        budgetLineId: "budget-line-1",
        amountCents: 25000,
        category: "direct",
        sortOrder: 0,
      },
    });

    expect(result.status).toBe("clear");
    expect(result.findings).toEqual([]);
  });

  it("warns when a federal subaward charge exceeds the $50,000 MTDC inclusion cap", async () => {
    const db = makeDb();
    vi.mocked(db.query.expenses.findFirst).mockResolvedValue({
      id: "exp-1",
      orgId: "org-1",
      grantId: "grant-1",
      amountCents: 6_000_000,
      category: "subaward",
      description: "Subrecipient agreement",
      reimbursable: true,
    } as never);

    const result = await evaluateUniformGuidanceCostGuardrails(db, {
      orgId: "org-1",
      requestId: "req-1",
      data: {
        expenseId: "exp-1",
        amountCents: 6_000_000,
        category: "direct",
        sortOrder: 0,
      },
    });

    expect(result.status).toBe("warning");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "mtdc_subaward_cap",
        severity: "warning",
        source: "expense",
      }),
    );
  });

  it("warns when equipment needs policy review for a federal direct line", async () => {
    const db = makeDb();
    vi.mocked(db.query.expenses.findFirst).mockResolvedValue({
      id: "exp-1",
      orgId: "org-1",
      grantId: "grant-1",
      amountCents: 1_500_000,
      category: "equipment",
      description: "Equipment purchase",
      reimbursable: true,
    } as never);

    const result = await evaluateUniformGuidanceCostGuardrails(db, {
      orgId: "org-1",
      requestId: "req-1",
      data: {
        expenseId: "exp-1",
        amountCents: 1_500_000,
        category: "direct",
        sortOrder: 0,
      },
    });

    expect(result.status).toBe("warning");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "equipment_threshold_exclusion",
        severity: "warning",
        message:
          "Check your equipment policy. Federal rules cap equipment at $10,000. Your org may use a lower limit.",
      }),
    );
  });

  it("warns on lower-cost equipment because org policy may be below the federal ceiling", async () => {
    const db = makeDb();
    vi.mocked(db.query.expenses.findFirst).mockResolvedValue({
      id: "exp-1",
      orgId: "org-1",
      grantId: "grant-1",
      amountCents: 500_000,
      category: "equipment",
      description: "Laptop purchase",
      reimbursable: true,
    } as never);

    const result = await evaluateUniformGuidanceCostGuardrails(db, {
      orgId: "org-1",
      requestId: "req-1",
      data: {
        expenseId: "exp-1",
        amountCents: 500_000,
        category: "direct",
        sortOrder: 0,
      },
    });

    expect(result.status).toBe("warning");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "equipment_threshold_exclusion",
        severity: "warning",
      }),
    );
  });

  it("throws when a selected expense cannot be found", async () => {
    const db = makeDb();
    vi.mocked(db.query.expenses.findFirst).mockResolvedValue(null as never);

    await expect(
      evaluateUniformGuidanceCostGuardrails(db, {
        orgId: "org-1",
        requestId: "req-1",
        data: {
          expenseId: "missing-expense",
          amountCents: 12000,
          category: "direct",
          sortOrder: 0,
        },
      }),
    ).rejects.toThrow("Expense not found");
  });

  it("allows sparse federal expense rows when no guardrail term matches", async () => {
    const db = makeDb();
    vi.mocked(db.query.expenses.findFirst).mockResolvedValue({
      id: "exp-1",
      orgId: "org-1",
      grantId: "grant-1",
      amountCents: 12000,
      category: null,
      description: null,
      reimbursable: true,
    } as never);

    const result = await evaluateUniformGuidanceCostGuardrails(db, {
      orgId: "org-1",
      requestId: "req-1",
      data: {
        expenseId: "exp-1",
        amountCents: 12000,
        category: "direct",
        sortOrder: 0,
      },
    });

    expect(result.status).toBe("clear");
    expect(result.findings).toEqual([]);
  });

  it("blocks a manual federal indirect line when no active indirect cost rule exists", async () => {
    const db = makeDb();

    const result = await evaluateUniformGuidanceCostGuardrails(db, {
      orgId: "org-1",
      requestId: "req-1",
      data: {
        amountCents: 15000,
        category: "indirect",
        description: "Manual indirect cost",
        sortOrder: 0,
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "missing_indirect_cost_rule",
        severity: "block",
        source: "indirect_rule",
      }),
    );
  });

  it("rejects a federal expense that belongs to a different grant", async () => {
    const db = makeDb();
    vi.mocked(db.query.expenses.findFirst).mockResolvedValue({
      id: "exp-1",
      orgId: "org-1",
      grantId: "other-grant",
      amountCents: 12000,
      category: "direct",
      description: "Program supplies",
      reimbursable: true,
    } as never);

    await expect(
      evaluateUniformGuidanceCostGuardrails(db, {
        orgId: "org-1",
        requestId: "req-1",
        data: {
          expenseId: "exp-1",
          amountCents: 12000,
          category: "direct",
          sortOrder: 0,
        },
      }),
    ).rejects.toThrow("Expense does not belong to the same grant as this request");
  });

  it("blocks an indirect line when the amount does not match the active rule", async () => {
    const db = makeDb({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: "rule-1",
              orgId: "org-1",
              grantId: "grant-1",
              effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
              effectiveTo: null,
            },
          ]),
        }),
      }),
    });
    vi.mocked(computeIndirectLine).mockResolvedValue({
      ruleId: "rule-1",
      base: "mtdc",
      rateBasisPoints: 1500,
      baseAmountCents: 100000,
      indirectAmountCents: 15000,
    });

    const result = await evaluateUniformGuidanceCostGuardrails(db, {
      orgId: "org-1",
      requestId: "req-1",
      data: {
        amountCents: 12000,
        category: "indirect",
        description: "Manual indirect cost",
        sortOrder: 0,
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "indirect_rate_mismatch",
        severity: "block",
        source: "indirect_rule",
      }),
    );
  });

  it("uses the active grant-specific indirect rule before a newer global rule", async () => {
    const db = makeDb({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: "global-rule",
              orgId: "org-1",
              grantId: null,
              effectiveFrom: new Date("2026-05-01T00:00:00.000Z"),
              effectiveTo: null,
            },
            {
              id: "grant-rule",
              orgId: "org-1",
              grantId: "grant-1",
              effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
              effectiveTo: null,
            },
          ]),
        }),
      }),
    });
    vi.mocked(computeIndirectLine).mockResolvedValue({
      ruleId: "grant-rule",
      base: "mtdc",
      rateBasisPoints: 1500,
      baseAmountCents: 100000,
      indirectAmountCents: 15000,
    });

    const result = await evaluateUniformGuidanceCostGuardrails(db, {
      orgId: "org-1",
      requestId: "req-1",
      data: {
        amountCents: 15000,
        category: "indirect",
        description: "Manual indirect cost",
        sortOrder: 0,
      },
    });

    expect(result.status).toBe("clear");
    expect(computeIndirectLine).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1", requestId: "req-1" }),
    );
  });

  it("handles multiple same-scope active indirect rules by effective date", async () => {
    const db = makeDb({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: "older-rule",
              orgId: "org-1",
              grantId: "grant-1",
              effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
              effectiveTo: null,
            },
            {
              id: "newer-rule",
              orgId: "org-1",
              grantId: "grant-1",
              effectiveFrom: new Date("2026-03-01T00:00:00.000Z"),
              effectiveTo: null,
            },
          ]),
        }),
      }),
    });
    vi.mocked(computeIndirectLine).mockResolvedValue({
      ruleId: "newer-rule",
      base: "mtdc",
      rateBasisPoints: 1500,
      baseAmountCents: 100000,
      indirectAmountCents: 15000,
    });

    const result = await evaluateUniformGuidanceCostGuardrails(db, {
      orgId: "org-1",
      requestId: "req-1",
      data: {
        amountCents: 15000,
        category: "indirect",
        description: "Manual indirect cost",
        sortOrder: 0,
      },
    });

    expect(result.status).toBe("clear");
    expect(computeIndirectLine).toHaveBeenCalledOnce();
  });
});
