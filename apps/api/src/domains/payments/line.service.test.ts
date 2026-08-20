import { beforeEach, describe, it, expect, vi } from "vitest";
import type { Database } from "@grantpipe/db";
import { PgDialect } from "drizzle-orm/pg-core";

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./request.service", () => ({
  recalcRequestAmounts: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./ug-guardrails.service", () => ({
  evaluateUniformGuidanceCostGuardrails: vi.fn(),
}));

import { recordActivityLog } from "../../lib/activity-log";
import { recalcRequestAmounts } from "./request.service";
import { evaluateUniformGuidanceCostGuardrails } from "./ug-guardrails.service";

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
  listEligibleExpenses,
  addLine,
  updateLine,
  removeLine,
  createAdjustment,
} from "./line.service";

function renderSql(condition: unknown) {
  const dialect = new PgDialect();
  return dialect.sqlToQuery(condition as Parameters<PgDialect["sqlToQuery"]>[0]);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: "req-1",
    orgId: "org-1",
    grantId: "grant-1",
    requestNumber: 1,
    type: "reimbursement",
    status: "draft",
    autoPostJournalEntry: false,
    requestedAmountCents: 0,
    approvedAmountCents: 0,
    createdBy: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function makeLine(overrides: Record<string, unknown> = {}) {
  return {
    id: "line-1",
    orgId: "org-1",
    requestId: "req-1",
    expenseId: null,
    budgetLineId: null,
    category: "direct",
    description: "Test expense",
    amountCents: 5000,
    approvedAmountCents: null,
    rejectionReason: null,
    sortOrder: 0,
    createdAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function makeExpense(overrides: Record<string, unknown> = {}) {
  return {
    id: "exp-1",
    orgId: "org-1",
    grantId: "grant-1",
    amountCents: 5000,
    date: new Date("2026-01-15"),
    description: "Office supplies",
    vendor: "ACME Corp",
    category: "supplies",
    reimbursable: true,
    createdAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(evaluateUniformGuidanceCostGuardrails).mockResolvedValue({
    applicable: false,
    status: "clear",
    findingCount: 0,
    findings: [],
    regulatoryFacts: {
      deMinimisRatePercent: 15,
      mtdcSubawardCapCents: 5_000_000,
      equipmentThresholdCents: 1_000_000,
    },
  });
});

// ---------------------------------------------------------------------------
// listEligibleExpenses
// ---------------------------------------------------------------------------

describe("listEligibleExpenses", () => {
  it("returns eligible expenses with alreadyClaimedCents", async () => {
    const expense = makeExpense();
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                id: expense.id,
                description: expense.description,
                vendor: expense.vendor,
                date: expense.date,
                amountCents: expense.amountCents,
                category: expense.category,
              },
            ]),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                groupBy: vi.fn().mockResolvedValue([{ expenseId: "exp-1", claimedCents: "2000" }]),
              }),
            }),
          }),
        }),
    } as unknown as Database;

    const result = await listEligibleExpenses(db, {
      orgId: "org-1",
      grantId: "grant-1",
      requestId: "req-1",
      queryParams: {},
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.alreadyClaimedCents).toBe(2000);
  });

  it("returns empty array when no expenses", async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
    } as unknown as Database;

    const result = await listEligibleExpenses(db, {
      orgId: "org-1",
      grantId: "grant-1",
      requestId: "req-1",
      queryParams: {},
    });

    expect(result).toEqual([]);
  });

  it("excludes expenses claimed by the current request", async () => {
    let eligibleCondition: unknown;
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn((condition: unknown) => {
            eligibleCondition = condition;
            return Promise.resolve([]);
          }),
        }),
      }),
    } as unknown as Database;

    await listEligibleExpenses(db, {
      orgId: "org-1",
      grantId: "grant-1",
      requestId: "req-1",
      queryParams: {},
    });

    const rendered = renderSql(eligibleCondition);
    expect(rendered.sql).not.toContain("!=");
    expect(rendered.sql).not.toContain("<>");
    expect(rendered.params).not.toContain("req-1");
  });

  it("sets alreadyClaimedCents to 0 when expense has no claims", async () => {
    const expense = makeExpense();
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                id: expense.id,
                description: expense.description,
                vendor: expense.vendor,
                date: expense.date,
                amountCents: expense.amountCents,
                category: expense.category,
              },
            ]),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                groupBy: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
    } as unknown as Database;

    const result = await listEligibleExpenses(db, {
      orgId: "org-1",
      grantId: "grant-1",
      requestId: "req-1",
      queryParams: { search: "office" },
    });

    expect(result[0]?.alreadyClaimedCents).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// addLine
