import { afterEach, describe, expect, it, vi } from "vitest";
import {
  calculateGrantBurnRate,
  buildFundSummary,
  buildGrantSummary,
  deriveRequirementStatus,
  normalizeMetricValue,
} from "./summary";

describe("normalizeMetricValue", () => {
  it("normalizes strings and numbers into numbers", () => {
    expect(normalizeMetricValue("42.5")).toBe(42.5);
    expect(normalizeMetricValue(10)).toBe(10);
  });

  it("falls back to zero for invalid values", () => {
    expect(normalizeMetricValue("abc")).toBe(0);
    expect(normalizeMetricValue(null)).toBe(0);
    expect(normalizeMetricValue(undefined)).toBe(0);
  });
});

describe("deriveRequirementStatus", () => {
  it("keeps submitted requirements submitted", () => {
    expect(
      deriveRequirementStatus({
        status: "submitted",
        dueDate: "2026-01-01T00:00:00Z",
      }),
    ).toBe("submitted");
  });

  it("marks past-due requirements overdue", () => {
    expect(
      deriveRequirementStatus(
        {
          status: "upcoming",
          dueDate: "2026-01-01T00:00:00Z",
        },
        new Date("2026-02-01T00:00:00Z"),
      ),
    ).toBe("overdue");
  });

  it("preserves non-submitted future states", () => {
    expect(
      deriveRequirementStatus(
        {
          status: "in_progress",
          dueDate: "2026-03-01T00:00:00Z",
        },
        new Date("2026-02-01T00:00:00Z"),
      ),
    ).toBe("in_progress");
  });

  it("supports Date due dates without reparsing", () => {
    expect(
      deriveRequirementStatus(
        {
          status: "upcoming",
          dueDate: new Date("2026-03-01T00:00:00Z"),
        },
        new Date("2026-02-01T00:00:00Z"),
      ),
    ).toBe("upcoming");
  });
});

describe("buildGrantSummary", () => {
  it("computes threshold states and balances", () => {
    const summary = buildGrantSummary({
      grantAmountCents: 1_000_000,
      allocationTotalCents: 850_000,
      expenseTotalCents: 920_000,
    });

    expect(summary.allocationCoverageRatio).toBe(0.85);
    expect(summary.allocatedTotalCents).toBe(850_000);
    expect(summary.expenseRatio).toBe(0.92);
    expect(summary.remainingBalanceCents).toBe(80_000);
    expect(summary.unallocatedBalanceCents).toBe(150_000);
    expect(summary.thresholdState).toBe("90");
  });

  it("exposes spend-down remaining and unallocated balances separately", () => {
    // Grant: $500K, allocated $200K, expenses $400K
    const summary = buildGrantSummary({
      grantAmountCents: 500_000,
      allocationTotalCents: 200_000,
      expenseTotalCents: 400_000,
    });
    expect(summary.remainingBalanceCents).toBe(100_000);
    expect(summary.unallocatedBalanceCents).toBe(300_000);
  });

  it("exposes the raw allocated total even when the grant has no budget", () => {
    const summary = buildGrantSummary({
      grantAmountCents: null,
      allocationTotalCents: 50_000_00,
      expenseTotalCents: 0,
    });
    expect(summary.allocatedTotalCents).toBe(50_000_00);
  });

  it("returns neutral threshold for grants without budget", () => {
    const summary = buildGrantSummary({
      grantAmountCents: null,
      allocationTotalCents: 200_000,
      expenseTotalCents: 100_000,
    });

    expect(summary.expenseRatio).toBe(0);
    expect(summary.remainingBalanceCents).toBeNull();
    expect(summary.unallocatedBalanceCents).toBeNull();
    expect(summary.thresholdState).toBe(null);
  });

  it("marks fully spent grants at 100 percent", () => {
    const summary = buildGrantSummary({
      grantAmountCents: 100_000,
      allocationTotalCents: 100_000,
      expenseTotalCents: 100_000,
    });

    expect(summary.thresholdState).toBe("100");
  });

  it("coerces string aggregate inputs from the pg driver into numbers", () => {
    // Postgres SUM() comes back as a string through the node-postgres driver,
    // so the raw sql<number> totals reaching this helper can be strings. The
    // pass-through allocatedTotalCents field must be a number, not a string.
    const summary = buildGrantSummary({
      grantAmountCents: 1_000_000,
      allocationTotalCents: "850000" as unknown as number,
      expenseTotalCents: "920000" as unknown as number,
    });

    expect(summary.allocatedTotalCents).toBe(850_000);
    expect(typeof summary.allocatedTotalCents).toBe("number");
    expect(summary.remainingBalanceCents).toBe(80_000);
    expect(summary.unallocatedBalanceCents).toBe(150_000);
    expect(summary.expenseRatio).toBeCloseTo(0.92);
  });
});

describe("calculateGrantBurnRate", () => {
  it("calculates a monthly burn rate from grant start date to now", () => {
    expect(
      calculateGrantBurnRate({
        expenseTotalCents: 300_000,
        startDate: "2026-01-01T00:00:00Z",
        now: new Date("2026-04-01T00:00:00Z"),
      }),
    ).toBe(100_000);
  });

  it("returns null when start date is missing or elapsed time is non-positive", () => {
    expect(
      calculateGrantBurnRate({
        expenseTotalCents: 300_000,
        startDate: null,
        now: new Date("2026-04-01T00:00:00Z"),
      }),
    ).toBeNull();

    expect(
      calculateGrantBurnRate({
        expenseTotalCents: 300_000,
        startDate: "2026-04-15T00:00:00Z",
        now: new Date("2026-04-01T00:00:00Z"),
      }),
    ).toBeNull();
  });

  it("supports Date inputs and falls back to the current clock when now is omitted", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T00:00:00Z"));

    expect(
      calculateGrantBurnRate({
        expenseTotalCents: 300_000,
        startDate: new Date("2026-01-01T00:00:00Z"),
      }),
    ).toBe(100_000);
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("buildFundSummary", () => {
  it("computes current balance and threshold state", () => {
    const summary = buildFundSummary({
      allocatedTotalCents: 500_000,
      expenseTotalCents: 410_000,
    });

    expect(summary.allocatedTotalCents).toBe(500_000);
    expect(summary.expenseTotalCents).toBe(410_000);
    expect(summary.currentBalanceCents).toBe(90_000);
    expect(summary.expenseRatio).toBe(0.82);
    expect(summary.thresholdState).toBe("80");
  });

  it("returns null threshold when there are no allocations", () => {
    const summary = buildFundSummary({
      allocatedTotalCents: 0,
      expenseTotalCents: 10_000,
    });

    expect(summary.currentBalanceCents).toBe(-10_000);
    expect(summary.thresholdState).toBe(null);
  });

  it("marks nearly fully spent funds at 90 percent", () => {
    const summary = buildFundSummary({
      allocatedTotalCents: 100_000,
      expenseTotalCents: 95_000,
    });

    expect(summary.thresholdState).toBe("90");
  });

  it("coerces string aggregate inputs from the pg driver into numbers", () => {
    const summary = buildFundSummary({
      allocatedTotalCents: "500000" as unknown as number,
      expenseTotalCents: "410000" as unknown as number,
    });

    expect(summary.allocatedTotalCents).toBe(500_000);
    expect(typeof summary.allocatedTotalCents).toBe("number");
    expect(summary.expenseTotalCents).toBe(410_000);
    expect(typeof summary.expenseTotalCents).toBe("number");
    expect(summary.currentBalanceCents).toBe(90_000);
  });
});
