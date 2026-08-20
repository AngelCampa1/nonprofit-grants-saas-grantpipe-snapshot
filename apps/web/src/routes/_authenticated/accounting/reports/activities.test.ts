import { describe, expect, it } from "vitest";
import { buildActivitiesCsv } from "./activities";

const baseReport = {
  revenue: [
    {
      accountId: "r1",
      name: "Grants",
      withoutRestrictions: 100000,
      withRestrictions: 50000,
      total: 150000,
    },
  ],
  releases: { withoutRestrictions: 10000, withRestrictions: -10000 },
  expenses: [
    {
      accountId: "e1",
      name: "Salaries",
      withoutRestrictions: 80000,
      withRestrictions: 0,
      total: 80000,
    },
  ],
  changeInNetAssets: { withoutRestrictions: 30000, withRestrictions: 40000, total: 70000 },
  beginningNetAssets: { withoutRestrictions: 200000, withRestrictions: 100000, total: 300000 },
  endingNetAssets: { withoutRestrictions: 230000, withRestrictions: 140000, total: 370000 },
};

describe("buildActivitiesCsv", () => {
  it("produces header and normal revenue row", () => {
    const csv = buildActivitiesCsv(baseReport);
    expect(csv).toContain("Section,Account Name,Without Restrictions,With Restrictions,Total");
    expect(csv).toContain("Revenue");
    expect(csv).toContain("Grants");
    expect(csv).toContain("1000.00");
  });

  it("escapes an account name containing a double-quote", () => {
    const report = {
      ...baseReport,
      revenue: [
        {
          accountId: "r2",
          name: 'Fund "A"',
          withoutRestrictions: 5000,
          withRestrictions: 0,
          total: 5000,
        },
      ],
    };
    const csv = buildActivitiesCsv(report);
    expect(csv).toContain('"Fund ""A"""');
  });

  it("escapes an account name containing a comma", () => {
    const report = {
      ...baseReport,
      expenses: [
        {
          accountId: "e2",
          name: "Program, General",
          withoutRestrictions: 1000,
          withRestrictions: 0,
          total: 1000,
        },
      ],
    };
    const csv = buildActivitiesCsv(report);
    expect(csv).toContain('"Program, General"');
  });

  it("escapes an account name containing a newline", () => {
    const report = {
      ...baseReport,
      revenue: [
        {
          accountId: "r3",
          name: "Line1\nLine2",
          withoutRestrictions: 0,
          withRestrictions: 0,
          total: 0,
        },
      ],
    };
    const csv = buildActivitiesCsv(report);
    expect(csv).toContain('"Line1\nLine2"');
  });

  it("escapes an account name starting with = (formula injection neutralized)", () => {
    const report = {
      ...baseReport,
      revenue: [
        { accountId: "r4", name: "=cmd()", withoutRestrictions: 0, withRestrictions: 0, total: 0 },
      ],
    };
    const csv = buildActivitiesCsv(report);
    expect(csv).toContain("'=cmd()");
  });

  it("includes all summary rows", () => {
    const csv = buildActivitiesCsv(baseReport);
    expect(csv).toContain("Releases from Restrictions");
    expect(csv).toContain("Change in Net Assets");
    expect(csv).toContain("Beginning Net Assets");
    expect(csv).toContain("Ending Net Assets");
  });
});