// ---------------------------------------------------------------------------

describe("addLine", () => {
  it("rejects invalid line input before reading the request", async () => {
    const findFirst = vi.fn();
    const transaction = vi.fn();
    const db = {
      query: {
        grantPaymentRequests: { findFirst },
      },
      transaction,
    } as unknown as Database;

    await expect(
      addLine(db, {
        orgId: "org-1",
        actorId: "user-1",
        requestId: "req-1",
        data: { amountCents: -1 } as never,
      }),
    ).rejects.toThrow();
    expect(findFirst).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("blocks a line when Uniform Guidance guardrails return a blocking finding", async () => {
    vi.mocked(evaluateUniformGuidanceCostGuardrails).mockResolvedValueOnce({
      applicable: true,
      status: "blocked",
      findingCount: 1,
      findings: [
        {
          code: "unallowable_budget_line",
          severity: "block",
          title: "Unallowable budget line",
          message: "This budget line is marked unallowable for the award.",
          source: "budget_line",
        },
      ],
      regulatoryFacts: {
        deMinimisRatePercent: 15,
        mtdcSubawardCapCents: 5_000_000,
        equipmentThresholdCents: 1_000_000,
      },
    });
    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(makeRequest()) },
      },
      transaction: vi.fn(),
    } as unknown as Database;

    await expect(
      addLine(db, {
        orgId: "org-1",
        actorId: "user-1",
        requestId: "req-1",
        data: { amountCents: 5000, category: "direct", sortOrder: 0 },
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "This budget line is marked unallowable for the award.",
    });

    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("adds a line without expenseId", async () => {
    const request = makeRequest({ status: "draft" });
    const line = makeLine();

    const txMock = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([line]),
        }),
      }),
    };

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    const result = await addLine(db, {
      orgId: "org-1",
      actorId: "user-1",
      requestId: "req-1",
      data: { amountCents: 5000, category: "direct", sortOrder: 0 },
    });

    expect(result.amountCents).toBe(5000);
    expect(recalcRequestAmounts).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ requestId: "req-1", orgId: "org-1" }),
    );
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "added", entityType: "payment_request_line" }),
    );
  });

  it("adds a line with expenseId and dedup guard passes", async () => {
    const request = makeRequest({ status: "draft" });
    const expense = makeExpense();
    const line = makeLine({ expenseId: "exp-1" });

    const txMock = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      query: {
        expenses: { findFirst: vi.fn().mockResolvedValue(expense) },
      },
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([line]),
        }),
      }),
    };

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    const result = await addLine(db, {
      orgId: "org-1",
      actorId: "user-1",
      requestId: "req-1",
      data: { amountCents: 5000, expenseId: "exp-1", category: "direct", sortOrder: 0 },
    });

    expect(result.expenseId).toBe("exp-1");
  });

  it("throws conflict when expense already claimed in another request", async () => {
    const request = makeRequest({ status: "draft" });

    const txMock = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ id: "line-existing" }]),
          }),
        }),
      }),
    };

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    await expect(
      addLine(db, {
        orgId: "org-1",
        actorId: "user-1",
        requestId: "req-1",
        data: { amountCents: 5000, expenseId: "exp-1", category: "direct", sortOrder: 0 },
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("checks same-request expense lines in the duplicate claim guard", async () => {
    const request = makeRequest({ status: "draft" });
    let dedupCondition: unknown;

    const txMock = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn((condition: unknown) => {
              dedupCondition = condition;
              return Promise.resolve([{ id: "line-existing" }]);
            }),
          }),
        }),
      }),
    };

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    await expect(
      addLine(db, {
        orgId: "org-1",
        actorId: "user-1",
        requestId: "req-1",
        data: { amountCents: 5000, expenseId: "exp-1", category: "direct", sortOrder: 0 },
      }),
    ).rejects.toMatchObject({ status: 409 });

    const rendered = renderSql(dedupCondition);
    expect(rendered.sql).not.toContain("<>");
    expect(rendered.params).not.toContain("req-1");
  });

  it("throws notFound when expense not found in org", async () => {
    const request = makeRequest({ status: "draft" });

    const txMock = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      query: {
        expenses: { findFirst: vi.fn().mockResolvedValue(null) },
      },
    };

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    await expect(
      addLine(db, {
        orgId: "org-1",
        actorId: "user-1",
        requestId: "req-1",
        data: { amountCents: 5000, expenseId: "exp-bad", category: "direct", sortOrder: 0 },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws badRequest when expense belongs to different grant", async () => {
    const request = makeRequest({ status: "draft", grantId: "grant-1" });
    const expense = makeExpense({ grantId: "grant-other" });

    const txMock = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      query: {
        expenses: { findFirst: vi.fn().mockResolvedValue(expense) },
      },
    };

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    await expect(
      addLine(db, {
        orgId: "org-1",
        actorId: "user-1",
        requestId: "req-1",
        data: { amountCents: 5000, expenseId: "exp-1", category: "direct", sortOrder: 0 },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("throws badRequest when expense is not reimbursable", async () => {
    const request = makeRequest({ status: "draft", grantId: "grant-1" });
    const expense = makeExpense({ reimbursable: false });

    const txMock = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      query: {
        expenses: { findFirst: vi.fn().mockResolvedValue(expense) },
      },
    };

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    await expect(
      addLine(db, {
        orgId: "org-1",
        actorId: "user-1",
        requestId: "req-1",
        data: { amountCents: 5000, expenseId: "exp-1", category: "direct", sortOrder: 0 },
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Expense is not reimbursable",
    });
  });

  it("throws badRequest when an expense-backed line exceeds the expense amount", async () => {
    const request = makeRequest({ status: "draft", grantId: "grant-1" });
    const expense = makeExpense({ amountCents: 5000 });
    const line = makeLine({ expenseId: "exp-1", amountCents: 5001 });

    const txMock = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      query: {
        expenses: { findFirst: vi.fn().mockResolvedValue(expense) },
      },
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([line]),
        }),
      }),
    };

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    await expect(
      addLine(db, {
        orgId: "org-1",
        actorId: "user-1",
        requestId: "req-1",
        data: { amountCents: 5001, expenseId: "exp-1", category: "direct", sortOrder: 0 },
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Line amount cannot exceed the source expense amount",
    });
  });

  it("throws notFound when the budget line belongs to another grant", async () => {
    const request = makeRequest({ status: "draft", grantId: "grant-1" });
    const line = makeLine({ budgetLineId: "budget-line-1" });

    const txMock = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([line]),
        }),
      }),
    };

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
        grantBudgetLines: {
          findFirst: vi.fn().mockResolvedValue({
            id: "budget-line-1",
            orgId: "org-1",
            deletedAt: null,
            budgetVersion: { grantId: "other-grant" },
          }),
        },
      },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    await expect(
      addLine(db, {
        orgId: "org-1",
        actorId: "user-1",
        requestId: "req-1",
        data: {
          amountCents: 5000,
          budgetLineId: "budget-line-1",
          category: "direct",
          sortOrder: 0,
        },
      }),
    ).rejects.toMatchObject({
      status: 404,
      message: "Budget line not found",
    });
  });

  it("throws notFound when the budget line belongs to a deleted budget version", async () => {
    const request = makeRequest({ status: "draft", grantId: "grant-1" });
    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
        grantBudgetLines: {
          findFirst: vi.fn().mockResolvedValue({
            id: "budget-line-1",
            orgId: "org-1",
            deletedAt: null,
            budgetVersion: {
              orgId: "org-1",
              grantId: "grant-1",
              deletedAt: new Date("2026-05-28T00:00:00.000Z"),
            },
          }),
        },
      },
      transaction: vi.fn(),
    } as unknown as Database;

    await expect(
      addLine(db, {
        orgId: "org-1",
        actorId: "user-1",
        requestId: "req-1",
        data: {
          amountCents: 5000,
          budgetLineId: "budget-line-1",
          category: "direct",
          sortOrder: 0,
        },
      }),
    ).rejects.toMatchObject({
      status: 404,
      message: "Budget line not found",
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("throws notFound when the budget line version belongs to another org", async () => {
    const request = makeRequest({ status: "draft", grantId: "grant-1" });
    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
        grantBudgetLines: {
          findFirst: vi.fn().mockResolvedValue({
            id: "budget-line-1",
            orgId: "org-1",
            deletedAt: null,
            budgetVersion: { orgId: "org-other", grantId: "grant-1", deletedAt: null },
          }),
        },
      },
      transaction: vi.fn(),
    } as unknown as Database;

    await expect(
      addLine(db, {
        orgId: "org-1",
        actorId: "user-1",
        requestId: "req-1",
        data: {
          amountCents: 5000,
          budgetLineId: "budget-line-1",
          category: "direct",
          sortOrder: 0,
        },
      }),
    ).rejects.toMatchObject({
      status: 404,
      message: "Budget line not found",
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("throws notFound when request not found", async () => {
    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(null) },
      },
    } as unknown as Database;

    await expect(
      addLine(db, {
        orgId: "org-1",
        actorId: "user-1",
        requestId: "bad",
        data: { amountCents: 5000, category: "direct", sortOrder: 0 },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws badRequest when request not in draft status", async () => {
    const request = makeRequest({ status: "submitted" });
    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
    } as unknown as Database;

    await expect(
      addLine(db, {
        orgId: "org-1",
        actorId: "user-1",
        requestId: "req-1",
        data: { amountCents: 5000, category: "direct", sortOrder: 0 },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("throws internalError when insert returns nothing", async () => {
    const request = makeRequest({ status: "draft" });

    const txMock = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    };

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    await expect(
      addLine(db, {
        orgId: "org-1",
        actorId: "user-1",
        requestId: "req-1",
        data: { amountCents: 5000, category: "direct", sortOrder: 0 },
      }),
    ).rejects.toMatchObject({ status: 500 });
  });
});

// ---------------------------------------------------------------------------
// updateLine
// ---------------------------------------------------------------------------

describe("updateLine", () => {
  it("rejects empty update input before reading the request", async () => {
    const findFirst = vi.fn();
    const transaction = vi.fn();
    const db = {
      query: {
        grantPaymentRequests: { findFirst },
      },
      transaction,
    } as unknown as Database;

    await expect(
      updateLine(db, {
        orgId: "org-1",
        actorId: "user-1",
        requestId: "req-1",
        lineId: "line-1",
        data: {} as never,
      }),
    ).rejects.toThrow("At least one field must be provided for update");
    expect(findFirst).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("updates a line on a draft request", async () => {
    const request = makeRequest({ status: "draft" });
    const line = makeLine();
    const updatedLine = makeLine({ amountCents: 8000 });

    const txMock = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedLine]),
          }),
        }),
      }),
    };
    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
        grantPaymentRequestLines: { findFirst: vi.fn().mockResolvedValue(line) },
      },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    const result = await updateLine(db, {
      orgId: "org-1",
      actorId: "user-1",
      requestId: "req-1",
      lineId: "line-1",
      data: { amountCents: 8000 },
    });

    expect(result.amountCents).toBe(8000);
    expect(recalcRequestAmounts).toHaveBeenCalled();
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "updated", entityType: "payment_request_line" }),
    );
  });

  it("blocks an update when Uniform Guidance guardrails return a blocking finding", async () => {
    vi.mocked(evaluateUniformGuidanceCostGuardrails).mockResolvedValueOnce({
      applicable: true,
      status: "blocked",
      findingCount: 1,
      findings: [
        {
          code: "indirect_rate_mismatch",
          severity: "block",
          title: "Indirect cost mismatch",
          message: "This indirect line does not match the active indirect cost rule.",
          source: "indirect_rule",
        },
      ],
      regulatoryFacts: {
        deMinimisRatePercent: 15,
        mtdcSubawardCapCents: 5_000_000,
        equipmentThresholdCents: 1_000_000,
      },
    });
    const request = makeRequest({ status: "draft" });
    const line = makeLine({ category: "direct", amountCents: 5000 });
    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
        grantPaymentRequestLines: { findFirst: vi.fn().mockResolvedValue(line) },
      },
      transaction: vi.fn(),
    } as unknown as Database;

    await expect(
      updateLine(db, {
        orgId: "org-1",
        actorId: "user-1",
        requestId: "req-1",
        lineId: "line-1",
        data: { category: "indirect", amountCents: 12000 },
      }),
    ).rejects.toThrow("This indirect line does not match the active indirect cost rule.");

    expect(evaluateUniformGuidanceCostGuardrails).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        requestId: "req-1",
        data: expect.objectContaining({
          category: "indirect",
          amountCents: 12000,
          sortOrder: 0,
        }),
      }),
    );
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("throws badRequest when updating an expense-backed line above the expense amount", async () => {
    const request = makeRequest({ status: "draft" });
    const line = makeLine({ expenseId: "exp-1", amountCents: 5000 });
    const expense = makeExpense({ amountCents: 5000 });
    const updatedLine = makeLine({ expenseId: "exp-1", amountCents: 5001 });

    const txMock = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedLine]),
          }),
        }),
      }),
    };
    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
        grantPaymentRequestLines: { findFirst: vi.fn().mockResolvedValue(line) },
        expenses: { findFirst: vi.fn().mockResolvedValue(expense) },
      },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    await expect(
      updateLine(db, {
        orgId: "org-1",
        actorId: "user-1",
        requestId: "req-1",
        lineId: "line-1",
        data: { amountCents: 5001 },
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Line amount cannot exceed the source expense amount",
    });
  });

  it("throws notFound when request not found", async () => {
    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(null) },
      },
    } as unknown as Database;

    await expect(
      updateLine(db, {
        orgId: "org-1",
        actorId: "user-1",
        requestId: "bad",
        lineId: "line-1",
        data: { amountCents: 100 },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws badRequest when request not in draft status", async () => {
    const request = makeRequest({ status: "approved" });
    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
    } as unknown as Database;

    await expect(
      updateLine(db, {
        orgId: "org-1",
        actorId: "user-1",
        requestId: "req-1",
        lineId: "line-1",
        data: { amountCents: 100 },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("throws notFound when line not found", async () => {
    const request = makeRequest({ status: "draft" });
    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
        grantPaymentRequestLines: { findFirst: vi.fn().mockResolvedValue(null) },
      },
    } as unknown as Database;

    await expect(
      updateLine(db, {
        orgId: "org-1",
        actorId: "user-1",
        requestId: "req-1",
        lineId: "bad-line",
        data: { amountCents: 100 },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws notFound when update returns nothing", async () => {
    const request = makeRequest({ status: "draft" });
    const line = makeLine();
    const txMock = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };
    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
        grantPaymentRequestLines: { findFirst: vi.fn().mockResolvedValue(line) },
      },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    await expect(
      updateLine(db, {
        orgId: "org-1",
        actorId: "user-1",
        requestId: "req-1",
        lineId: "line-1",
        data: { amountCents: 100 },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

// ---------------------------------------------------------------------------
// removeLine
// ---------------------------------------------------------------------------

describe("removeLine", () => {
  it("soft deletes a line from a draft request", async () => {
    const request = makeRequest({ status: "draft" });
    const deletedLine = makeLine({ deletedAt: new Date() });

    const txMock = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([deletedLine]),
          }),
        }),
      }),
    };
    const transaction = vi
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock));

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      transaction,
    } as unknown as Database;

    await removeLine(db, {
      orgId: "org-1",
      actorId: "user-1",
      requestId: "req-1",
      lineId: "line-1",
    });

    // Soft-delete, recalc, and activity log must run inside a single transaction
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txMock.update).toHaveBeenCalled();
    expect(recalcRequestAmounts).toHaveBeenCalledWith(
      txMock,
      expect.objectContaining({ requestId: "req-1", orgId: "org-1" }),
    );
    expect(recordActivityLog).toHaveBeenCalledWith(
      txMock,
      expect.objectContaining({ action: "removed", entityType: "payment_request_line" }),
    );
  });

  it("throws badRequest when request not in draft status", async () => {
    const request = makeRequest({ status: "submitted" });
    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
    } as unknown as Database;

    await expect(
      removeLine(db, { orgId: "org-1", actorId: "user-1", requestId: "req-1", lineId: "line-1" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("throws notFound when request not found", async () => {
    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(null) },
      },
    } as unknown as Database;

    await expect(
      removeLine(db, { orgId: "org-1", actorId: "user-1", requestId: "bad", lineId: "line-1" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws notFound when line not found", async () => {
    const request = makeRequest({ status: "draft" });
    const txMock = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };
    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    await expect(
      removeLine(db, {
        orgId: "org-1",
        actorId: "user-1",
        requestId: "req-1",
        lineId: "bad-line",
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

// ---------------------------------------------------------------------------
// createAdjustment
// ---------------------------------------------------------------------------

describe("createAdjustment", () => {
  it("rejects invalid adjustment input before reading the request", async () => {
    const findFirst = vi.fn();
    const insert = vi.fn();
    const db = {
      query: {
        grantPaymentRequests: { findFirst },
      },
      insert,
    } as unknown as Database;

    await expect(
      createAdjustment(db, {
        orgId: "org-1",
        actorId: "user-1",
        requestId: "req-1",
        data: { kind: "reduction", amountCents: -1, reason: "bad" } as never,
      }),
    ).rejects.toThrow();
    expect(findFirst).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("creates an adjustment for any non-deleted request", async () => {
    const request = makeRequest({ status: "submitted" });
    const adjustment = {
      id: "adj-1",
      orgId: "org-1",
      requestId: "req-1",
      kind: "reduction",
      amountCents: 500,
      reason: "Reduced due to receipt mismatch",
      createdBy: "user-1",
      createdAt: new Date(),
      deletedAt: null,
    };

    const db = withTransaction({
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([adjustment]),
        }),
      }),
    }) as unknown as Database;

    const result = await createAdjustment(db, {
      orgId: "org-1",
      actorId: "user-1",
      requestId: "req-1",
      data: { kind: "reduction", amountCents: 500, reason: "Reduced due to receipt mismatch" },
    });

    expect(result.kind).toBe("reduction");
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "created", entityType: "payment_request_adjustment" }),
    );
  });

  it("throws notFound when request not found", async () => {
    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(null) },
      },
    } as unknown as Database;

    await expect(
      createAdjustment(db, {
        orgId: "org-1",
        actorId: "user-1",
        requestId: "bad",
        data: { kind: "note", reason: "Some note" },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws internalError when insert returns nothing", async () => {
    const request = makeRequest({ status: "draft" });
    const db = withTransaction({
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    }) as unknown as Database;

    await expect(
      createAdjustment(db, {
        orgId: "org-1",
        actorId: "user-1",
        requestId: "req-1",
        data: { kind: "note", reason: "note" },
      }),
    ).rejects.toMatchObject({ status: 500 });
  });

  it("creates a note-only adjustment (no amountCents)", async () => {
    const request = makeRequest({ status: "approved" });
    const adjustment = {
      id: "adj-2",
      orgId: "org-1",
      requestId: "req-1",
      kind: "note",
      amountCents: null,
      reason: "Funder confirmed",
      createdBy: "user-1",
      createdAt: new Date(),
      deletedAt: null,
    };

    const db = withTransaction({
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([adjustment]),
        }),
      }),
    }) as unknown as Database;

    const result = await createAdjustment(db, {
      orgId: "org-1",
      actorId: "user-1",
      requestId: "req-1",
      data: { kind: "note", reason: "Funder confirmed" },
    });

    expect(result.amountCents).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// listEligibleExpenses — additional filter branch coverage
// ---------------------------------------------------------------------------

describe("listEligibleExpenses — date filter branches", () => {
  it("applies periodStart and periodEnd filters when provided", async () => {
    const expense = {
      id: "exp-period",
      description: "Period expense",
      vendor: "Vendor",
      date: new Date("2026-02-15"),
      amountCents: 3000,
      category: "direct",
    };

    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([expense]),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                groupBy: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
    } as unknown as Database;

    const result = await listEligibleExpenses(db, {
      orgId: "org-1",
      grantId: "grant-1",
      requestId: "req-1",
      queryParams: {
        periodStart: "2026-01-01T00:00:00.000Z",
        periodEnd: "2026-03-31T00:00:00.000Z",
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("exp-period");
  });

  it("applies the category filter when provided", async () => {
    const where = vi.fn().mockResolvedValue([]);
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({ where }),
      }),
    } as unknown as Database;

    await listEligibleExpenses(db, {
      orgId: "org-1",
      grantId: "grant-1",
      requestId: "req-1",
      queryParams: { category: "travel" },
    });

    const renderedWhere = renderSql(where.mock.calls[0]![0]).sql;
    expect(renderedWhere).toContain('"expenses"."category"');
  });
});

// ---------------------------------------------------------------------------
// Branch coverage — null description in updateLine and removeLine
// ---------------------------------------------------------------------------

describe("updateLine — null description branch", () => {
  it("handles null description (entityLabel becomes null)", async () => {
    const request = makeRequest({ status: "draft" });
    const line = makeLine({ description: "Old description" });
    const updated = makeLine({ description: null });

    const txMock = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updated]),
          }),
        }),
      }),
    };
    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
        grantPaymentRequestLines: { findFirst: vi.fn().mockResolvedValue(line) },
      },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    const result = await updateLine(db, {
      orgId: "org-1",
      actorId: "user-1",
      requestId: "req-1",
      lineId: "line-1",
      data: { description: "Updated description" },
    });

    expect(result.description).toBeNull();
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityLabel: null }),
    );
  });
});

