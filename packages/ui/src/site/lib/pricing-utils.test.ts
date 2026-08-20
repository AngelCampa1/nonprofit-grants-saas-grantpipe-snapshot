import { describe, it, expect } from "vitest";
import {
  formatAnnualPrice,
  formatAnnualMonthlyEquivalent,
  formatAnnualPriceFromCents,
  formatAnnualMonthlyEquivalentFromCents,
} from "./pricing-utils";

describe("formatAnnualPrice", () => {
  it("returns $490/yr for 4900 cents", () => {
    expect(formatAnnualPrice(4900)).toBe("$490/yr");
  });

  it("returns $200/yr for 2000 cents", () => {
    expect(formatAnnualPrice(2000)).toBe("$200/yr");
  });

  it("returns $990/yr for 9900 cents", () => {
    expect(formatAnnualPrice(9900)).toBe("$990/yr");
  });

  it("returns $29.90/yr for 299 cents", () => {
    expect(formatAnnualPrice(299)).toBe("$29.90/yr");
  });

  it("returns $0/yr for 0 cents", () => {
    expect(formatAnnualPrice(0)).toBe("$0/yr");
  });

  it("returns $490/user/yr for 4900 cents with /user unitLabel", () => {
    expect(formatAnnualPrice(4900, "/user")).toBe("$490/user/yr");
  });

  it("returns $29.90/child/yr for 299 cents with /child unitLabel", () => {
    expect(formatAnnualPrice(299, "/child")).toBe("$29.90/child/yr");
  });

  it("returns $129.90/yr for 1299 cents", () => {
    expect(formatAnnualPrice(1299)).toBe("$129.90/yr");
  });

  it("returns $70/yr for 700 cents", () => {
    expect(formatAnnualPrice(700)).toBe("$70/yr");
  });

  it("returns $120/yr for 1200 cents", () => {
    expect(formatAnnualPrice(1200)).toBe("$120/yr");
  });

  it("returns $90/yr for 900 cents", () => {
    expect(formatAnnualPrice(900)).toBe("$90/yr");
  });
});

describe("formatAnnualMonthlyEquivalent", () => {
  it("rounds fractional monthly equivalents up to whole dollars", () => {
    expect(formatAnnualMonthlyEquivalent(1740)).toBe("~$15/mo");
    expect(formatAnnualMonthlyEquivalent(4900)).toBe("~$41/mo");
  });

  it("returns ~$41/mo for 4900 cents", () => {
    expect(formatAnnualMonthlyEquivalent(4900)).toBe("~$41/mo");
  });

  it("returns ~$17/mo for 2000 cents", () => {
    expect(formatAnnualMonthlyEquivalent(2000)).toBe("~$17/mo");
  });

  it("returns ~$83/mo for 9900 cents", () => {
    expect(formatAnnualMonthlyEquivalent(9900)).toBe("~$83/mo");
  });

  it("returns ~$10/mo for 1200 cents (exact whole dollar)", () => {
    expect(formatAnnualMonthlyEquivalent(1200)).toBe("~$10/mo");
  });

  it("returns ~$41/user/mo for 4900 cents with /user unitLabel", () => {
    expect(formatAnnualMonthlyEquivalent(4900, "/user")).toBe("~$41/user/mo");
  });
});

describe("formatAnnualPriceFromCents", () => {
  it("returns $3948/yr for Growth annual (394800 cents)", () => {
    expect(formatAnnualPriceFromCents(394800)).toBe("$3948/yr");
  });

  it("returns $1980/yr for Starter annual (198000 cents)", () => {
    expect(formatAnnualPriceFromCents(198000)).toBe("$1980/yr");
  });

  it("returns $7980/yr for Audit-Ready annual (798000 cents)", () => {
    expect(formatAnnualPriceFromCents(798000)).toBe("$7980/yr");
  });

  it("returns $490/yr for 49000 cents", () => {
    expect(formatAnnualPriceFromCents(49000)).toBe("$490/yr");
  });
});

describe("formatAnnualMonthlyEquivalentFromCents", () => {
  it("rounds fractional monthly equivalents up to whole dollars", () => {
    expect(formatAnnualMonthlyEquivalentFromCents(17400)).toBe("~$15/mo");
    expect(formatAnnualMonthlyEquivalentFromCents(49000, "/user")).toBe("~$41/user/mo");
  });

  it("returns ~$333/mo for a custom annual price (399600 cents)", () => {
    expect(formatAnnualMonthlyEquivalentFromCents(399600)).toBe("~$333/mo");
  });

  it("returns ~$165/mo for Starter annual (198000 cents)", () => {
    expect(formatAnnualMonthlyEquivalentFromCents(198000)).toBe("~$165/mo");
  });

  it("returns ~$665/mo for Audit-Ready annual (798000 cents)", () => {
    expect(formatAnnualMonthlyEquivalentFromCents(798000)).toBe("~$665/mo");
  });

  it("returns ~$41/user/mo for 49000 cents with /user unitLabel", () => {
    expect(formatAnnualMonthlyEquivalentFromCents(49000, "/user")).toBe("~$41/user/mo");
  });
});
