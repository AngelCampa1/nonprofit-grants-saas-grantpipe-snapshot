import { describe, expect, it } from "vitest";
import {
  createAllocationSchema,
  createCloseoutItemSchema,
  createExpenseSchema,
  createFundSchema,
  createFunderContactSchema,
  createFunderSchema,
  createGrantSchema,
  createGrantExpenseSchema,
  createGrantOpportunitySavedSearchSchema,
  createImpactMetricEntrySchema,
  createImpactMetricSchema,
  createReportingRequirementSchema,
  convertGrantOpportunitySchema,
  createGrantOpportunitySchema,
  foundationProspectLookupSchema,
  fundListSchema,
  funderListSchema,
  grantCloseoutSchema,
  grantOpportunityActionSchema,
  grantOpportunitySearchSchema,
  grantListSchema,
  updateAllocationSchema,
  updateCloseoutItemSchema,
  updateExpenseSchema,
  updateFundSchema,
  updateFunderContactSchema,
  updateFunderSchema,
  updateGrantSchema,
  updateGrantOpportunitySavedSearchSchema,
  updateImpactMetricEntrySchema,
  updateImpactMetricSchema,
  updateReportingRequirementSchema,
} from "./grants";
import {
  formatGrantSourceTypeLabel,
  formatGrantSourceTypeDescription,
  GRANT_SOURCE_TYPES,
} from "../constants";

describe("grant source constants", () => {
  it("defines supported grant source types with labels and descriptions", () => {
    expect(GRANT_SOURCE_TYPES).toEqual([
      "federal",
      "state_local",
      "private_foundation",
      "community_foundation",
      "corporate",
      "association",
      "other",
    ]);
    expect(formatGrantSourceTypeLabel("state_local")).toBe("State/local");
    expect(formatGrantSourceTypeDescription("private_foundation")).toContain("private foundation");
  });
});

