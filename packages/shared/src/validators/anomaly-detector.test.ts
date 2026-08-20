import { describe, expect, it } from "vitest";
import {
  ANOMALY_CLASSES,
  ANOMALY_SEVERITIES,
  DUPLICATE_DONATION_WINDOW_DAYS,
  classifyCategoryMisallocation,
  classifyDuplicateDonationGroup,
  classifyIndirectRateMismatch,
  classifyReleaseOverBalance,
  compareSeverity,
  deriveIndirectRateBasisPoints,
} from "./anomaly-detector";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("ANOMALY_CLASSES", () => {
  it("exposes the four classes in order", () => {
    expect(ANOMALY_CLASSES).toEqual([
      "category_misallocation",
      "release_over_balance",
      "duplicate_donation",
      "indirect_rate_mismatch",
    ]);
  });
});

describe("ANOMALY_SEVERITIES", () => {
  it("exposes the three severities in order", () => {
    expect(ANOMALY_SEVERITIES).toEqual(["info", "warning", "critical"]);
  });
});

describe("DUPLICATE_DONATION_WINDOW_DAYS", () => {
  it("is 3", () => {
    expect(DUPLICATE_DONATION_WINDOW_DAYS).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// compareSeverity
// ---------------------------------------------------------------------------

describe("compareSeverity", () => {
  it("info < warning", () => {
    expect(compareSeverity("info", "warning")).toBeLessThan(0);
  });

  it("warning < critical", () => {
    expect(compareSeverity("warning", "critical")).toBeLessThan(0);
  });

  it("info < critical", () => {
    expect(compareSeverity("info", "critical")).toBeLessThan(0);
  });

  it("equal severities return 0", () => {
    expect(compareSeverity("warning", "warning")).toBe(0);
    expect(compareSeverity("info", "info")).toBe(0);
    expect(compareSeverity("critical", "critical")).toBe(0);
  });

  it("critical > warning", () => {
    expect(compareSeverity("critical", "warning")).toBeGreaterThan(0);
  });

  it("warning > info", () => {
    expect(compareSeverity("warning", "info")).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// classifyCategoryMisallocation
// ---------------------------------------------------------------------------

describe("classifyCategoryMisallocation", () => {
  it("not an anomaly when both category and accountId are null (matches any restriction)", () => {
    const result = classifyCategoryMisallocation({
      expenseCategory: null,
      expenseAccountId: null,
      allowedCategories: [{ category: "salaries", accountId: "acct-1" }],
    });
    expect(result.isAnomaly).toBe(false);
  });

  it("not an anomaly when allowedCategories is empty (open set)", () => {
    const result = classifyCategoryMisallocation({
      expenseCategory: "travel",
      expenseAccountId: null,
      allowedCategories: [],
    });
    expect(result.isAnomaly).toBe(false);
  });

  it("not an anomaly when expense category matches a row's category", () => {
    const result = classifyCategoryMisallocation({
      expenseCategory: "salaries",
      expenseAccountId: null,
      allowedCategories: [
        { category: "salaries", accountId: null },
        { category: "travel", accountId: null },
      ],
    });
    expect(result.isAnomaly).toBe(false);
  });

  it("not an anomaly when expense accountId matches a row's accountId", () => {
    const result = classifyCategoryMisallocation({
      expenseCategory: null,
      expenseAccountId: "acct-99",
      allowedCategories: [{ category: null, accountId: "acct-99" }],
    });
    expect(result.isAnomaly).toBe(false);
  });

  it("not an anomaly when both category and accountId match a single row", () => {
    const result = classifyCategoryMisallocation({
      expenseCategory: "salaries",
      expenseAccountId: "acct-1",
      allowedCategories: [{ category: "salaries", accountId: "acct-1" }],
    });
    expect(result.isAnomaly).toBe(false);
  });

  it("anomaly when category does not match any allowed row", () => {
    const result = classifyCategoryMisallocation({
      expenseCategory: "entertainment",
      expenseAccountId: null,
      allowedCategories: [
        { category: "salaries", accountId: null },
        { category: "travel", accountId: null },
      ],
    });
    expect(result.isAnomaly).toBe(true);
    expect(result.severity).toBe("critical");
    expect(result.reason).toContain("entertainment");
  });

  it("anomaly when accountId does not match any allowed row", () => {
    const result = classifyCategoryMisallocation({
      expenseCategory: null,
      expenseAccountId: "acct-bad",
      allowedCategories: [{ category: null, accountId: "acct-1" }],
    });
    expect(result.isAnomaly).toBe(true);
    expect(result.severity).toBe("critical");
  });

  it("anomaly when category matches a row but accountId does not match that same row", () => {
    // Row has category "salaries" but accountId "acct-1"; expense has accountId "acct-2"
    const result = classifyCategoryMisallocation({
      expenseCategory: "salaries",
      expenseAccountId: "acct-2",
      allowedCategories: [{ category: "salaries", accountId: "acct-1" }],
    });
    expect(result.isAnomaly).toBe(true);
    expect(result.severity).toBe("critical");
  });

  it("anomaly when row has null accountId but expense specifies a non-null accountId (DB helper exact-match semantics)", () => {
    // Mirror of postingEngine: (!expense.accountId || row.accountId === expense.accountId)
    // expense.accountId is truthy, row.accountId is null => null !== "acct-anything" => no match => anomaly
    const result = classifyCategoryMisallocation({
      expenseCategory: "salaries",
      expenseAccountId: "acct-anything",
      allowedCategories: [{ category: "salaries", accountId: null }],
    });
    expect(result.isAnomaly).toBe(true);
    expect(result.severity).toBe("critical");
  });

  it("not an anomaly when expense has null accountId and row matches on category only", () => {
    // expense.accountId is null (falsy) => (!expense.accountId) is true => accountId condition passes
    const result = classifyCategoryMisallocation({
      expenseCategory: "salaries",
      expenseAccountId: null,
      allowedCategories: [{ category: "salaries", accountId: "acct-1" }],
    });
    expect(result.isAnomaly).toBe(false);
  });

  it("reason includes category label when category is present", () => {
    const result = classifyCategoryMisallocation({
      expenseCategory: "entertainment",
      expenseAccountId: null,
      allowedCategories: [{ category: "salaries", accountId: null }],
    });
    expect(result.reason).toContain("entertainment");
  });

  it("reason falls back to accountId when category is null but accountId is present", () => {
    const result = classifyCategoryMisallocation({
      expenseCategory: null,
      expenseAccountId: "acct-xyz",
      allowedCategories: [{ category: null, accountId: "acct-other" }],
    });
    expect(result.reason).toContain("acct-xyz");
  });
});

// ---------------------------------------------------------------------------
// classifyReleaseOverBalance
// ---------------------------------------------------------------------------

describe("classifyReleaseOverBalance", () => {
  it("not an anomaly when release equals balance exactly", () => {
    const result = classifyReleaseOverBalance({
      releaseAmountCents: 1000,
      availableBalanceCents: 1000,
    });
    expect(result.isAnomaly).toBe(false);
    expect(result.overByCents).toBe(0);
  });

  it("not an anomaly when release is less than balance", () => {
    const result = classifyReleaseOverBalance({
      releaseAmountCents: 500,
      availableBalanceCents: 1000,
    });
    expect(result.isAnomaly).toBe(false);
    expect(result.overByCents).toBe(0);
  });

  it("anomaly when release is over balance by 1 cent", () => {
    const result = classifyReleaseOverBalance({
      releaseAmountCents: 1001,
      availableBalanceCents: 1000,
    });
    expect(result.isAnomaly).toBe(true);
    expect(result.severity).toBe("critical");
    expect(result.overByCents).toBe(1);
    expect(result.reason).toBeTruthy();
  });

  it("anomaly when release is substantially over balance", () => {
    const result = classifyReleaseOverBalance({
      releaseAmountCents: 5000,
      availableBalanceCents: 1000,
    });
    expect(result.isAnomaly).toBe(true);
    expect(result.overByCents).toBe(4000);
  });

  it("not an anomaly when both are zero", () => {
    const result = classifyReleaseOverBalance({
      releaseAmountCents: 0,
      availableBalanceCents: 0,
    });
    expect(result.isAnomaly).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// classifyDuplicateDonationGroup
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

describe("classifyDuplicateDonationGroup", () => {
  it("not an anomaly for a single donation", () => {
    const result = classifyDuplicateDonationGroup({
      donations: [{ id: "d1", dateMs: 0 }],
    });
    expect(result.isAnomaly).toBe(false);
    expect(result.duplicateIds).toEqual([]);
  });

  it("not an anomaly for empty list", () => {
    const result = classifyDuplicateDonationGroup({ donations: [] });
    expect(result.isAnomaly).toBe(false);
  });

  it("anomaly when two donations are on the same day", () => {
    const result = classifyDuplicateDonationGroup({
      donations: [
        { id: "d1", dateMs: 0 },
        { id: "d2", dateMs: 0 },
      ],
    });
    expect(result.isAnomaly).toBe(true);
    expect(result.severity).toBe("warning");
    expect(result.duplicateIds).toEqual(["d1", "d2"]);
  });

  it("anomaly when two donations are exactly windowDays apart (inclusive boundary)", () => {
    const windowDays = DUPLICATE_DONATION_WINDOW_DAYS;
    const result = classifyDuplicateDonationGroup({
      donations: [
        { id: "d1", dateMs: 0 },
        { id: "d2", dateMs: windowDays * DAY_MS },
      ],
    });
    expect(result.isAnomaly).toBe(true);
    expect(result.duplicateIds).toEqual(["d1", "d2"]);
  });

  it("not an anomaly when two donations are just outside the window", () => {
    const windowDays = DUPLICATE_DONATION_WINDOW_DAYS;
    const result = classifyDuplicateDonationGroup({
      donations: [
        { id: "d1", dateMs: 0 },
        { id: "d2", dateMs: windowDays * DAY_MS + 1 },
      ],
    });
    expect(result.isAnomaly).toBe(false);
    expect(result.duplicateIds).toEqual([]);
  });

  it("three-donation cluster: two close, one outlier — only the close pair flagged", () => {
    // d1 and d2 are within window; d3 is far away
    const result = classifyDuplicateDonationGroup({
      donations: [
        { id: "d1", dateMs: 0 },
        { id: "d2", dateMs: DAY_MS },
        { id: "d3", dateMs: 100 * DAY_MS },
      ],
    });
    expect(result.isAnomaly).toBe(true);
    expect(result.duplicateIds).toEqual(["d1", "d2"]);
    expect(result.duplicateIds).not.toContain("d3");
  });

  it("all three donations flagged when all within window of at least one other", () => {
    // d1-d2 within window, d2-d3 within window => d1, d2, d3 all flagged
    const result = classifyDuplicateDonationGroup({
      donations: [
        { id: "d1", dateMs: 0 },
        { id: "d2", dateMs: DAY_MS },
        { id: "d3", dateMs: 2 * DAY_MS },
      ],
      windowDays: 2,
    });
    expect(result.isAnomaly).toBe(true);
    expect(result.duplicateIds).toEqual(["d1", "d2", "d3"]);
  });

  it("respects custom windowDays parameter", () => {
    const result = classifyDuplicateDonationGroup({
      donations: [
        { id: "d1", dateMs: 0 },
        { id: "d2", dateMs: 10 * DAY_MS },
      ],
      windowDays: 10,
    });
    expect(result.isAnomaly).toBe(true);
  });

  it("duplicateIds are sorted by dateMs then id", () => {
    // Feed in reverse order — should still sort by dateMs asc, then id
    const result = classifyDuplicateDonationGroup({
      donations: [
        { id: "d3", dateMs: DAY_MS },
        { id: "d1", dateMs: 0 },
        { id: "d2", dateMs: 0 },
      ],
    });
    expect(result.isAnomaly).toBe(true);
    // d1 and d2 both at 0 (sorted by id), d3 at DAY_MS
    expect(result.duplicateIds).toEqual(["d1", "d2", "d3"]);
  });

  it("reason mentions the duplicate count", () => {
    const result = classifyDuplicateDonationGroup({
      donations: [
        { id: "d1", dateMs: 0 },
        { id: "d2", dateMs: 0 },
      ],
    });
    expect(result.reason).toContain("2");
  });
});

// ---------------------------------------------------------------------------
// classifyIndirectRateMismatch
// ---------------------------------------------------------------------------

describe("classifyIndirectRateMismatch", () => {
  it("not an anomaly when the posted amount matches the expected amount", () => {
    const result = classifyIndirectRateMismatch({
      postedAmountCents: 15000,
      expectedRateBasisPoints: 1500,
      expectedAmountCents: 15000,
    });
    expect(result.isAnomaly).toBe(false);
    expect(result.deltaCents).toBe(0);
    expect(result.reason).toBe("");
  });

  it("anomaly when the posted amount exceeds the expected amount", () => {
    const result = classifyIndirectRateMismatch({
      postedAmountCents: 20000,
      expectedRateBasisPoints: 1500,
      expectedAmountCents: 15000,
    });
    expect(result.isAnomaly).toBe(true);
    expect(result.severity).toBe("warning");
    expect(result.deltaCents).toBe(5000);
    expect(result.reason).toContain("$200.00");
    expect(result.reason).toContain("$150.00");
    expect(result.reason).toContain("over");
  });

  it("deltaCents is negative and reason says under when posted is below expected", () => {
    const result = classifyIndirectRateMismatch({
      postedAmountCents: 5000,
      expectedRateBasisPoints: 1500,
      expectedAmountCents: 7500,
    });
    expect(result.isAnomaly).toBe(true);
    expect(result.deltaCents).toBe(-2500);
    expect(result.reason).toContain("under");
    expect(result.reason).toContain("$25.00");
  });
});

// ---------------------------------------------------------------------------
// deriveIndirectRateBasisPoints
// ---------------------------------------------------------------------------

describe("deriveIndirectRateBasisPoints", () => {
  it("derives the effective rate from posted amount over base (10% = 1000 bps)", () => {
    expect(deriveIndirectRateBasisPoints({ postedAmountCents: 10000, baseAmountCents: 100000 })).toBe(
      1000,
    );
  });

  it("rounds to the nearest basis point", () => {
    expect(deriveIndirectRateBasisPoints({ postedAmountCents: 12345, baseAmountCents: 100000 })).toBe(
      1235,
    );
  });

  it("returns null when the base is zero", () => {
    expect(deriveIndirectRateBasisPoints({ postedAmountCents: 10000, baseAmountCents: 0 })).toBeNull();
  });

  it("returns null when the base is negative", () => {
    expect(deriveIndirectRateBasisPoints({ postedAmountCents: 10000, baseAmountCents: -50 })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Branch-coverage edge cases
// ---------------------------------------------------------------------------

describe("classifier branch edge cases", () => {
  it("misallocation label falls back to accountId when category is null", () => {
    const result = classifyCategoryMisallocation({
      expenseCategory: null,
      expenseAccountId: "acct-99",
      allowedCategories: [{ category: "travel", accountId: "acct-1" }],
    });
    expect(result.isAnomaly).toBe(true);
    expect(result.reason).toContain("acct-99");
  });

  it("duplicate detection uses the default window when windowDays is omitted", () => {
    const base = 1_700_000_000_000;
    const result = classifyDuplicateDonationGroup({
      donations: [
        { id: "a", dateMs: base },
        { id: "b", dateMs: base + DUPLICATE_DONATION_WINDOW_DAYS * 86_400_000 },
      ],
    });
    expect(result.isAnomaly).toBe(true);
    expect(result.duplicateIds).toEqual(["a", "b"]);
  });

  it("indirect mismatch reason states the dollar amounts and direction", () => {
    const result = classifyIndirectRateMismatch({
      postedAmountCents: 12340,
      expectedRateBasisPoints: 1500,
      expectedAmountCents: 15000,
    });
    expect(result.reason).toContain("$123.40");
    expect(result.reason).toContain("$150.00");
    expect(result.reason).toContain("under");
  });
});
