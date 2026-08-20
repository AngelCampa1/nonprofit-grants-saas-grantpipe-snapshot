import { describe, expect, it, vi } from "vitest";
import type { Database } from "@grantpipe/db";

import {
  getReimbursementCashFlowRadar,
  summarizeCashFlowRadarRows,
  type CashFlowRadarRow,
} from "./cash-flow.service";

const baseRow: CashFlowRadarRow = {
  grantId: "grant-1",
  grantName: "Mobile Clinic Grant",
  grantStatus: "active",
  grantAmountCents: 100_000,
  grantEndDate: new Date("2026-12-31T00:00:00.000Z"),
  eligibleExpenseCents: 45_000,
  oldestUnrequestedExpenseDate: new Date("2026-05-01T00:00:00.000Z"),
  claimedCents: 15_000,
  submittedCents: 10_000,
  approvedOutstandingCents: 5_000,
  paidCents: 0,
};

describe("summarizeCashFlowRadarRows", () => {
  it("summarizes unrequested, in-flight, and approved cash gaps", () => {
    const result = summarizeCashFlowRadarRows([baseRow], {
      asOf: new Date("2026-06-17T00:00:00.000Z"),
    });

    expect(result.totals).toEqual({
      eligibleExpenseCents: 45_000,
      unrequestedExpenseCents: 30_000,
      submittedCents: 10_000,
      approvedOutstandingCents: 5_000,
      totalCashGapCents: 45_000,
      criticalCount: 1,
      warningCount: 0,
    });
    expect(result.worklist[0]).toMatchObject({
      grantId: "grant-1",
      grantName: "Mobile Clinic Grant",
      unrequestedExpenseCents: 30_000,
      totalCashGapCents: 45_000,
      riskLevel: "critical",
      recommendedAction: "Create a reimbursement request for posted eligible expenses.",
    });
  });

  it("marks submitted-only gaps as watch items", () => {
    const result = summarizeCashFlowRadarRows(
      [
        {
          ...baseRow,
          eligibleExpenseCents: 9_000,
          oldestUnrequestedExpenseDate: null,
          claimedCents: 9_000,
          submittedCents: 9_000,
          approvedOutstandingCents: 0,
        },
      ],
      { asOf: new Date("2026-06-17T00:00:00.000Z") },
    );

    expect(result.totals.warningCount).toBe(0);
    expect(result.worklist[0]?.riskLevel).toBe("watch");
    expect(result.worklist[0]?.recommendedAction).toBe("Follow up on submitted requests.");
  });

  it("marks approved-only gaps for payment recording", () => {
    const result = summarizeCashFlowRadarRows(
      [
        {
          ...baseRow,
          eligibleExpenseCents: 20_000,
          claimedCents: 20_000,
          submittedCents: 0,
          approvedOutstandingCents: 30_000,
          oldestUnrequestedExpenseDate: null,
        },
      ],
      { asOf: new Date("2026-06-17T00:00:00.000Z") },
    );

    expect(result.worklist[0]?.riskLevel).toBe("critical");
    expect(result.worklist[0]?.recommendedAction).toBe(
      "Record cash when the funder payment arrives.",
    );
  });

  it("handles invalid row values without emitting invalid dates or amounts", () => {
    const result = summarizeCashFlowRadarRows(
      [
        {
          ...baseRow,
          grantAmountCents: undefined as unknown as number,
          grantEndDate: "not-a-date",
          eligibleExpenseCents: "bad",
          oldestUnrequestedExpenseDate: "bad-date",
          claimedCents: "also-bad",
          submittedCents: "12000",
          approvedOutstandingCents: "0",
          paidCents: "paid",
        },
      ],
      { asOf: new Date("2026-06-17T00:00:00.000Z") },
    );

    expect(result.totals.submittedCents).toBe(12_000);
    expect(result.worklist[0]).toMatchObject({
      grantAmountCents: null,
      grantEndDate: null,
      paidCents: 0,
      riskLevel: "warning",
      daysSinceOldestUnrequestedExpense: null,
    });
  });

  it("marks old unrequested expenses as warning before the critical age", () => {
    const result = summarizeCashFlowRadarRows(
      [
        {
          ...baseRow,
          grantAmountCents: null,
          eligibleExpenseCents: 5_000,
          claimedCents: 0,
          submittedCents: 0,
          approvedOutstandingCents: 0,
          oldestUnrequestedExpenseDate: "2026-06-01T00:00:00.000Z",
        },
      ],
      { asOf: new Date("2026-06-17T00:00:00.000Z") },
    );

    expect(result.worklist[0]?.riskLevel).toBe("warning");
    expect(result.worklist[0]?.daysSinceOldestUnrequestedExpense).toBe(16);
  });

  it("clamps future unrequested expense dates to zero days old", () => {
    const result = summarizeCashFlowRadarRows(
      [
        {
          ...baseRow,
          grantAmountCents: null,
          eligibleExpenseCents: 5_000,
          claimedCents: 0,
          submittedCents: 0,
          approvedOutstandingCents: 0,
          oldestUnrequestedExpenseDate: "2026-06-20T00:00:00.000Z",
        },
      ],
      { asOf: new Date("2026-06-17T00:00:00.000Z") },
    );

    expect(result.worklist[0]?.daysSinceOldestUnrequestedExpense).toBe(0);
    expect(result.worklist[0]?.riskLevel).toBe("watch");
  });

  it("omits grants with no cash gap from the worklist", () => {
    const result = summarizeCashFlowRadarRows(
      [
        {
          ...baseRow,
          eligibleExpenseCents: 10_000,
          oldestUnrequestedExpenseDate: null,
          claimedCents: 10_000,
          submittedCents: 0,
          approvedOutstandingCents: 0,
          paidCents: 10_000,
        },
      ],
      { asOf: new Date("2026-06-17T00:00:00.000Z") },
    );

    expect(result.worklist).toEqual([]);
    expect(result.totals.totalCashGapCents).toBe(0);
  });
});