describe("removeLine — null description branch", () => {
  it("handles null description on deleted line (entityLabel becomes null)", async () => {
    const request = makeRequest({ status: "draft" });
    const deleted = makeLine({ description: null });

    const txMock = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([deleted]),
          }),
        }),
      }),
    };
    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    await removeLine(db, {
      orgId: "org-1",
      actorId: "user-1",
      requestId: "req-1",
      lineId: "line-1",
    });

    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityLabel: null }),
    );
  });
});

describe("listEligibleExpenses — null expenseId in claimed row", () => {
  it("skips rows where expenseId is null in the claimed aggregation", async () => {
    const expense = {
      id: "exp-1",
      description: "Office supplies",
      vendor: "Vendor",
      date: new Date("2026-02-01"),
      amountCents: 5000,
      category: "direct",
    };

    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([expense]),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                groupBy: vi.fn().mockResolvedValue([
                  { expenseId: null, claimedCents: "500" }, // null expenseId — should be skipped
                  { expenseId: "exp-1", claimedCents: "1000" },
                ]),
              }),
            }),
          }),
        }),
    } as unknown as Database;

    const result = await listEligibleExpenses(db, {
      orgId: "org-1",
      grantId: "grant-1",
      requestId: "req-1",
      queryParams: {},
    });

    expect(result[0]?.alreadyClaimedCents).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// updateLine — all optional fields branch coverage
