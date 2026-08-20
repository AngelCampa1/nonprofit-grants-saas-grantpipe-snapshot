import { describe, expect, it } from "vitest";
import { buildFunctionalExpensesCsv } from "./functional-expenses";

const baseReport = {
  rows: [
    {
      accountId: "e1",
      name: "Salaries",
      program: 60000,
      management: 20000,
      fundraising: 10000,
      total: 90000,
    },
  ],
  totals: { program: 60000, management: 20000, fundraising: 10000, total: 90000 },
};

describe("buildFunctionalExpensesCsv", () => {
  it("produces correct header and a normal data row", () => {
    const csv = buildFunctionalExpensesCsv(baseReport);
    expect(csv).toContain("Account Name,Program,Management,Fundraising,Total");
    expect(csv).toContain("Salaries");
    expect(csv).toContain("600.00");
    expect(csv).toContain("900.00");
  });

  it("escapes an account name containing a double-quote", () => {
    const report = {
      rows: [
        {
          accountId: "e2",
          name: 'Staff "Benefits"',
          program: 1000,
          management: 0,
          fundraising: 0,
          total: 1000,
        },
      ],
      totals: { program: 1000, management: 0, fundraising: 0, total: 1000 },
    };
    const csv = buildFunctionalExpensesCsv(report);
    expect(csv).toContain('"Staff ""Benefits"""');
  });

  it("escapes an account name containing a comma", () => {
    const report = {
      rows: [
        {
          accountId: "e3",
          name: "Program, General",
          program: 500,
          management: 0,
          fundraising: 0,
          total: 500,
        },
      ],
      totals: { program: 500, management: 0, fundraising: 0, total: 500 },
    };
    const csv = buildFunctionalExpensesCsv(report);
    expect(csv).toContain('"Program, General"');
  });

  it("escapes an account name containing a newline", () => {
    const report = {
      rows: [
        {
          accountId: "e4",
          name: "Office\nSupplies",
          program: 0,
          management: 200,
          fundraising: 0,
          total: 200,
        },
      ],
      totals: { program: 0, management: 200, fundraising: 0, total: 200 },
    };
    const csv = buildFunctionalExpensesCsv(report);
    expect(csv).toContain('"Office\nSupplies"');
  });

  it("escapes an account name starting with = (formula injection neutralized)", () => {
    const report = {
      rows: [
        { accountId: "e5", name: "=cmd()", program: 0, management: 0, fundraising: 0, total: 0 },
      ],
      totals: { program: 0, management: 0, fundraising: 0, total: 0 },
    };
    const csv = buildFunctionalExpensesCsv(report);
    expect(csv).toContain("'=cmd()");
  });

  it("includes TOTAL row with correct amounts", () => {
    const csv = buildFunctionalExpensesCsv(baseReport);
    expect(csv).toContain("TOTAL");
    expect(csv).toContain("600.00");
  });
});