describe("createFunderSchema", () => {
  it("accepts a valid funder", () => {
    const result = createFunderSchema.safeParse({
      name: "Acme Foundation",
      type: "foundation",
      website: "https://acme.org",
      priorities: "Education",
      notes: "Warm relationship",
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid type", () => {
    const result = createFunderSchema.safeParse({
      name: "Acme Foundation",
      type: "family",
    });

    expect(result.success).toBe(false);
  });

  it("surfaces a human message when the name is missing", () => {
    const result = createFunderSchema.safeParse({ name: "", type: "foundation" });

    expect(result.success).toBe(false);
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? "";
      expect(message).toBe("Enter a funder name.");
      expect(message).not.toMatch(/too small|>=|expected string/i);
    }
  });

  it("surfaces a human message when the website is not a valid URL", () => {
    const result = createFunderSchema.safeParse({
      name: "Acme Foundation",
      type: "foundation",
      website: "not-a-url",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? "";
      expect(message).toBe("Enter a valid website URL, including https://");
      expect(message).not.toMatch(/invalid url|invalid input/i);
    }
  });

  it("surfaces a human message when the name is too long", () => {
    const result = createFunderSchema.safeParse({
      name: "a".repeat(201),
      type: "foundation",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? "";
      expect(message).toBe("Funder name must be 200 characters or fewer.");
    }
  });
});

describe("updateFunderSchema", () => {
  it("accepts partial updates", () => {
    const result = updateFunderSchema.safeParse({
      notes: "Updated note",
    });

    expect(result.success).toBe(true);
  });
});

describe("funder contacts", () => {
  it("accepts a valid funder contact", () => {
    const result = createFunderContactSchema.safeParse({
      name: "Jane Officer",
      title: "Program Officer",
      email: "jane@acme.org",
      phone: "555-1234",
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = createFunderContactSchema.safeParse({
      name: "Jane Officer",
      email: "not-an-email",
    });

    expect(result.success).toBe(false);
  });

  it("accepts nullable update fields", () => {
    const result = updateFunderContactSchema.safeParse({
      title: null,
      phone: null,
      notes: null,
    });

    expect(result.success).toBe(true);
  });
});

describe("createGrantSchema", () => {
  it("accepts a valid grant and defaults status", () => {
    const result = createGrantSchema.safeParse({
      funderId: "funder-1",
      name: "Summer Programs 2026",
      amountCents: 1250000,
      applicationDeadline: "2026-06-01T00:00:00Z",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("discovery");
    }
  });

  it("accepts all optional fields", () => {
    const result = createGrantSchema.safeParse({
      funderId: "funder-1",
      name: "Summer Programs 2026",
      status: "submitted",
      amountCents: 1250000,
      startDate: "2026-07-01T00:00:00Z",
      endDate: "2027-06-30T00:00:00Z",
      applicationDeadline: "2026-06-01T00:00:00Z",
      description: "Supports seasonal youth programming",
      notes: "Board-approved priority",
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid status", () => {
    const result = createGrantSchema.safeParse({
      funderId: "funder-1",
      name: "Summer Programs 2026",
      status: "draft",
    });

    expect(result.success).toBe(false);
  });

  it("rejects negative amount", () => {
    const result = createGrantSchema.safeParse({
      funderId: "funder-1",
      name: "Summer Programs 2026",
      amountCents: -1,
    });

    expect(result.success).toBe(false);
  });

  it("rejects amount values above the JavaScript safe integer boundary", () => {
    const result = createGrantSchema.safeParse({
      funderId: "funder-1",
      name: "Summer Programs 2026",
      amountCents: Number.MAX_SAFE_INTEGER + 1,
    });

    expect(result.success).toBe(false);
  });

  it('accepts date-only values from <input type="date"> and normalizes them to ISO datetimes', () => {
    const result = createGrantSchema.safeParse({
      funderId: "funder-1",
      name: "Healthy Aging Partnership Grant",
      status: "awarded",
      amountCents: 6000000,
      startDate: "2026-07-01",
      endDate: "2027-06-30",
      applicationDeadline: "2026-05-15",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.startDate).toBe("2026-07-01T00:00:00.000Z");
      expect(result.data.endDate).toBe("2027-06-30T00:00:00.000Z");
      expect(result.data.applicationDeadline).toBe("2026-05-15T00:00:00.000Z");
    }
  });

  it("still accepts full ISO datetime date values unchanged", () => {
    const result = createGrantSchema.safeParse({
      funderId: "funder-1",
      name: "Summer Programs 2026",
      startDate: "2026-07-01T00:00:00Z",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.startDate).toBe("2026-07-01T00:00:00Z");
    }
  });

  it("rejects a malformed date string", () => {
    const result = createGrantSchema.safeParse({
      funderId: "funder-1",
      name: "Summer Programs 2026",
      startDate: "2026-13-45",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a grant whose end date precedes its start date", () => {
    const result = createGrantSchema.safeParse({
      funderId: "funder-1",
      name: "Summer Programs 2026",
      startDate: "2027-12-31",
      endDate: "2025-01-01",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain("endDate");
    }
  });

  it("accepts a grant whose start and end dates are equal", () => {
    const result = createGrantSchema.safeParse({
      funderId: "funder-1",
      name: "One-day grant",
      startDate: "2026-07-01",
      endDate: "2026-07-01",
    });

    expect(result.success).toBe(true);
  });
});

describe("updateGrantSchema", () => {
  it("accepts nullable date and amount fields", () => {
    const result = updateGrantSchema.safeParse({
      amountCents: null,
      startDate: null,
      endDate: null,
      applicationDeadline: null,
      description: null,
      notes: null,
    });

    expect(result.success).toBe(true);
  });

  it("accepts and normalizes date-only values on update", () => {
    const result = updateGrantSchema.safeParse({
      startDate: "2026-07-01",
      endDate: "2027-06-30",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.startDate).toBe("2026-07-01T00:00:00.000Z");
      expect(result.data.endDate).toBe("2027-06-30T00:00:00.000Z");
    }
  });

  it("rejects an update whose end date precedes its start date", () => {
    const result = updateGrantSchema.safeParse({
      startDate: "2027-12-31",
      endDate: "2025-01-01",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain("endDate");
    }
  });

  it("allows updating only one of the two date bounds", () => {
    const result = updateGrantSchema.safeParse({ endDate: "2027-06-30" });

    expect(result.success).toBe(true);
  });
});

describe("grant opportunity schemas", () => {
  it("accepts manual non-federal opportunities with source metadata", () => {
    const result = createGrantOpportunitySchema.safeParse({
      title: "Neighborhood Resilience Fund",
      sourceType: "community_foundation",
      sourceName: "Community Foundation of Central Texas",
      sourceUrl: "https://example.org/apply",
      funderType: "foundation",
      deadlineSource: "funder_website",
      externalId: "CFTX-2026",
      closeDate: "2026-08-15T00:00:00.000Z",
      awardFloorCents: 1000000,
      awardCeilingCents: 5000000,
      eligibleApplicants: ["501(c)(3) nonprofits"],
      fundingCategories: ["Community development"],
      notes: "Requires LOI before full proposal.",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sourceType).toBe("community_foundation");
      expect(result.data.deadlineSource).toBe("funder_website");
    }
  });

  it("requires manual opportunities to identify a non-federal source", () => {
    const result = createGrantOpportunitySchema.safeParse({
      title: "Untyped opportunity",
      sourceType: "federal",
      sourceName: "Grants.gov",
    });

    expect(result.success).toBe(false);
  });

  it("rejects manual opportunity source URLs that are not http or https", () => {
    const result = createGrantOpportunitySchema.safeParse({
      title: "Unsafe opportunity",
      sourceType: "private_foundation",
      sourceName: "Example Foundation",
      sourceUrl: "ftp://example.org/apply",
    });

    expect(result.success).toBe(false);
  });

  it("accepts a Grants.gov opportunity search with saved-search filters", () => {
    const result = grantOpportunitySearchSchema.safeParse({
      keyword: "housing",
      agency: "HUD",
      opportunityStatus: "posted",
      applicantTypes: ["nonprofits"],
      fundingCategories: ["community_development"],
      sourceType: "federal",
      funderType: "government",
      closeFrom: "2026-05-01T00:00:00.000Z",
      closeTo: "2026-07-01T00:00:00.000Z",
      page: 2,
      pageSize: 10,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.keyword).toBe("housing");
      expect(result.data.sourceType).toBe("federal");
      expect(result.data.funderType).toBe("government");
      expect(result.data.page).toBe(2);
      expect(result.data.pageSize).toBe(10);
    }
  });

  it("defaults opportunity search pagination and rejects empty filters", () => {
    const result = grantOpportunitySearchSchema.safeParse({ keyword: "  arts  " });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.keyword).toBe("arts");
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(25);
    }

    expect(grantOpportunitySearchSchema.safeParse({ keyword: "" }).success).toBe(false);
  });

  it("accepts normalized foundation prospect lookup filters", () => {
    const result = foundationProspectLookupSchema.safeParse({
      query: " community foundation ",
      state: "ca",
      nteeMajorGroup: "4",
      page: "2",
      pageSize: "10",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({
        query: "community foundation",
        state: "CA",
        nteeMajorGroup: 4,
        page: 2,
        pageSize: 10,
      });
    }
  });

  it("accepts EIN prospect lookup and rejects malformed filters", () => {
    expect(foundationProspectLookupSchema.safeParse({ ein: "12-3456789" }).success).toBe(true);
    expect(foundationProspectLookupSchema.safeParse({ ein: "123" }).success).toBe(false);
    expect(foundationProspectLookupSchema.safeParse({ state: "california" }).success).toBe(false);
  });

  it("validates saved opportunity searches with reminder settings", () => {
    const result = createGrantOpportunitySavedSearchSchema.safeParse({
      name: "Federal housing grants",
      filters: {
        keyword: "housing",
        agency: "HUD",
        applicantTypes: ["nonprofits"],
      },
      emailRemindersEnabled: true,
      reminderDaysBeforeDeadline: 14,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filters.keyword).toBe("housing");
      expect(result.data.reminderDaysBeforeDeadline).toBe(14);
    }
  });

  it("rejects saved searches without a usable name", () => {
    const result = createGrantOpportunitySavedSearchSchema.safeParse({
      name: "   ",
      filters: { keyword: "health" },
    });

    expect(result.success).toBe(false);
  });

  it("validates partial saved search updates", () => {
    const result = updateGrantOpportunitySavedSearchSchema.safeParse({
      filters: { keyword: "education", opportunityStatus: "forecasted" },
      emailRemindersEnabled: false,
    });

    expect(result.success).toBe(true);
  });

  it("validates opportunity action payloads", () => {
    const result = grantOpportunityActionSchema.safeParse({
      ownerUserId: "user-1",
      notes: "Good fit for food access program",
      reminderAt: "2026-05-15T13:00:00.000Z",
    });

    expect(result.success).toBe(true);
  });

  it("validates converting an opportunity into a grant using canonical statuses", () => {
    const result = convertGrantOpportunitySchema.safeParse({
      status: "application",
      ownerUserId: "user-1",
      notes: "Started application in Grants.gov",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("application");
    }
  });

  it("defaults convert status to discovery", () => {
    const result = convertGrantOpportunitySchema.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("discovery");
    }
  });

  it("rejects legacy status values that do not match GRANT_STATUSES", () => {
    expect(convertGrantOpportunitySchema.safeParse({ status: "prepare" }).success).toBe(false);
    expect(convertGrantOpportunitySchema.safeParse({ status: "discover" }).success).toBe(false);
  });
});

describe("grantListSchema", () => {
  it("applies defaults", () => {
    const result = grantListSchema.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(25);
      expect(result.data.sortBy).toBe("updatedAt");
      expect(result.data.sortOrder).toBe("desc");
    }
  });

  it("accepts all filters", () => {
    const result = grantListSchema.safeParse({
      page: "2",
      pageSize: "10",
      search: "summer",
      status: "submitted",
      funderId: "funder-1",
      fundId: "fund-1",
      threshold: "90",
      sortBy: "amountCents",
      sortOrder: "asc",
    });

    expect(result.success).toBe(true);
  });

  it("rejects unsupported threshold", () => {
    const result = grantListSchema.safeParse({
      threshold: "75",
    });

    expect(result.success).toBe(false);
  });
});

describe("fund schemas", () => {
  it("accepts a valid fund", () => {
    const result = createFundSchema.safeParse({
      name: "General Operations",
      type: "unrestricted",
      description: "Flexible use fund",
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid type", () => {
    const result = createFundSchema.safeParse({
      name: "General Operations",
      type: "board_designated",
    });

    expect(result.success).toBe(false);
  });

  it("accepts nullable fund updates", () => {
    const result = updateFundSchema.safeParse({
      description: null,
    });

    expect(result.success).toBe(true);
  });
});

describe("fundListSchema", () => {
  it("accepts filters and defaults sorting", () => {
    const result = fundListSchema.safeParse({
      type: "temporarily_restricted",
      search: "education",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sortBy).toBe("name");
      expect(result.data.sortOrder).toBe("asc");
    }
  });
});

describe("createAllocationSchema", () => {
  it("accepts a valid allocation", () => {
    const result = createAllocationSchema.safeParse({
      fundId: "fund-1",
      allocatedAmountCents: 500000,
    });

    expect(result.success).toBe(true);
  });

  it("rejects zero amount", () => {
    const result = createAllocationSchema.safeParse({
      fundId: "fund-1",
      allocatedAmountCents: 0,
    });

    expect(result.success).toBe(false);
  });

  it("rejects allocation values above the JavaScript safe integer boundary", () => {
    const result = createAllocationSchema.safeParse({
      fundId: "fund-1",
      allocatedAmountCents: Number.MAX_SAFE_INTEGER + 1,
    });

    expect(result.success).toBe(false);
  });

  it("accepts partial allocation updates", () => {
    const result = updateAllocationSchema.safeParse({
      allocatedAmountCents: 700000,
    });

    expect(result.success).toBe(true);
  });
});

describe("expense schemas", () => {
  it("accepts a valid expense", () => {
    const result = createExpenseSchema.safeParse({
      amountCents: 25000,
      date: "2026-08-01T00:00:00Z",
      description: "Program materials",
      category: "Supplies",
      vendor: "Office Depot",
      grantId: "grant-1",
      fundId: "fund-1",
    });

    expect(result.success).toBe(true);
  });

  it("accepts expense with accountId", () => {
    const result = createExpenseSchema.safeParse({
      amountCents: 25000,
      date: "2026-08-01T00:00:00Z",
      description: "Program materials",
      category: "Supplies",
      vendor: "Office Depot",
      grantId: "grant-1",
      accountId: "account-1",
    });

    expect(result.success).toBe(true);
  });

  it("accepts non-reimbursable expense creation", () => {
    const result = createExpenseSchema.safeParse({
      amountCents: 25000,
      date: "2026-08-01T00:00:00Z",
      grantId: "grant-1",
      reimbursable: false,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reimbursable).toBe(false);
    }
  });

  it("requires at least one funding reference", () => {
    const result = createExpenseSchema.safeParse({
      amountCents: 25000,
      date: "2026-08-01T00:00:00Z",
      description: "Program materials",
    });

    expect(result.success).toBe(false);
  });

  it("accepts a grant-scoped expense without grantId in the JSON body", () => {
    const result = createGrantExpenseSchema.safeParse({
      fundId: "fund-1",
      amountCents: 25000,
      date: "2026-08-01T00:00:00Z",
      description: "Program materials",
    });

    expect(result.success).toBe(true);
  });

  it("accepts grant-scoped expense with accountId", () => {
    const result = createGrantExpenseSchema.safeParse({
      fundId: "fund-1",
      amountCents: 25000,
      date: "2026-08-01T00:00:00Z",
      description: "Program materials",
      accountId: "account-1",
    });

    expect(result.success).toBe(true);
  });

  it("rejects expense values above the JavaScript safe integer boundary", () => {
    const result = createGrantExpenseSchema.safeParse({
      fundId: "fund-1",
      amountCents: Number.MAX_SAFE_INTEGER + 1,
      date: "2026-08-01T00:00:00Z",
    });

    expect(result.success).toBe(false);
  });

  it("still requires the shared expense fields for grant-scoped expenses", () => {
    const result = createGrantExpenseSchema.safeParse({
      description: "Program materials",
    });

    expect(result.success).toBe(false);
  });

  it("accepts nullable update references", () => {
    const result = updateExpenseSchema.safeParse({
      grantId: null,
      fundId: "fund-1",
      vendor: null,
    });

    expect(result.success).toBe(true);
  });

  it("accepts nullable accountId in update", () => {
    const result = updateExpenseSchema.safeParse({
      accountId: null,
      fundId: "fund-1",
    });

    expect(result.success).toBe(true);
  });

  it("accepts accountId in update", () => {
    const result = updateExpenseSchema.safeParse({
      accountId: "account-2",
    });

    expect(result.success).toBe(true);
  });

  it("accepts reimbursable changes in update", () => {
    const result = updateExpenseSchema.safeParse({
      reimbursable: false,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reimbursable).toBe(false);
    }
  });
});

describe("impact metric schemas", () => {
  it("accepts a metric definition", () => {
    const result = createImpactMetricSchema.safeParse({
      name: "Families Served",
      targetValue: "120",
      unit: "families",
    });

    expect(result.success).toBe(true);
  });

  it("accepts metric entry", () => {
    const result = createImpactMetricEntrySchema.safeParse({
      value: "42",
      periodStart: "2026-07-01T00:00:00Z",
      periodEnd: "2026-09-30T00:00:00Z",
      notes: "Q1 actuals",
    });

    expect(result.success).toBe(true);
  });

  it("accepts nullable updates", () => {
    expect(updateImpactMetricSchema.safeParse({ unit: null }).success).toBe(true);
    expect(updateImpactMetricEntrySchema.safeParse({ notes: null }).success).toBe(true);
  });

  it("rejects a metric entry whose period end precedes its period start", () => {
    const result = createImpactMetricEntrySchema.safeParse({
      value: "42",
      periodStart: "2026-09-30T00:00:00Z",
      periodEnd: "2026-07-01T00:00:00Z",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain("periodEnd");
    }
  });

  it("accepts a metric entry whose period start and end are equal", () => {
    const result = createImpactMetricEntrySchema.safeParse({
      value: "42",
      periodStart: "2026-07-01T00:00:00Z",
      periodEnd: "2026-07-01T00:00:00Z",
    });

    expect(result.success).toBe(true);
  });

  it("rejects an entry update whose period end precedes its period start", () => {
    const result = updateImpactMetricEntrySchema.safeParse({
      periodStart: "2026-09-30T00:00:00Z",
      periodEnd: "2026-07-01T00:00:00Z",
    });

    expect(result.success).toBe(false);
  });

  it("allows updating only one of the two period bounds", () => {
    expect(
      updateImpactMetricEntrySchema.safeParse({ periodStart: "2026-07-01T00:00:00Z" }).success,
    ).toBe(true);
  });
});

describe("reporting requirement schemas", () => {
  it("accepts a valid reporting requirement", () => {
    const result = createReportingRequirementSchema.safeParse({
      reportType: "quarterly",
      dueDate: "2026-10-01T00:00:00Z",
      status: "upcoming",
      notes: "Financial + narrative",
    });

    expect(result.success).toBe(true);
  });

  it("defaults reporting status", () => {
    const result = createReportingRequirementSchema.safeParse({
      reportType: "annual",
      dueDate: "2026-12-01T00:00:00Z",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("upcoming");
    }
  });

  it("accepts nullable reporting updates", () => {
    const result = updateReportingRequirementSchema.safeParse({
      submittedAt: null,
      notes: null,
    });

    expect(result.success).toBe(true);
  });
});

describe("closeout item schemas", () => {
  it("accepts a valid closeout item", () => {
    const result = createCloseoutItemSchema.safeParse({
      label: "Final report submitted",
      dueDate: "2026-10-01T00:00:00Z",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dueDate).toBe("2026-10-01T00:00:00Z");
    }
  });

  it("accepts completion toggle update", () => {
    const result = updateCloseoutItemSchema.safeParse({
      completed: true,
    });

    expect(result.success).toBe(true);
  });

  it("accepts nullable due dates on updates", () => {
    const result = updateCloseoutItemSchema.safeParse({
      dueDate: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dueDate).toBeNull();
    }
  });
});

describe("funderListSchema", () => {
  it("accepts list filters and defaults", () => {
    const result = funderListSchema.safeParse({
      search: "acme",
      type: "foundation",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sortBy).toBe("name");
      expect(result.data.sortOrder).toBe("asc");
    }
  });
});

describe("grantCloseoutSchema", () => {
  it("accepts release disposition", () => {
    const result = grantCloseoutSchema.safeParse({ closeoutDisposition: "release" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.closeoutDisposition).toBe("release");
    }
  });

  it("accepts return disposition", () => {
    const result = grantCloseoutSchema.safeParse({ closeoutDisposition: "return" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.closeoutDisposition).toBe("return");
    }
  });

  it("rejects invalid disposition", () => {
    const result = grantCloseoutSchema.safeParse({ closeoutDisposition: "archive" });
    expect(result.success).toBe(false);
  });

  it("rejects missing disposition", () => {
    const result = grantCloseoutSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
