import { describe, expect, it } from "vitest";
import { getNonprofitCoaSeed } from "./coaSeed";

describe("getNonprofitCoaSeed", () => {
  it("returns an array with the correct number of entries", () => {
    const seed = getNonprofitCoaSeed();
    expect(Array.isArray(seed)).toBe(true);
    expect(seed.length).toBe(36);
  });

  it("all entries have required fields: code, name, type", () => {
    const seed = getNonprofitCoaSeed();
    for (const entry of seed) {
      expect(typeof entry.code).toBe("string");
      expect(entry.code.length).toBeGreaterThan(0);
      expect(typeof entry.name).toBe("string");
      expect(entry.name.length).toBeGreaterThan(0);
      expect(typeof entry.type).toBe("string");
      expect(["asset", "liability", "net_assets", "revenue", "expense"]).toContain(entry.type);
    }
  });

  it("all entries with parentCode have a matching parent in the array", () => {
    const seed = getNonprofitCoaSeed();
    const codes = new Set(seed.map((e) => e.code));
    for (const entry of seed) {
      if (entry.parentCode) {
        expect(codes.has(entry.parentCode)).toBe(true);
      }
    }
  });

  it("all net_assets entries have naturalRestriction defined", () => {
    const seed = getNonprofitCoaSeed();
    const netAssets = seed.filter((e) => e.type === "net_assets");
    expect(netAssets.length).toBeGreaterThan(0);
    for (const entry of netAssets) {
      expect(entry.naturalRestriction).toBeDefined();
      expect(["unrestricted", "temporarily_restricted", "permanently_restricted"]).toContain(
        entry.naturalRestriction,
      );
    }
  });

  it("all expense entries have functionalClass defined", () => {
    const seed = getNonprofitCoaSeed();
    const expenses = seed.filter((e) => e.type === "expense");
    expect(expenses.length).toBeGreaterThan(0);
    for (const entry of expenses) {
      expect(entry.functionalClass).toBeDefined();
      expect(["program", "management", "fundraising"]).toContain(entry.functionalClass);
    }
  });

  it("has no duplicate codes", () => {
    const seed = getNonprofitCoaSeed();
    const codes = seed.map((e) => e.code);
    const uniqueCodes = new Set(codes);
    expect(uniqueCodes.size).toBe(codes.length);
  });

  it("includes expected top-level account categories", () => {
    const seed = getNonprofitCoaSeed();
    const codes = seed.map((e) => e.code);
    // Spot-check key accounts
    expect(codes).toContain("1000"); // Cash
    expect(codes).toContain("2000"); // Accounts Payable
    expect(codes).toContain("3000"); // Net Assets Unrestricted
    expect(codes).toContain("4000"); // Contributions Unrestricted
    expect(codes).toContain("5000"); // Program Expenses
    expect(codes).toContain("6000"); // M&G Expenses
    expect(codes).toContain("7000"); // Fundraising Expenses
  });

  it("all types are valid account types", () => {
    const seed = getNonprofitCoaSeed();
    const validTypes = ["asset", "liability", "net_assets", "revenue", "expense"];
    for (const entry of seed) {
      expect(validTypes).toContain(entry.type);
    }
  });

  it("includes the three pledge-related accounts (1150, 1190, 6500)", () => {
    const seed = getNonprofitCoaSeed();
    const codes = seed.map((e) => e.code);
    expect(codes).toContain("1150");
    expect(codes).toContain("1190");
    expect(codes).toContain("6500");
  });

  it("contra_asset accounts are children of 1100 Pledges Receivable", () => {
    const seed = getNonprofitCoaSeed();
    const contra1150 = seed.find((e) => e.code === "1150");
    const contra1190 = seed.find((e) => e.code === "1190");
    expect(contra1150?.subtype).toBe("contra_asset");
    expect(contra1150?.parentCode).toBe("1100");
    expect(contra1190?.subtype).toBe("contra_asset");
    expect(contra1190?.parentCode).toBe("1100");
  });

  it("6500 Uncollectible Pledge Expense is a management expense child of 6000", () => {
    const seed = getNonprofitCoaSeed();
    const acc6500 = seed.find((e) => e.code === "6500");
    expect(acc6500?.type).toBe("expense");
    expect(acc6500?.functionalClass).toBe("management");
    expect(acc6500?.parentCode).toBe("6000");
  });
});