// ---------------------------------------------------------------------------

describe("updateLine — all optional fields", () => {
  it("updates category, approvedAmountCents, rejectionReason, and sortOrder", async () => {
    const request = makeRequest({ status: "draft" });
    const line = makeLine();
    const updated = makeLine({
      category: "indirect",
      approvedAmountCents: 4500,
      rejectionReason: "Partial approval",
      sortOrder: 2,
    });

    const txMock = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updated]),
          }),
        }),
      }),
    };
    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
        grantPaymentRequestLines: { findFirst: vi.fn().mockResolvedValue(line) },
      },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    const result = await updateLine(db, {
      orgId: "org-1",
      actorId: "user-1",
      requestId: "req-1",
      lineId: "line-1",
      data: {
        category: "indirect",
        approvedAmountCents: 4500,
        rejectionReason: "Partial approval",
        sortOrder: 2,
      },
    });

    expect(result.category).toBe("indirect");
    expect(result.approvedAmountCents).toBe(4500);
    expect(result.rejectionReason).toBe("Partial approval");
    expect(result.sortOrder).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// addLine — default category and sortOrder branches
// ---------------------------------------------------------------------------

describe("addLine — default category and sortOrder (no values provided)", () => {
  it("uses 'direct' as default category and 0 as default sortOrder when omitted", async () => {
    const request = makeRequest({ status: "draft" });
    const line = makeLine({ category: "direct", sortOrder: 0 });

    const txMock = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([line]),
        }),
      }),
    };

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    // Do not provide category or sortOrder — test the ?? fallback
    const result = await addLine(db, {
      orgId: "org-1",
      actorId: "user-1",
      requestId: "req-1",
      data: { amountCents: 3000, category: "direct", sortOrder: 0 },
    });

    expect(result.category).toBe("direct");
    expect(result.sortOrder).toBe(0);
  });

  it("uses 'direct' and sortOrder 0 defaults in the expenseId path", async () => {
    const request = makeRequest({ status: "draft" });
    const expense = makeExpense();
    const line = makeLine({ expenseId: "exp-1", category: "direct", sortOrder: 0 });

    const txMock = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      query: {
        expenses: { findFirst: vi.fn().mockResolvedValue(expense) },
      },
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([line]),
        }),
      }),
    };

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    // Omit category, sortOrder, description — test ?? fallbacks in the expenseId path
    const result = await addLine(db, {
      orgId: "org-1",
      actorId: "user-1",
      requestId: "req-1",
      data: { amountCents: 5000, expenseId: "exp-1", category: "direct", sortOrder: 0 },
    });

    expect(result.category).toBe("direct");
    expect(result.sortOrder).toBe(0);
  });

  it("throws internalError when expenseId path insert returns nothing", async () => {
    const request = makeRequest({ status: "draft" });
    const expense = makeExpense();

    const txMock = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      query: {
        expenses: { findFirst: vi.fn().mockResolvedValue(expense) },
      },
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    };

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    await expect(
      addLine(db, {
        orgId: "org-1",
        actorId: "user-1",
        requestId: "req-1",
        data: { amountCents: 5000, expenseId: "exp-1", category: "direct", sortOrder: 0 },
      }),
    ).rejects.toMatchObject({ status: 500 });
  });
});

