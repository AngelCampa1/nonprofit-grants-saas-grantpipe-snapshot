import { describe, expect, it } from "vitest";
import { buildFinancialPositionCsv } from "./financial-position";

const baseReport = {
  assets: {
    total: 200000,
    items: [{ accountId: "a1", code: "1000", name: "Cash", balanceCents: 200000 }],
  },
  liabilities: {
    total: 50000,
    items: [{ accountId: "l1", code: "2000", name: "Accounts Payable", balanceCents: 50000 }],
  },
  netAssets: {
    unrestricted: 100000,
    temporarilyRestricted: 40000,
    permanentlyRestricted: 10000,
    total: 150000,
  },
  totalLiabilitiesAndNetAssets: 200000,
};

describe("buildFinancialPositionCsv", () => {
  it("produces correct header and asset row", () => {
    const csv = buildFinancialPositionCsv(baseReport);
    expect(csv).toContain("Section,Account Code,Account Name,Balance");
    expect(csv).toContain("Assets");
    expect(csv).toContain("Cash");
    expect(csv).toContain("2000.00");
  });

  it("escapes an account name containing a double-quote", () => {
    const report = {
      ...baseReport,
      assets: {
        total: 100,
        items: [{ accountId: "a2", code: "1001", name: 'Cash "Main"', balanceCents: 100 }],
      },
    };
    const csv = buildFinancialPositionCsv(report);
    expect(csv).toContain('"Cash ""Main"""');
  });

  it("escapes an account name containing a comma", () => {
    const report = {
      ...baseReport,
      liabilities: {
        total: 500,
        items: [{ accountId: "l2", code: "2001", name: "Smith, Inc. Payable", balanceCents: 500 }],
      },
    };
    const csv = buildFinancialPositionCsv(report);
    expect(csv).toContain('"Smith, Inc. Payable"');
  });

  it("escapes an account name containing a newline", () => {
    const report = {
      ...baseReport,
      assets: {
        total: 0,
        items: [{ accountId: "a3", code: "1002", name: "Cash\nEquivalents", balanceCents: 0 }],
      },
    };
    const csv = buildFinancialPositionCsv(report);
    expect(csv).toContain('"Cash\nEquivalents"');
  });

  it("escapes an account name starting with = (formula injection neutralized)", () => {
    const report = {
      ...baseReport,
      assets: {
        total: 0,
        items: [{ accountId: "a4", code: "1003", name: "=EVIL()", balanceCents: 0 }],
      },
    };
    const csv = buildFinancialPositionCsv(report);
    expect(csv).toContain("'=EVIL()");
  });

  it("includes all summary sections", () => {
    const csv = buildFinancialPositionCsv(baseReport);
    expect(csv).toContain("Assets Total");
    expect(csv).toContain("Liabilities Total");
    expect(csv).toContain("Net Assets - Unrestricted");
    expect(csv).toContain("Net Assets Total");
    expect(csv).toContain("Total Liabilities and Net Assets");
  });
});
