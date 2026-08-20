import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { getTableColumns, getTableName } from "drizzle-orm";
import { outcomeGoals, outcomeIndicators } from "./outcomes";

describe("outcome measurement schema", () => {
  it("stores org-scoped outcome goals with optional program and grant links", () => {
    expect(getTableName(outcomeGoals)).toBe("outcome_goals");

    const columns = getTableColumns(outcomeGoals);
    expect(Object.keys(columns)).toEqual(
      expect.arrayContaining([
        "id",
        "orgId",
        "programId",
        "grantId",
        "name",
        "statement",
        "targetPopulation",
        "status",
        "startDate",
        "endDate",
        "createdAt",
        "updatedAt",
        "deletedAt",
      ]),
    );
  });

  it("stores funder-defined indicators linked to existing impact metrics", () => {
    expect(getTableName(outcomeIndicators)).toBe("outcome_indicators");

    const columns = getTableColumns(outcomeIndicators);
    expect(Object.keys(columns)).toEqual(
      expect.arrayContaining([
        "id",
        "orgId",
        "outcomeId",
        "impactMetricId",
        "name",
        "indicatorType",
        "direction",
        "targetValue",
        "baselineValue",
        "unit",
        "source",
        "funderDefined",
        "reportingCadence",
        "createdAt",
        "updatedAt",
        "deletedAt",
      ]),
    );
  });

  it("declares list and relationship indexes for outcome workspaces", () => {
    const outcomeIndexNames = getTableConfig(outcomeGoals).indexes.map(
      (index) => index.config.name,
    );
    const indicatorIndexNames = getTableConfig(outcomeIndicators).indexes.map(
      (index) => index.config.name,
    );

    expect(outcomeIndexNames).toEqual(
      expect.arrayContaining([
        "outcome_goals_org_status_idx",
        "outcome_goals_org_program_idx",
        "outcome_goals_org_grant_idx",
      ]),
    );
    expect(indicatorIndexNames).toEqual(
      expect.arrayContaining([
        "outcome_indicators_org_outcome_idx",
        "outcome_indicators_org_metric_idx",
      ]),
    );
  });
});
