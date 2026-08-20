import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { programBudgetLines, expenses } from "@grantpipe/db";
import { exportProgramBudgetVsActual, getProgramBudgetVsActual } from "./report.service";

function reportChain<T>(result: T) {
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockResolvedValue(result),
  };
}

describe("program report service", () => {
  beforeEach(() => vi.resetAllMocks());

  it("combines budget and actual rows by program and category", async () => {
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(
          reportChain([{ programId: "program-1", category: "Personnel", budgetedCents: 100_00 }]),
        )
        .mockReturnValueOnce(
          reportChain([
            { programId: "program-1", category: "Personnel", actualCents: 75_00 },
            { programId: "program-1", category: null, actualCents: 5_00 },
          ]),
        ),
    } as never;

    await expect(
      getProgramBudgetVsActual(db, {
        orgId: "org-1",
        programId: "program-1",
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
      }),
    ).resolves.toEqual({
      rows: [
        {
          programId: "program-1",
          category: "Personnel",
          budgetedCents: 100_00,
          actualCents: 75_00,
          remainingCents: 25_00,
        },
        {
          programId: "program-1",
          category: "Uncategorized",
          budgetedCents: 0,
          actualCents: 5_00,
          remainingCents: -5_00,
        },
      ],
    });
  });

  it("exports budget-vs-actual rows as CSV", async () => {
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(
          reportChain([{ programId: "program-1", category: "Program, Ops", budgetedCents: 100 }]),
        )
        .mockReturnValueOnce(reportChain([])),
    } as never;

    const csv = await exportProgramBudgetVsActual(db, {
      orgId: "org-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      format: "csv",
    });

    expect(csv).toContain("program_id,category,budgeted_cents,actual_cents,remaining_cents");
    expect(csv).toContain('"Program, Ops"');
  });

  it("sorts rows by program before category and escapes quotes", async () => {
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(
          reportChain([
            { programId: "program-b", category: "Supplies", budgetedCents: 200 },
            { programId: "program-a", category: 'Care "Direct"', budgetedCents: 100 },
          ]),
        )
        .mockReturnValueOnce(
          reportChain([{ programId: "program-a", category: 'Care "Direct"', actualCents: 40 }]),
        ),
    } as never;

    const csv = await exportProgramBudgetVsActual(db, {
      orgId: "org-1",
      grantId: "grant-1",
      fundId: "fund-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      format: "csv",
    });

    expect(csv.split("\n")[1]).toContain("program-a");
    expect(csv).toContain('"Care ""Direct"""');
  });

  // ---------------------------------------------------------------------------
  // orgId join predicate isolation tests (fixes #9-#10)
  // ---------------------------------------------------------------------------

  it("scopes programBudgetLines innerJoin by programBudgetLines.orgId (fix #9)", async () => {
    const innerJoinSpy = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        groupBy: vi.fn().mockResolvedValue([]),
      }),
    });
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({ innerJoin: innerJoinSpy }),
        })
        .mockReturnValueOnce(reportChain([])),
    } as never;

    await getProgramBudgetVsActual(db, {
      orgId: "org-isolated",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
    });

    expect(innerJoinSpy).toHaveBeenCalledWith(programBudgetLines, expect.anything());
    const onPredicate = innerJoinSpy.mock.calls[0]?.[1];
    const dialect = new PgDialect();
    const rendered = dialect.sqlToQuery(onPredicate as Parameters<PgDialect["sqlToQuery"]>[0]);
    // Must bind the orgId param to scope programBudgetLines to this org.
    expect(rendered.params).toContain("org-isolated");
  });

  it("scopes expenses innerJoin by expenses.orgId (fix #10)", async () => {
    const innerJoinSpy = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        groupBy: vi.fn().mockResolvedValue([]),
      }),
    });
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(reportChain([]))
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({ innerJoin: innerJoinSpy }),
        }),
    } as never;

    await getProgramBudgetVsActual(db, {
      orgId: "org-isolated",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
    });

    expect(innerJoinSpy).toHaveBeenCalledWith(expenses, expect.anything());
    const onPredicate = innerJoinSpy.mock.calls[0]?.[1];
    const dialect = new PgDialect();
    const rendered = dialect.sqlToQuery(onPredicate as Parameters<PgDialect["sqlToQuery"]>[0]);
    // Must bind the orgId param to scope expenses to this org.
    expect(rendered.params).toContain("org-isolated");
  });

  // ---------------------------------------------------------------------------
  // Money precision test (fix #11)
  // ---------------------------------------------------------------------------

  it("neutralizes formula injection in category values (leading = becomes '=)", async () => {
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(
          reportChain([{ programId: "program-1", category: "=cmd()", budgetedCents: 1000 }]),
        )
        .mockReturnValueOnce(reportChain([])),
    } as never;

    const csv = await exportProgramBudgetVsActual(db, {
      orgId: "org-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      format: "csv",
    });

    // The formula must be neutralized with a leading single quote.
    expect(csv).toContain("'=cmd()");
    // And must NOT appear as a raw formula.
    expect(csv).not.toContain(",=cmd()");
  });

  it("force-quotes cell values containing a bare carriage return so row boundaries stay intact", async () => {
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(
          reportChain([{ programId: "program-1", category: "line1\rline2", budgetedCents: 1000 }]),
        )
        .mockReturnValueOnce(reportChain([])),
    } as never;

    const csv = await exportProgramBudgetVsActual(db, {
      orgId: "org-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      format: "csv",
    });

    // A bare \r must be wrapped in quotes, not emitted raw where a strict CSV
    // parser could treat it as a record separator.
    expect(csv).toContain('"line1\rline2"');
  });

  it("does not force-quote plain numeric cents values", async () => {
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(
          reportChain([{ programId: "prog-1", category: "Salaries", budgetedCents: 5000 }]),
        )
        .mockReturnValueOnce(
          reportChain([{ programId: "prog-1", category: "Salaries", actualCents: 3000 }]),
        ),
    } as never;

    const csv = await exportProgramBudgetVsActual(db, {
      orgId: "org-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      format: "csv",
    });

    const dataLine = csv.split("\n")[1] ?? "";
    // Numeric values should not be wrapped in quotes.
    expect(dataLine).not.toMatch(/"5000"/);
    expect(dataLine).not.toMatch(/"3000"/);
    expect(dataLine).toContain("5000");
    expect(dataLine).toContain("3000");
  });

  it("includes expenses on the final period day by binding the upper bound to end-of-day, not midnight (fix R57 #1)", async () => {
    // periodEnd is a date-only value ("2026-06-30"). The expenses.date column is a
    // timestamptz, so binding the upper bound to 2026-06-30T00:00:00Z would silently
    // drop every expense recorded on June 30 after midnight. The bound must be the
    // last instant of the day.
    const whereSpy = vi.fn().mockReturnValue({ groupBy: vi.fn().mockResolvedValue([]) });
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(reportChain([]))
        .mockReturnValueOnce({
          from: vi
            .fn()
            .mockReturnValue({ innerJoin: vi.fn().mockReturnValue({ where: whereSpy }) }),
        }),
    } as never;

    await getProgramBudgetVsActual(db, {
      orgId: "org-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-06-30",
    });

    const wherePredicate = whereSpy.mock.calls[0]?.[0];
    const dialect = new PgDialect();
    const rendered = dialect.sqlToQuery(wherePredicate as Parameters<PgDialect["sqlToQuery"]>[0]);
    const isoParams = rendered.params.map((p) => (p instanceof Date ? p.toISOString() : p));
    // The expense upper bound must be the last instant of June 30, never midnight.
    expect(isoParams).toContain("2026-06-30T23:59:59.999Z");
    expect(isoParams).not.toContain("2026-06-30T00:00:00.000Z");
  });

  it("uses integer round-half-up (floor + 5000 bias) for percentBasisPoints computation (fix #11)", async () => {
    // The second select call is for actualCents (first is budgetRows).
    let secondCallArg: unknown;
    let callCount = 0;
    const db2 = {
      select: vi.fn().mockImplementation((arg: unknown) => {
        callCount++;
        if (callCount === 2) secondCallArg = arg;
        return reportChain([]);
      }),
    } as never;

    await getProgramBudgetVsActual(db2, {
      orgId: "org-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
    });

    // Render the actualCents SQL template to a string and verify it uses integer arithmetic.
    const actualCentsSql = (secondCallArg as Record<string, unknown>)?.actualCents;
    const dialect = new PgDialect();
    const rendered = dialect.sqlToQuery(actualCentsSql as Parameters<PgDialect["sqlToQuery"]>[0]);
    // Must use floor + integer bias (5000), NOT round(... / 10000.0) with float divide.
    expect(rendered.sql).toContain("floor");
    expect(rendered.sql).not.toContain("/ 10000.0");
  });
});
