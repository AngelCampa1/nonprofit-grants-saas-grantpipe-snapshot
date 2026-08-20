import { describe, expect, it } from "vitest";
import {
  createOutcomeIndicatorSchema,
  createOutcomeSchema,
  outcomeListQuerySchema,
  updateOutcomeIndicatorSchema,
  updateOutcomeSchema,
} from "./outcomes";

const uuid = "123e4567-e89b-12d3-a456-426614174000";
const otherUuid = "123e4567-e89b-12d3-a456-426614174001";

describe("outcome validators", () => {
  it("accepts an outcome goal tied to a program and grant", () => {
    expect(
      createOutcomeSchema.parse({
        name: "Families keep stable housing",
        statement: "Families served by the housing grant keep stable housing for 12 months.",
        programId: uuid,
        grantId: otherUuid,
        targetPopulation: "Families at risk of eviction",
        status: "active",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      }),
    ).toMatchObject({
      name: "Families keep stable housing",
      programId: uuid,
      grantId: otherUuid,
      status: "active",
    });
  });

  it("rejects an outcome period that runs backwards", () => {
    expect(() =>
      createOutcomeSchema.parse({
        name: "Youth complete training",
        statement: "Participants complete job training.",
        startDate: "2026-12-31",
        endDate: "2026-01-01",
      }),
    ).toThrow("End date must be on or after the start date.");
  });

  it("rejects malformed outcome dates", () => {
    expect(() =>
      createOutcomeSchema.parse({
        name: "Stable housing",
        statement: "Families stay housed.",
        startDate: "not-a-date",
      }),
    ).toThrow("Invalid date or datetime");
  });

  it("requires update payloads to change at least one field", () => {
    expect(() => updateOutcomeSchema.parse({})).toThrow("Provide at least one field to update.");
  });

  it("accepts a funder-defined indicator linked to an existing impact metric", () => {
    expect(
      createOutcomeIndicatorSchema.parse({
        name: "Households housed",
        indicatorType: "outcome",
        direction: "increase",
        targetValue: "125",
        baselineValue: "80",
        unit: "households",
        impactMetricId: uuid,
        funderDefined: true,
        reportingCadence: "quarterly",
      }),
    ).toMatchObject({
      name: "Households housed",
      indicatorType: "outcome",
      direction: "increase",
      impactMetricId: uuid,
      funderDefined: true,
    });
  });

  it("rejects invalid indicator numbers before they reach the database", () => {
    expect(() =>
      createOutcomeIndicatorSchema.parse({
        name: "Households housed",
        indicatorType: "outcome",
        targetValue: "not-a-number",
      }),
    ).toThrow("Enter a valid number.");
    expect(() => updateOutcomeIndicatorSchema.parse({ baselineValue: "NaN" })).toThrow(
      "Enter a valid number.",
    );
  });

  it("allows indicator updates to clear optional fields", () => {
    expect(
      updateOutcomeIndicatorSchema.parse({
        impactMetricId: null,
        baselineValue: null,
        source: null,
      }),
    ).toMatchObject({
      impactMetricId: null,
      baselineValue: null,
      source: null,
    });
  });

  it("normalizes nullable indicator numeric updates", () => {
    expect(updateOutcomeIndicatorSchema.parse({ baselineValue: 0 })).toMatchObject({
      baselineValue: "0",
    });
    expect(updateOutcomeIndicatorSchema.parse({ targetValue: "125" })).toMatchObject({
      targetValue: "125",
    });
  });

  it("normalizes list filters and rejects invalid statuses", () => {
    expect(outcomeListQuerySchema.parse({ status: "active", page: "2" })).toMatchObject({
      status: "active",
      page: 2,
    });
    expect(() => outcomeListQuerySchema.parse({ status: "late" })).toThrow();
  });
});
