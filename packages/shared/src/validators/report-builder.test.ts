import { describe, expect, it } from "vitest";
import {
  REPORT_BUILDER_ENTITIES,
  createReportDefinitionSchema,
  reportBuilderPreviewSchema,
  reportBuilderRunSchema,
  updateReportDefinitionSchema,
} from "./report-builder";

describe("report-builder validators", () => {
  it("accepts a saved definition with entity, columns, filters, and custom fields", () => {
    const parsed = createReportDefinitionSchema.parse({
      name: "Grant cash view",
      description: "Monthly board review",
      entity: "grants",
      columns: ["name", "status", "amountCents"],
      customFieldIds: ["field-1"],
      filters: [{ field: "status", operator: "equals", value: "active" }],
      sort: [{ field: "amountCents", direction: "desc" }],
    });

    expect(parsed.entity).toBe("grants");
    expect(parsed.customFieldIds).toEqual(["field-1"]);
    expect(parsed.filters[0]).toMatchObject({ operator: "equals" });
  });

  it("rejects duplicate columns and duplicate custom field ids", () => {
    expect(() =>
      createReportDefinitionSchema.parse({
        name: "Duplicate",
        entity: "donors",
        columns: ["email", "email"],
        customFieldIds: ["field-1", "field-1"],
      }),
    ).toThrow();
  });

  it("rejects columns that do not belong to the selected entity", () => {
    expect(() =>
      createReportDefinitionSchema.parse({
        name: "Wrong entity",
        entity: "funds",
        columns: ["amountCents"],
      }),
    ).toThrow();
  });

  it("allows partial saved definition updates", () => {
    const parsed = updateReportDefinitionSchema.parse({
      name: "Renamed report",
    });

    expect(parsed).toEqual({
      name: "Renamed report",
      filters: [],
      sort: [],
    });
  });

  it("validates saved definition update arrays when supplied", () => {
    const parsed = updateReportDefinitionSchema.parse({
      entity: "donors",
      columns: ["displayName"],
      customFieldIds: ["field-1"],
    });

    expect(parsed.columns).toEqual(["displayName"]);
    expect(parsed.customFieldIds).toEqual(["field-1"]);
  });

  it("caps preview requests to a small result window", () => {
    const parsed = reportBuilderPreviewSchema.parse({
      entity: "donations",
      columns: ["amountCents", "date"],
      limit: 250,
    });

    expect(parsed.limit).toBe(100);
  });

  it("keeps the entity catalog explicit", () => {
    expect(REPORT_BUILDER_ENTITIES).toEqual(["donors", "donations", "grants", "funds"]);
  });

  it("requires a UUID attempt id for report exports", () => {
    const attemptId = "f7bc1df2-5375-4a8e-a43d-c61f863a034b";
    expect(reportBuilderRunSchema.parse({ title: "Board report", attemptId }).attemptId).toBe(
      attemptId,
    );
    expect(reportBuilderRunSchema.safeParse({ title: "Board report" }).success).toBe(false);
    expect(reportBuilderRunSchema.safeParse({ attemptId: "not-a-uuid" }).success).toBe(false);
  });
});
