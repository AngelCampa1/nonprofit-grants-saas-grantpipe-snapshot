import { describe, it, expect } from "vitest";
import {
  buildAlternativeComparisonRows,
  buildVersusComparisonRows,
  buildVersusComparisonTable,
  buildPricingComparisonRows,
} from "./comparison-rows";
import { grantPipeMarketPosition } from "../config/market-facts";

describe("buildAlternativeComparisonRows", () => {
  it("returns 5 rows with centralized market positioning", () => {
    const rows = buildAlternativeComparisonRows("blackbaud", "$500/mo", undefined);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toEqual({
      feature: "Pricing posture",
      values: ["Custom quote / annual contract", grantPipeMarketPosition.pricingSummary],
    });
    expect(rows[1]).toEqual({
      feature: "Setup profile",
      values: ["Implementation services commonly required", "No setup fee"],
    });
    expect(rows[2]?.feature).toBe("Grant workflow depth");
    expect(rows[3]?.feature).toBe("Compliance depth");
    expect(rows[4]?.feature).toBe("Best fit");
  });

  it("defaults setup profile when the competitor is unknown", () => {
    const rows = buildAlternativeComparisonRows("unknown", "$500/mo", undefined);
    expect(rows[1]!.values[0]).toBe("Varies by implementation");
  });

  it("uses the provided setup fee fallback when available", () => {
    const rows = buildAlternativeComparisonRows("unknown", "$500/mo", "$2,500");
    expect(rows[1]!.values[0]).toBe("$2,500");
  });
});

describe("buildVersusComparisonRows", () => {
  it("returns 4 rows with three-way comparison values", () => {
    const rows = buildVersusComparisonRows("blackbaud", "$500", "bloomerang", "$300");
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({
      feature: "Pricing posture",
      values: [
        "Custom quote / annual contract",
        "Starts at $125/month",
        grantPipeMarketPosition.pricingSummary,
      ],
    });
    expect(rows[1]?.feature).toBe("Setup profile");
    expect(rows[2]?.feature).toBe("Grant workflow depth");
    expect(rows[3]?.feature).toBe("Compliance depth");
  });
});

describe("buildVersusComparisonTable", () => {
  it("keeps the three-way table when GrantPipe is not one of the compared tools", () => {
    const table = buildVersusComparisonTable(
      { slug: "blackbaud", name: "Blackbaud", pricing: "$500" },
      { slug: "bloomerang", name: "Bloomerang", pricing: "$300" },
    );

    expect(table.headers).toEqual(["Feature", "Blackbaud", "Bloomerang", "GrantPipe"]);
    expect(table.highlightColumn).toBe(3);
    expect(table.rows[0]).toEqual({
      feature: "Pricing posture",
      values: [
        "Custom quote / annual contract",
        "Starts at $125/month",
        grantPipeMarketPosition.pricingSummary,
      ],
    });
  });

  it("puts GrantPipe in the first product column when it is competitor A", () => {
    const table = buildVersusComparisonTable(
      { slug: "grantpipe", name: "GrantPipe", pricing: "$49-$199/month self-serve" },
      { slug: "bloomerang", name: "Bloomerang", pricing: "$300" },
    );

    expect(table.headers).toEqual(["Feature", "GrantPipe", "Bloomerang"]);
    expect(table.highlightColumn).toBe(1);
    expect(table.rows[0]).toEqual({
      feature: "Pricing posture",
      values: [grantPipeMarketPosition.pricingSummary, "Starts at $125/month"],
    });
  });

  it("puts GrantPipe in the first product column when it is competitor B", () => {
    const table = buildVersusComparisonTable(
      { slug: "bloomerang", name: "Bloomerang", pricing: "$300" },
      { slug: "grantpipe", name: "GrantPipe", pricing: "$49-$199/month self-serve" },
    );

    expect(table.headers).toEqual(["Feature", "GrantPipe", "Bloomerang"]);
    expect(table.highlightColumn).toBe(1);
    expect(table.rows[1]).toEqual({
      feature: "Setup profile",
      values: ["No setup fee", "Self-serve onboarding plus optional services"],
    });
  });
});

describe("buildPricingComparisonRows", () => {
  it("returns 3 rows with pricing, contract, and setup posture", () => {
    const rows = buildPricingComparisonRows("instrumentl", "$500/mo");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      feature: "Pricing posture",
      values: ["$299-$999/month plus enterprise pricing", grantPipeMarketPosition.pricingSummary],
    });
    expect(rows[1]).toEqual({
      feature: "Contract posture",
      values: [
        "Annual or monthly billing by plan; enterprise pricing on request",
        "Month-to-month or annual billing",
      ],
    });
    expect(rows[2]).toEqual({
      feature: "Setup profile",
      values: ["Low setup for discovery workflow", "No setup fee"],
    });
  });
});