// ---------------------------------------------------------------------------
// addLine — default sortOrder branch (sortOrder undefined → 0)
// ---------------------------------------------------------------------------

describe("addLine — default sortOrder when omitted (expenseId path)", () => {
  it("uses 0 for sortOrder when not provided in expenseId path", async () => {
    const request = makeRequest({ status: "draft" });
    const expense = { id: "exp-abc", grantId: "grant-1", orgId: "org-1", deletedAt: null };
    const line = makeLine({ sortOrder: 0 });

    const txMock = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]), // no duplicate found
          }),
        }),
      }),
      query: {
        expenses: { findFirst: vi.fn().mockResolvedValue(expense) },
      },
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([line]),
        }),
      }),
    };

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    const result = await addLine(db, {
      orgId: "org-1",
      actorId: "user-1",
      requestId: "req-1",
      // Cast to bypass TS — tests the `?? "direct"` and `?? 0` nullish branches in the service
      data: { amountCents: 5000, expenseId: "exp-abc" } as unknown as Parameters<
        typeof addLine
      >[1]["data"],
    });

    expect(result.sortOrder).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// addLine — no-expenseId path default branches
// ---------------------------------------------------------------------------

describe("addLine — no-expenseId default branches", () => {
  it("uses 'direct' and 0 for category/sortOrder defaults in no-expenseId path", async () => {
    const request = makeRequest({ status: "draft" });
    const line = makeLine({ category: "direct", sortOrder: 0, description: null });

    const txMock = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([line]),
        }),
      }),
    };

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    const result = await addLine(db, {
      orgId: "org-1",
      actorId: "user-1",
      requestId: "req-1",
      // Cast to bypass TS — tests the `?? "direct"` and `?? 0` nullish branches in the no-expenseId path
      data: { amountCents: 5000 } as unknown as Parameters<typeof addLine>[1]["data"],
    });

    expect(result.category).toBe("direct");
    expect(result.sortOrder).toBe(0);
    expect(result.description).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// updateLine — description provided branch (true branch of if data.description !== undefined)