describe("getReimbursementCashFlowRadar", () => {
  it("executes the radar query scoped to the organization", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [baseRow] });
    const db = { execute } as unknown as Database;

    const result = await getReimbursementCashFlowRadar(db, {
      orgId: "org-1",
      asOf: new Date("2026-06-17T00:00:00.000Z"),
    });

    expect(execute).toHaveBeenCalledTimes(1);
    const queryObject = execute.mock.calls[0]?.[0];
    const queryStrings: string[] = [];
    const visit = (value: unknown) => {
      if (typeof value === "string") {
        queryStrings.push(value);
        return;
      }
      if (value === null || typeof value !== "object") return;
      if (Array.isArray(value)) {
        for (const item of value) visit(item);
        return;
      }
      for (const nested of Object.values(value as Record<string, unknown>)) {
        visit(nested);
      }
    };
    visit(queryObject);
    const queryText = queryStrings.join(" ");
    expect(queryText).toContain("where g.org_id =");
    expect(queryText).toContain("e.org_id =");
    expect(queryText).toContain("r.org_id =");
    expect(queryText).toContain("r.status <> 'rejected'");
    expect(queryText).toContain("existing_request.status <> 'rejected'");
    expect(queryText).not.toContain("status not in ('rejected', 'closed')");
    expect(result.totals.totalCashGapCents).toBe(45_000);
  });

  it("accepts array execute results", async () => {
    const execute = vi.fn().mockResolvedValue([baseRow]);
    const db = { execute } as unknown as Database;

    const result = await getReimbursementCashFlowRadar(db, {
      orgId: "org-1",
      asOf: new Date("2026-06-17T00:00:00.000Z"),
    });

    expect(result.worklist).toHaveLength(1);
  });

  it("returns an empty summary when execute returns no rows", async () => {
    const execute = vi.fn().mockResolvedValue({});
    const db = { execute } as unknown as Database;

    const result = await getReimbursementCashFlowRadar(db, {
      orgId: "org-1",
      asOf: new Date("2026-06-17T00:00:00.000Z"),
    });

    expect(result).toEqual({
      totals: {
        eligibleExpenseCents: 0,
        unrequestedExpenseCents: 0,
        submittedCents: 0,
        approvedOutstandingCents: 0,
        totalCashGapCents: 0,
        criticalCount: 0,
        warningCount: 0,
      },
      worklist: [],
    });
  });
});
