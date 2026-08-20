import { describe, expect, it } from "vitest";
import { getTableColumns, getTableName } from "drizzle-orm";
import { savedReportDefinitions } from "./infrastructure";

describe("saved report definitions schema", () => {
  it("stores org-scoped cross-entity report builder definitions", () => {
    expect(getTableName(savedReportDefinitions)).toBe("saved_report_definitions");

    const columns = getTableColumns(savedReportDefinitions);
    expect(Object.keys(columns)).toEqual(
      expect.arrayContaining([
        "id",
        "orgId",
        "name",
        "description",
        "entity",
        "columns",
        "customFieldIds",
        "filters",
        "sort",
        "createdBy",
        "createdAt",
        "updatedAt",
        "deletedAt",
      ]),
    );
  });
});
