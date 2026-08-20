import { describe, expect, it } from "vitest";
import {
  acknowledgmentTemplateSchema,
  generateDonorYearEndStatementRunSchema,
  generateAcknowledgmentLetterSchema,
  generateAuditReportSchema,
  generateBoardReportSchema,
  generateGrantComplianceReportSchema,
  generatedReportArtifactSchema,
  generatedReportListSchema,
  generateIrs990ReportSchema,
  generateSefaReportSchema,
  generateSpendDownReportSchema,
  sefaTripwireResultSchema,
  spendDownQuerySchema,
  spendDownResultSchema,
} from "./compliance";
import { GENERATED_REPORT_TYPES } from "../constants";

describe("spendDownQuerySchema", () => {
  it("accepts an empty query (both optional)", () => {
    expect(spendDownQuerySchema.safeParse({}).success).toBe(true);
  });

  it("accepts a valid from/to range", () => {
    expect(
      spendDownQuerySchema.safeParse({
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-12-31T23:59:59.000Z",
      }).success,
    ).toBe(true);
  });

  it("rejects an inverted range (from after to)", () => {
    expect(
      spendDownQuerySchema.safeParse({
        from: "2026-12-31T23:59:59.000Z",
        to: "2026-01-01T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("accepts an equal from/to range", () => {
    expect(
      spendDownQuerySchema.safeParse({
        from: "2026-06-01T00:00:00.000Z",
        to: "2026-06-01T00:00:00.000Z",
      }).success,
    ).toBe(true);
  });
});

describe("report generation schemas", () => {
  it("accepts grant compliance report input", () => {
    expect(
      generateGrantComplianceReportSchema.safeParse({ title: "Q1 STEM Compliance Report" }).success,
    ).toBe(true);
  });

  it("accepts audit report input", () => {
    expect(generateAuditReportSchema.safeParse({ title: "FY2026 Audit Export" }).success).toBe(
      true,
    );
  });

  it("requires fiscal year for 990 export", () => {
    expect(generateIrs990ReportSchema.safeParse({ fiscalYear: "FY2026" }).success).toBe(true);
    expect(generateIrs990ReportSchema.safeParse({}).success).toBe(false);
  });

  it("requires fiscal year for board report", () => {
    expect(generateBoardReportSchema.safeParse({ fiscalYear: "FY2026" }).success).toBe(true);
    expect(generateBoardReportSchema.safeParse({ title: "Board" }).success).toBe(false);
  });

  it("accepts board packet composer options", () => {
    const result = generateBoardReportSchema.safeParse({
      fiscalYear: "FY2026",
      title: "April board packet",
      meetingDate: "2026-04-20",
      cadence: "monthly",
      sections: ["executive_snapshot", "fundraising", "grant_pipeline", "fund_balances"],
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid board packet section choices", () => {
    expect(
      generateBoardReportSchema.safeParse({
        fiscalYear: "FY2026",
        sections: [],
      }).success,
    ).toBe(false);
    expect(
      generateBoardReportSchema.safeParse({
        fiscalYear: "FY2026",
        sections: ["made_up_section"],
      }).success,
    ).toBe(false);
  });

  it("accepts acknowledgment letter generation input", () => {
    expect(generateAcknowledgmentLetterSchema.safeParse({ title: "Receipt" }).success).toBe(true);
  });

  it("accepts calendar-year donor statement run input", () => {
    expect(
      generateDonorYearEndStatementRunSchema.safeParse({
        year: 2026,
        deliveryMode: "download",
        minimumAmountCents: 25000,
      }).success,
    ).toBe(true);
  });

  it("rejects invalid donor statement run input", () => {
    expect(
      generateDonorYearEndStatementRunSchema.safeParse({
        year: 1800,
        deliveryMode: "download",
        minimumAmountCents: -1,
      }).success,
    ).toBe(false);
  });

  it("rejects unsupported email delivery for donor statement runs", () => {
    expect(
      generateDonorYearEndStatementRunSchema.safeParse({
        year: 2026,
        deliveryMode: "email",
      }).success,
    ).toBe(false);
  });

  it("rejects donor statement years outside the product range", () => {
    expect(
      generateDonorYearEndStatementRunSchema.safeParse({
        year: 1999,
        deliveryMode: "download",
      }).success,
    ).toBe(false);
  });

  it("accepts SEFA draft generation input", () => {
    expect(
      generateSefaReportSchema.safeParse({
        fiscalYear: "FY2026",
        title: "FY2026 SEFA Draft",
      }).success,
    ).toBe(true);
  });

  it("requires a fiscal year for SEFA draft generation", () => {
    expect(generateSefaReportSchema.safeParse({}).success).toBe(false);
  });
});

describe("SEFA report contracts", () => {
  it("adds sefa as a generated report type", () => {
    expect(GENERATED_REPORT_TYPES).toContain("sefa");
  });

  it("accepts a single-audit tripwire result", () => {
    expect(
      sefaTripwireResultSchema.safeParse({
        fiscalYear: "FY2026",
        periodStart: "2026-01-01T00:00:00.000Z",
        periodEnd: "2026-12-31T23:59:59.999Z",
        thresholdCents: 100_000_000,
        totalFederalExpendituresCents: 82_500_000,
        remainingToThresholdCents: 17_500_000,
        thresholdPercent: 82.5,
        state: "watch",
        rows: [
          {
            grantId: "grant-1",
            grantName: "HUD Housing Award",
            federalAgency: "HUD",
            assistanceListingNumber: "14.218",
            fain: "B-26-MC-11-0001",
            passThroughEntityName: "District of Columbia",
            expendituresCents: 82_500_000,
            metadataStatus: "complete",
            warnings: [],
          },
        ],
        warnings: [],
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown tripwire state", () => {
    expect(
      sefaTripwireResultSchema.safeParse({
        fiscalYear: "FY2026",
        periodStart: "2026-01-01T00:00:00.000Z",
        periodEnd: "2026-12-31T23:59:59.999Z",
        thresholdCents: 100_000_000,
        totalFederalExpendituresCents: 0,
        remainingToThresholdCents: 100_000_000,
        thresholdPercent: 0,
        state: "maybe",
        rows: [],
        warnings: [],
      }).success,
    ).toBe(false);
  });
});

describe("generatedReportListSchema", () => {
  it("applies list defaults", () => {
    const result = generatedReportListSchema.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(25);
      expect(result.data.sortBy).toBe("createdAt");
      expect(result.data.sortOrder).toBe("desc");
    }
  });

  it("accepts filters", () => {
    expect(
      generatedReportListSchema.safeParse({
        type: "board",
        status: "ready",
        page: "2",
        pageSize: "10",
      }).success,
    ).toBe(true);
  });
});

describe("acknowledgmentTemplateSchema", () => {
  it("requires intro, body, and closing copy", () => {
    expect(
      acknowledgmentTemplateSchema.safeParse({
        intro: "Thank you for your generosity.",
        body: "No goods or services were provided in exchange for this contribution.",
        closing: "With gratitude, GrantPipe Foundation",
      }).success,
    ).toBe(true);
    expect(acknowledgmentTemplateSchema.safeParse({ intro: "Only intro" }).success).toBe(false);
  });
});

describe("generateSpendDownReportSchema", () => {
  it("accepts grantId only", () => {
    expect(generateSpendDownReportSchema.safeParse({ grantId: "grant-1" }).success).toBe(true);
  });

  it("accepts all optional fields", () => {
    expect(
      generateSpendDownReportSchema.safeParse({
        grantId: "grant-1",
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-03-31T23:59:59.999Z",
        title: "Q1 Spend-Down Report",
      }).success,
    ).toBe(true);
  });

  it("rejects missing grantId", () => {
    expect(generateSpendDownReportSchema.safeParse({}).success).toBe(false);
  });

  it("rejects empty grantId", () => {
    expect(generateSpendDownReportSchema.safeParse({ grantId: "" }).success).toBe(false);
  });

  it("rejects invalid from date", () => {
    expect(
      generateSpendDownReportSchema.safeParse({ grantId: "grant-1", from: "not-a-date" }).success,
    ).toBe(false);
  });

  it("rejects invalid to date", () => {
    expect(
      generateSpendDownReportSchema.safeParse({ grantId: "grant-1", to: "2026-03-31" }).success,
    ).toBe(false);
  });

  it("rejects an inverted date range", () => {
    expect(
      generateSpendDownReportSchema.safeParse({
        grantId: "grant-1",
        from: "2026-04-01T00:00:00.000Z",
        to: "2026-03-31T23:59:59.999Z",
      }).success,
    ).toBe(false);
  });
});

describe("spendDownResultSchema", () => {
  it("accepts a full spend-down result", () => {
    expect(
      spendDownResultSchema.safeParse({
        budgetCents: 100000,
        expensesCents: 80000,
        remainingCents: 20000,
        burnRateCentsPerMonth: 10000,
        projectedExhaustionDate: "2026-06-01T00:00:00.000Z",
        thresholdState: "80",
        byCategory: [{ category: "Salaries", amountCents: 50000 }],
        byFund: [
          {
            fundId: "fund-1",
            fundName: "General Fund",
            allocatedAmountCents: 60000,
            expensesCents: 40000,
          },
        ],
        byMonth: [{ month: "2026-01", amountCents: 30000 }],
      }).success,
    ).toBe(true);
  });

  it("accepts null nullable fields", () => {
    expect(
      spendDownResultSchema.safeParse({
        budgetCents: null,
        expensesCents: 0,
        remainingCents: null,
        burnRateCentsPerMonth: null,
        projectedExhaustionDate: null,
        thresholdState: null,
        byCategory: [],
        byFund: [],
        byMonth: [],
      }).success,
    ).toBe(true);
  });

  it("rejects missing expensesCents", () => {
    expect(
      spendDownResultSchema.safeParse({
        budgetCents: null,
        remainingCents: null,
        burnRateCentsPerMonth: null,
        projectedExhaustionDate: null,
        thresholdState: null,
        byCategory: [],
        byFund: [],
        byMonth: [],
      }).success,
    ).toBe(false);
  });

  it("rejects fractional cents throughout spend-down money fields", () => {
    const base = {
      budgetCents: 100000,
      expensesCents: 80000,
      remainingCents: 20000,
      burnRateCentsPerMonth: 10000,
      projectedExhaustionDate: null,
      thresholdState: null,
      byCategory: [{ category: "Salaries", amountCents: 50000 }],
      byFund: [
        {
          fundId: "fund-1",
          fundName: "General Fund",
          allocatedAmountCents: 60000,
          expensesCents: 40000,
        },
      ],
      byMonth: [{ month: "2026-01", amountCents: 30000 }],
    };

    for (const invalid of [
      { ...base, budgetCents: 100000.5 },
      { ...base, expensesCents: 80000.5 },
      { ...base, remainingCents: 20000.5 },
      { ...base, burnRateCentsPerMonth: 10000.5 },
      { ...base, byCategory: [{ category: "Salaries", amountCents: 50000.5 }] },
      {
        ...base,
        byFund: [
          {
            fundId: "fund-1",
            fundName: "General Fund",
            allocatedAmountCents: 60000.5,
            expensesCents: 40000,
          },
        ],
      },
      {
        ...base,
        byFund: [
          {
            fundId: "fund-1",
            fundName: "General Fund",
            allocatedAmountCents: 60000,
            expensesCents: 40000.5,
          },
        ],
      },
      { ...base, byMonth: [{ month: "2026-01", amountCents: 30000.5 }] },
    ]) {
      expect(spendDownResultSchema.safeParse(invalid).success).toBe(false);
    }
  });
});

describe("generatedReportArtifactSchema", () => {
  it("accepts a ready report artifact", () => {
    expect(
      generatedReportArtifactSchema.safeParse({
        id: "report-1",
        type: "compliance",
        format: "pdf",
        status: "ready",
        title: "Q1 STEM Compliance Report",
        fileName: "q1-compliance.pdf",
        downloadPath: "/api/compliance/reports/report-1/download",
        previewPath: "/api/compliance/reports/report-1/preview",
        internalPath: "/reports/report-1",
        createdAt: "2026-04-07T12:00:00.000Z",
        grantId: "grant-1",
      }).success,
    ).toBe(true);
  });

  it("rejects unsupported artifact types", () => {
    expect(
      generatedReportArtifactSchema.safeParse({
        id: "report-1",
        type: "unknown",
        format: "pdf",
        status: "ready",
        title: "Bad",
        fileName: "bad.pdf",
        downloadPath: "/download",
        createdAt: "2026-04-07T12:00:00.000Z",
      }).success,
    ).toBe(false);
  });
});