// ---------------------------------------------------------------------------

describe("updateLine — description provided", () => {
  it("sets description when provided in data", async () => {
    const request = makeRequest({ status: "draft" });
    const line = makeLine({ description: "Old desc" });
    const updated = makeLine({ description: "New desc" });

    const txMock = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updated]),
          }),
        }),
      }),
    };

    const db = {
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
        grantPaymentRequestLines: { findFirst: vi.fn().mockResolvedValue(line) },
      },
      transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    } as unknown as Database;

    const result = await updateLine(db, {
      orgId: "org-1",
      actorId: "user-1",
      requestId: "req-1",
      lineId: "line-1",
      data: { description: "New desc" },
    });

    expect(result.description).toBe("New desc");
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityLabel: "New desc" }),
    );
  });
});

describe("createAdjustment — atomicity", () => {
  it("runs insert + log in one transaction (happy path)", async () => {
    const request = makeRequest({ status: "draft" });
    const adjustment = {
      id: "adj-atomic",
      orgId: "org-1",
      requestId: "req-1",
      kind: "reduction",
      amountCents: 100,
      reason: "test",
      createdBy: "user-1",
      createdAt: new Date(),
      deletedAt: null,
    };

    const db = withTransaction({
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([adjustment]),
        }),
      }),
    });

    const result = await createAdjustment(db as unknown as Database, {
      orgId: "org-1",
      actorId: "user-1",
      requestId: "req-1",
      data: { kind: "reduction", amountCents: 100, reason: "test" },
    });

    expect(db.transaction).toHaveBeenCalledOnce();
    expect(result.id).toBe("adj-atomic");
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "payment_request_adjustment", action: "created" }),
    );
  });

  it("rolls back when audit log fails", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const request = makeRequest({ status: "draft" });
    const adjustment = {
      id: "adj-fail",
      orgId: "org-1",
      requestId: "req-1",
      kind: "note",
      amountCents: null,
      reason: "test",
      createdBy: "user-1",
      createdAt: new Date(),
      deletedAt: null,
    };

    const db = withTransaction({
      query: {
        grantPaymentRequests: { findFirst: vi.fn().mockResolvedValue(request) },
      },
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([adjustment]),
        }),
      }),
    });

    await expect(
      createAdjustment(db as unknown as Database, {
        orgId: "org-1",
        actorId: "user-1",
        requestId: "req-1",
        data: { kind: "note", reason: "test" },
      }),
    ).rejects.toThrow("audit log down");
  });
});
