import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  restrictionAdditions,
  restrictionAllowedCategories,
  restrictionAllowedPrograms,
  restrictionBalances,
  restrictionEvidenceLinks,
  restrictionReleases,
  restrictionTerms,
} from "./restrictions";

function columnSqlType(column: { getSQLType: () => string }) {
  return column.getSQLType();
}

describe("restriction lifecycle schema", () => {
  it("defines org-scoped, soft-delete aware restriction terms", () => {
    expect(restrictionTerms.orgId.name).toBe("org_id");
    expect(restrictionTerms.fundId.name).toBe("fund_id");
    expect(restrictionTerms.grantId.name).toBe("grant_id");
    expect(restrictionTerms.donationId.name).toBe("donation_id");
    expect(restrictionTerms.sourceDocumentId.name).toBe("source_document_id");
    expect(restrictionTerms.restrictionType.name).toBe("restriction_type");
    expect(restrictionTerms.source.name).toBe("source");
    expect(columnSqlType(restrictionTerms.beginningBalanceCents)).toBe("bigint");
    expect(restrictionTerms.deletedAt.name).toBe("deleted_at");
  });

  it("uses cents-based money columns for every restriction amount", () => {
    expect(columnSqlType(restrictionBalances.beginningBalanceCents)).toBe("bigint");
    expect(columnSqlType(restrictionBalances.additionsCents)).toBe("bigint");
    expect(columnSqlType(restrictionBalances.releasesCents)).toBe("bigint");
    expect(columnSqlType(restrictionBalances.endingBalanceCents)).toBe("bigint");
    expect(columnSqlType(restrictionAdditions.amountCents)).toBe("bigint");
    expect(columnSqlType(restrictionReleases.amountCents)).toBe("bigint");
  });

  it("deduplicates a term balance within one generated report", () => {
    const reportTermIndex = getTableConfig(restrictionBalances).indexes.find(
      (index) => index.config.name === "restriction_balances_report_term_idx",
    );
    expect(reportTermIndex?.config.unique).toBe(true);
    expect(
      reportTermIndex?.config.columns.map((column) => ("name" in column ? column.name : null)),
    ).toEqual(["generated_report_id", "restriction_term_id"]);
    expect(reportTermIndex?.config.where).toBeDefined();
  });

  it("tracks whether restriction releases were created manually or by automation", () => {
    expect(restrictionReleases.source.name).toBe("source");
    expect(columnSqlType(restrictionReleases.source)).toBe("text");
  });

  it("keeps transaction and evidence records org scoped and soft deletable", () => {
    for (const table of [
      restrictionBalances,
      restrictionAdditions,
      restrictionReleases,
      restrictionEvidenceLinks,
      restrictionAllowedPrograms,
      restrictionAllowedCategories,
    ]) {
      expect(table.orgId.name).toBe("org_id");
      expect(table.deletedAt.name).toBe("deleted_at");
    }
  });

  it("supports polymorphic evidence targets without duplicating files", () => {
    expect(restrictionEvidenceLinks.documentId.name).toBe("document_id");
    expect(restrictionEvidenceLinks.generatedReportId.name).toBe("generated_report_id");
    expect(restrictionEvidenceLinks.restrictionReleaseId.name).toBe("restriction_release_id");
  });
});
