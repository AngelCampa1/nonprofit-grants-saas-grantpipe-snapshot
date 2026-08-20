import { describe, expect, it } from "vitest";
import { getTableName } from "drizzle-orm";
import {
  grantOpportunityActions,
  grantOpportunitySavedSearches,
  grantOpportunities,
} from "./grants";

const DRIZZLE_COLUMNS_KEY = Symbol.for("drizzle:Columns");

function columnNames(table: object): string[] {
  return Object.keys((table as Record<symbol, Record<string, unknown>>)[DRIZZLE_COLUMNS_KEY] ?? {});
}

describe("grantOpportunities table", () => {
  it("has org-scoped cached opportunity columns", () => {
    expect(getTableName(grantOpportunities)).toBe("grant_opportunities");
    expect(columnNames(grantOpportunities)).toEqual(
      expect.arrayContaining([
        "id",
        "orgId",
        "source",
        "sourceType",
        "sourceName",
        "sourceUrl",
        "funderType",
        "deadlineSource",
        "externalId",
        "sourceOpportunityId",
        "opportunityNumber",
        "title",
        "agencyName",
        "status",
        "postedDate",
        "closeDate",
        "awardFloorCents",
        "awardCeilingCents",
        "eligibleApplicants",
        "fundingCategories",
        "officialUrl",
        "rawPayload",
        "lastFetchedAt",
        "createdAt",
        "updatedAt",
        "deletedAt",
      ]),
    );
  });

  it("stores award floor/ceiling as bigint so large federal award ceilings cannot overflow int4 (~$21.4M)", () => {
    expect(grantOpportunities.awardFloorCents.getSQLType()).toBe("bigint");
    expect(grantOpportunities.awardCeilingCents.getSQLType()).toBe("bigint");
  });
});

describe("grantOpportunitySavedSearches table", () => {
  it("has saved search filters and reminder settings", () => {
    expect(getTableName(grantOpportunitySavedSearches)).toBe("grant_opportunity_saved_searches");
    expect(columnNames(grantOpportunitySavedSearches)).toEqual(
      expect.arrayContaining([
        "id",
        "orgId",
        "createdBy",
        "name",
        "filters",
        "emailRemindersEnabled",
        "reminderDaysBeforeDeadline",
        "lastRunAt",
        "createdAt",
        "updatedAt",
        "deletedAt",
      ]),
    );
  });
});

describe("grantOpportunityActions table", () => {
  it("tracks saved, dismissed, converted, ownership, notes, and reminders", () => {
    expect(getTableName(grantOpportunityActions)).toBe("grant_opportunity_actions");
    expect(columnNames(grantOpportunityActions)).toEqual(
      expect.arrayContaining([
        "id",
        "orgId",
        "opportunityId",
        "userId",
        "state",
        "ownerUserId",
        "notes",
        "reminderAt",
        "convertedGrantId",
        "createdAt",
        "updatedAt",
        "deletedAt",
      ]),
    );
  });
});
